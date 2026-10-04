// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, HEvent, Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import {
  ALL_DISPLAY_UNITS,
  DisplayUnitFailure,
  DisplayUnitID,
  displayUnitDisplayVar,
  isDisplayUnitPowered,
} from '@shared/CdsDisplayUnits';
import { DcElectricalBus } from '@shared/electrical';
import { CdsReconfigurationState, CdsSide, DisplayUnitMap, encodeDisplay } from '@shared/CdsReconfiguration';

/** The cockpit light potentiometer of each DU's brightness knob (inner knob: "Turns on or off" the DU) */
const DisplayUnitPotentiometer: Readonly<Record<DisplayUnitID, number>> = {
  [DisplayUnitID.CaptPfd]: 88,
  [DisplayUnitID.CaptNd]: 89,
  [DisplayUnitID.CaptMfd]: 98,
  [DisplayUnitID.FoPfd]: 90,
  [DisplayUnitID.FoNd]: 91,
  [DisplayUnitID.FoMfd]: 99,
  [DisplayUnitID.Ewd]: 92,
  [DisplayUnitID.Sd]: 93,
};

/** The H: events of the PFD/ND pb and DU RECONF pb of each side (cockpit behaviour, EFIS panels) */
export const PFD_ND_PB_EVENT: Readonly<Record<CdsSide, string>> = {
  CAPT: 'A380X_EFIS_L_PFD_ND_PUSHED',
  FO: 'A380X_EFIS_R_PFD_ND_PUSHED',
};
export const DU_RECONF_PB_EVENT: Readonly<Record<CdsSide, string>> = {
  CAPT: 'A380X_EFIS_L_DU_RECONF_PUSHED',
  FO: 'A380X_EFIS_R_DU_RECONF_PUSHED',
};

/** How often the DU states are read without a pb press, ms (a reconfiguration may lag by this much) */
const UPDATE_PERIOD_MS = 200;

/**
 * The CDS display unit reconfiguration (A380 FCOM DSC-31-15-20, logic in shared/src/CdsReconfiguration.ts): reads the DU
 * states and the PFD/ND and DU RECONF pbs, and writes the display of each DU into L:A380X_CDS_{DU}_DU_DISPLAY, which
 * the display gauges read to show or hide (each display is a gauge of its own; panel.cfg puts the PFD on the ND DUs,
 * the ND on the PFD DUs and the EWD on the SD DU as extra gauges that only run while they are shown).
 * Each variable stays 0 (its own display) in normal operation.
 */
export class CdsReconfiguration implements Instrument {
  private readonly state: CdsReconfigurationState;

  /** The values written, so a variable is only written when it changes */
  private readonly written: Partial<Record<DisplayUnitID, number>> = {};

  private lastUpdateMs = -Infinity;

  /**
   * The pb presses since the last update, applied on the next update after the DU states are read: a press acts on the
   * DUs as they are at that moment, also a DU that failed less than one update period ago.
   */
  private readonly pendingPresses: { pb: 'PFD_ND' | 'DU_RECONF'; side: CdsSide }[] = [];

  constructor(
    private readonly bus: EventBus,
    private readonly failuresConsumer: FailuresConsumer,
  ) {
    this.state = new CdsReconfigurationState(this.readOperative());
  }

  /** @inheritdoc */
  init(): void {
    this.bus
      .getSubscriber<HEvent>()
      .on('hEvent')
      .handle((event) => {
        for (const side of ['CAPT', 'FO'] as const) {
          if (event.endsWith(PFD_ND_PB_EVENT[side])) {
            this.pendingPresses.push({ pb: 'PFD_ND', side });
          } else if (event.endsWith(DU_RECONF_PB_EVENT[side])) {
            this.pendingPresses.push({ pb: 'DU_RECONF', side });
          }
        }
      });
  }

  /** @inheritdoc */
  onUpdate(): void {
    const now = Date.now();
    if (this.pendingPresses.length === 0 && now - this.lastUpdateMs < UPDATE_PERIOD_MS) {
      return;
    }
    this.lastUpdateMs = now;

    let displays = this.state.update(this.readOperative());
    if (this.pendingPresses.length > 0) {
      for (const { pb, side } of this.pendingPresses) {
        if (pb === 'PFD_ND') {
          this.state.pressPfdNd(side);
        } else {
          this.state.pressDuReconf(side);
        }
      }
      this.pendingPresses.length = 0;
      displays = this.state.displays();
    }
    for (const du of ALL_DISPLAY_UNITS) {
      const value = encodeDisplay(du, displays[du]);
      if (this.written[du] !== value) {
        this.written[du] = value;
        SimVar.SetSimVarValue(displayUnitDisplayVar(du), SimVarValueType.Number, value);
      }
    }
  }

  /**
   * Whether each DU can show a picture: powered (its DC busbars, FCOM DSC-31-15-95), not failed (flyPad ATA 31) and not
   * switched off with its brightness knob ("If the PFD DU is turned OFF, the PFD is automatically displayed on the ND
   * DU", a380_fcom.txt:157938-157946)
   * @returns the state of each DU
   */
  private readOperative(): DisplayUnitMap<boolean> {
    const isBusPowered = (bus: DcElectricalBus) =>
      SimVar.GetSimVarValue(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 'Bool') > 0;
    const operative = {} as DisplayUnitMap<boolean>;
    for (const du of ALL_DISPLAY_UNITS) {
      operative[du] =
        isDisplayUnitPowered(du, isBusPowered) &&
        !this.failuresConsumer.isActive(DisplayUnitFailure[du]) &&
        SimVar.GetSimVarValue(`LIGHT POTENTIOMETER:${DisplayUnitPotentiometer[du]}`, 'percent over 100') > 0;
    }
    return operative;
  }
}
