// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates } from 'msfs-geo';
import { Database, IlsNavaid } from '@flybywiresim/fbw-sdk';
import { NavaidTuner } from '@fmgc/navigation/NavaidTuner';
import { GlsManualEntryField } from '@fmgc/navigation/LandingSystemTuning';
import { lsFrequencyEnteredByPilot, lsIdentEnteredByPilot } from '@fmgc/navigation/LandingSystemTexts';
import { RPI_PATTERN } from '@fmgc/navigation/gls/ManualGlsEntry';
import { createGbasTableAirportLoader, tuneManualGls } from '@fmgc/navigation/gls/ManualGlsTuning';
import { GBAS_CHANNEL_MIN } from '../../../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { NXFictionalMessages, NXSystemMessages, TypeIMessage } from '../../../shared/NXSystemMessages';

/** What the LS IDENT and FREQ/CHAN fields of the POSITION/NAVAIDS page need from the FMS */
export interface ManualLandingSystemEntryContext {
  getNavaidTuner: () => Pick<
    NavaidTuner,
    'isMmrTuningLocked' | 'getMmrRadioTuningStatus' | 'setManualIls' | 'setManualGls'
  >;
  getFlightPlans: () => {
    readonly hasActive: boolean;
    readonly active: { readonly destinationAirport?: { ident: string }; readonly originAirport?: { ident: string } };
  };
  /** null while the position is not known */
  getPresentPosition: () => Coordinates | null;
  getDatabase: () => Pick<Database, 'getILSs' | 'getAirports' | 'getRunways'>;
  /** Lets the crew choose when several landing systems have the ident; resolves with nothing when they cancel */
  chooseFacility: (facilities: IlsNavaid[]) => Promise<IlsNavaid | undefined>;
  showMessage: (message: TypeIMessage) => void;
}

/**
 * The crew entries of the LS IDENT and FREQ/CHAN fields of the POSITION/NAVAIDS page. Both entries resolve with false
 * when the entry is refused: the field then keeps what it showed before.
 */
export class ManualLandingSystemEntry {
  /** The table airports with their positions, for a channel that is not at the destination */
  private readonly loadTableAirports = createGbasTableAirportLoader(() => this.context.getDatabase());

  constructor(private readonly context: ManualLandingSystemEntryContext) {}

  /** @param ident the ident of an ILS or the reference path identifier of a GLS; nothing clears the field */
  public enterIdent(ident: string | null): Promise<boolean> {
    return this.refuseOnFailure(this.applyIdent(ident));
  }

  /** @param value an ILS frequency or a GLS channel; nothing clears the field */
  public enterFrequencyOrChannel(value: number | null): Promise<boolean> {
    return this.refuseOnFailure(this.applyFrequencyOrChannel(value));
  }

  /** A failed database lookup must not leave the typed text in the field as if it were tuned */
  private async refuseOnFailure(entry: Promise<boolean>): Promise<boolean> {
    try {
      const applied = await entry;
      return applied;
    } catch (error) {
      console.error(error);
      this.context.showMessage(NXFictionalMessages.internalError);
      return false;
    }
  }

  private async applyIdent(ident: string | null): Promise<boolean> {
    const navaidTuner = this.context.getNavaidTuner();
    if (navaidTuner.isMmrTuningLocked()) {
      return this.refuse(NXSystemMessages.notAllowed);
    }

    if (ident === null || ident === '') {
      return this.clearManualTuning(lsIdentEnteredByPilot(navaidTuner.getMmrRadioTuningStatus(1)));
    }

    // An entry of RPI shape that is no GLS of the destination or origin is still looked up as an ILS ident
    if (RPI_PATTERN.test(ident)) {
      const result = await this.tuneGls(ident, 'ident');
      if (result !== 'unknown-rpi') {
        return this.concludeGlsEntry(result);
      }
    }

    const ils = await this.context.getDatabase().getILSs([ident]);
    if (ils.length === 0) {
      return this.refuse(NXSystemMessages.notInDatabase);
    }
    const chosenIls = await this.chooseLandingSystem(ils);
    if (!chosenIls) {
      return false;
    }
    await navaidTuner.setManualIls(chosenIls);
    return true;
  }

  private async applyFrequencyOrChannel(value: number | null): Promise<boolean> {
    const navaidTuner = this.context.getNavaidTuner();
    if (navaidTuner.isMmrTuningLocked()) {
      return this.refuse(NXSystemMessages.notAllowed);
    }

    if (value === null) {
      return this.clearManualTuning(lsFrequencyEnteredByPilot(navaidTuner.getMmrRadioTuningStatus(1)));
    }
    if (value >= GBAS_CHANNEL_MIN) {
      const result = await this.tuneGls(value, 'channel');
      return this.concludeGlsEntry(result);
    }
    navaidTuner.setManualIls(value);
    return true;
  }

  private refuse(message: TypeIMessage): boolean {
    this.context.showMessage(message);
    return false;
  }

  /** Only a field the crew filled can be cleared */
  private clearManualTuning(fieldEnteredByPilot: boolean): boolean {
    if (!fieldEnteredByPilot) {
      return this.refuse(NXSystemMessages.notAllowed);
    }
    this.context.getNavaidTuner().setManualIls(null);
    return true;
  }

  /** @returns nothing when the crew cancelled the choice, or when another lookup took the choice over */
  private async chooseLandingSystem(candidates: IlsNavaid[]): Promise<IlsNavaid | undefined> {
    try {
      const chosen = await this.context.chooseFacility(candidates);
      return chosen;
    } catch (_takenOver) {
      // The choice is rejected when another lookup needs it: that one tells the crew, this entry is only dropped
      return undefined;
    }
  }

  /** Tunes the GLS that the crew entered as a channel or a reference path identifier */
  private tuneGls(entry: string | number, field: GlsManualEntryField): ReturnType<typeof tuneManualGls> {
    const navaidTuner = this.context.getNavaidTuner();
    const flightPlans = this.context.getFlightPlans();
    // Without an active flight plan there is no destination or origin: the channel is then found by the position
    const plan = flightPlans.hasActive ? flightPlans.active : null;
    return tuneManualGls(entry, field, {
      destinationIdent: plan?.destinationAirport?.ident ?? null,
      originIdent: plan?.originAirport?.ident ?? null,
      presentPosition: this.context.getPresentPosition(),
      loadTableAirports: this.loadTableAirports,
      loadRunways: (airportIdent) => this.context.getDatabase().getRunways(airportIdent),
      isTuningLocked: () => navaidTuner.isMmrTuningLocked(),
      setManualGls: (gls, manualField) => navaidTuner.setManualGls(gls, manualField),
    });
  }

  private concludeGlsEntry(result: Awaited<ReturnType<typeof tuneManualGls>>): boolean {
    switch (result) {
      case 'tuned':
        return true;
      case 'locked':
        return this.refuse(NXSystemMessages.notAllowed);
      case 'invalid':
        return this.refuse(NXSystemMessages.entryOutOfRange);
      default:
        return this.refuse(NXSystemMessages.notInDatabase);
    }
  }
}
