// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, HEvent, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, FailuresConsumer } from '@flybywiresim/fbw-sdk';
import {
  computeDisplayPictures,
  DISPLAY_UNITS,
  displayUnitPictureVar,
  DisplayUnitId,
  ECAM_ND_XFR_KNOB_VAR,
  EIS_PICTURES,
  EfisSideLetter,
  encodeDisplayUnitPicture,
  isDisplayUnitAvailable,
  isEcamPagePbHoldActive,
  isEcamPagePbHoldConfirmed,
  nextEcamPagePbHeldSeconds,
  nextPfdNdXfr,
  pfdNdXfrPushedEvent,
  pfdNdXfrVar,
  pictureOnOtherDuVar,
  picturesShownOnOtherDu,
} from '../../../shared/src/DisplayReconfiguration';
import {
  LOWER_ECAM_DISPLAY_UNIT_FAILURE,
  ndDisplayUnitFailure,
  pfdDisplayUnitFailure,
  UPPER_ECAM_DISPLAY_UNIT_FAILURE,
} from '../../../instruments/src/MsfsAvionicsCommon/displayUnitFailures';

/** What makes a DU available: its flyPad failure, its power supply and its brightness knob (LIGHT POTENTIOMETER). */
export interface DisplayUnitSources {
  readonly failure: number;
  readonly powerVar: string;
  readonly potentiometer: number;
}

/**
 * The failure, power and brightness knob of each DU: the same sources as the DisplayUnit of the gauge that drives it
 * (PFD/ND simvar publishers, EwdSimvarPublisher, SDSimvarPublisher), so that a DU this module counts as available is
 * the DU the gauge shows as ON.
 */
export const A320_DISPLAY_UNIT_SOURCES: Readonly<Record<DisplayUnitId, DisplayUnitSources>> = {
  PFD_L: { failure: pfdDisplayUnitFailure(1), powerVar: 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED', potentiometer: 88 },
  ND_L: { failure: ndDisplayUnitFailure(1), powerVar: 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED', potentiometer: 89 },
  UPPER_ECAM: {
    failure: UPPER_ECAM_DISPLAY_UNIT_FAILURE,
    powerVar: 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED',
    potentiometer: 92,
  },
  LOWER_ECAM: {
    failure: LOWER_ECAM_DISPLAY_UNIT_FAILURE,
    powerVar: 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED',
    potentiometer: 93,
  },
  ND_R: { failure: ndDisplayUnitFailure(2), powerVar: 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED', potentiometer: 91 },
  PFD_R: { failure: pfdDisplayUnitFailure(2), powerVar: 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED', potentiometer: 90 },
};

/** The ECP system page keys in L:A32NX_ECP_SYSTEM_SWITCH_WORD (ENG to WHEEL, as read by DmcSdPageLogic). */
const ECP_SYSTEM_PAGE_BITS = [11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22];

/** The STS key in L:A32NX_ECP_WARNING_SWITCH_WORD: it calls the status page, which the held page pb also displays. */
const ECP_STS_BIT = 13;

/**
 * Whether a system page pb (or STS) of the ECAM control panel is pushed now: the ECP outputs a key as pressed while it
 * is held (Ecp.ts, PRESSED/RELEASED H events).
 */
export function isSystemPagePbPushed(systemSwitchWord: Arinc429Register, warningSwitchWord: Arinc429Register): boolean {
  return (
    ECP_SYSTEM_PAGE_BITS.some((bit) => systemSwitchWord.bitValueOr(bit, false)) ||
    warningSwitchWord.bitValueOr(ECP_STS_BIT, false)
  );
}

/** The failures this module reads. */
export type DisplayUnitFailureStates = Pick<FailuresConsumer, 'update' | 'isActive'>;

/**
 * The DU reconfiguration part of the DMCs (A320 FCOM DSC-31-05-60 RECONFIGURING DUS, see DisplayReconfiguration.ts):
 * computes the picture of each DU from the DU availability, the ECAM/ND XFR selector, the PFD/ND XFR pbs and the ECAM
 * control panel, and writes it in the DU picture L:vars read by the cockpit model (the glass each DU shows), and whether
 * each picture is shown on another DU (its gauge then keeps drawing). Writes the PFD/ND XFR
 * state of each side too (SWITCHING PNL memo).
 */
export class DmcDisplayReconfiguration {
  private readonly pfdNdXfr: Record<EfisSideLetter, boolean> = { L: false, R: false };

  private readonly pfdNdXfrPushed: Record<EfisSideLetter, boolean> = { L: false, R: false };

  /** The PFD DU availability at the last update, null before the first one */
  private readonly pfdWasAvailable: Record<EfisSideLetter, boolean | null> = { L: null, R: null };

  private ecamPagePbHeldSeconds = 0;

  private readonly systemSwitchWord = Arinc429Register.empty();

  private readonly warningSwitchWord = Arinc429Register.empty();

  /** The values last written, so that each L:var is only written when it changes */
  private readonly writtenValues = new Map<string, number>();

  constructor(
    bus: EventBus,
    private readonly failures: DisplayUnitFailureStates = new FailuresConsumer(),
  ) {
    bus
      .getSubscriber<HEvent>()
      .on('hEvent')
      .handle((event) => {
        if (event === pfdNdXfrPushedEvent('L')) {
          this.pfdNdXfrPushed.L = true;
        } else if (event === pfdNdXfrPushedEvent('R')) {
          this.pfdNdXfrPushed.R = true;
        }
      });
  }

  public init(): void {
    // the DU picture L:vars start at 0 (every DU on its own picture) until the first update
  }

  /**
   * One DMC update.
   * @param dt the time since the last update, in milliseconds
   */
  public update(dt: number): void {
    this.failures.update();

    const available = {} as Record<DisplayUnitId, boolean>;
    for (const du of DISPLAY_UNITS) {
      const sources = A320_DISPLAY_UNIT_SOURCES[du];
      available[du] = isDisplayUnitAvailable(
        this.failures.isActive(sources.failure),
        SimVar.GetSimVarValue(sources.powerVar, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`LIGHT POTENTIOMETER:${sources.potentiometer}`, SimVarValueType.Number),
      );
    }

    for (const side of ['L', 'R'] as const) {
      const pfdAvailable = available[side === 'L' ? 'PFD_L' : 'PFD_R'];
      const wasAvailable = this.pfdWasAvailable[side] ?? pfdAvailable;
      this.pfdNdXfr[side] = nextPfdNdXfr(this.pfdNdXfr[side], this.pfdNdXfrPushed[side], wasAvailable, pfdAvailable);
      this.pfdNdXfrPushed[side] = false;
      this.pfdWasAvailable[side] = pfdAvailable;
      this.write(pfdNdXfrVar(side), this.pfdNdXfr[side] ? 1 : 0);
    }

    this.systemSwitchWord.setFromSimVar('L:A32NX_ECP_SYSTEM_SWITCH_WORD');
    this.warningSwitchWord.setFromSimVar('L:A32NX_ECP_WARNING_SWITCH_WORD');
    const pagePbPushed = isSystemPagePbPushed(this.systemSwitchWord, this.warningSwitchWord);
    this.ecamPagePbHeldSeconds = nextEcamPagePbHeldSeconds(this.ecamPagePbHeldSeconds, pagePbPushed, dt / 1000);

    const inputs = {
      available,
      ecamNdXfrKnob: SimVar.GetSimVarValue(ECAM_ND_XFR_KNOB_VAR, SimVarValueType.Enum),
      pfdNdXfrL: this.pfdNdXfr.L,
      pfdNdXfrR: this.pfdNdXfr.R,
    };
    // the SD is displayed once the page pb hold is confirmed ...
    const pictures = computeDisplayPictures({
      ...inputs,
      ecamPagePbHeld: isEcamPagePbHoldConfirmed(pagePbPushed, this.ecamPagePbHeldSeconds),
    });
    // ... but its gauge draws from the push on, so that it shows the new page, not the last one, when it appears
    const picturesWhenHeld = computeDisplayPictures({
      ...inputs,
      ecamPagePbHeld: isEcamPagePbHoldActive(pagePbPushed, this.ecamPagePbHeldSeconds),
    });

    for (const du of DISPLAY_UNITS) {
      this.write(displayUnitPictureVar(du), encodeDisplayUnitPicture(du, pictures[du], available[du]));
    }

    const shownOnOtherDu = picturesShownOnOtherDu(pictures, available);
    const shownOnOtherDuWhenHeld = picturesShownOnOtherDu(picturesWhenHeld, available);
    for (const picture of EIS_PICTURES) {
      this.write(pictureOnOtherDuVar(picture), shownOnOtherDu[picture] || shownOnOtherDuWhenHeld[picture] ? 1 : 0);
    }
  }

  private write(name: string, value: number): void {
    if (this.writtenValues.get(name) !== value) {
      this.writtenValues.set(name, value);
      SimVar.SetSimVarValue(name, SimVarValueType.Number, value);
    }
  }
}
