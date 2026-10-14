// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';

/*
 * AIR APU BLEED FAULT of the A380 FWS (A380 FCOM PRO-ABN-ECAM-10-36, a380_fcom.txt l.167685-167734; procedure on PDF page
 * 5665): "One of the following occurs: - The APU is running, and: The APU bleed valve is abnormally open(closed), or The
 * APU isolation valve is abnormally open(closed), or The APU bleed valve and the APU isolation valve are abnormally open.
 * - The APU BLEED pb-sw is ON, while the altitude is not within the APU operational envelope."
 *
 * The envelope case was already there (FwsCore apuBleedPbOnOver22500ft). This module adds the abnormal valve position
 * (the gap B18 of the FCOM audit): the APU bleed valve open while the APU ECB commands it closed, or closed while it
 * commands it open (a380_systems apu_bleed_air_valve.rs: L:A32NX_APU_BLEED_AIR_VALVE_OPEN and
 * L:A32NX_APU_BLEED_AIR_VALVE_COMMANDED_OPEN; flyPad failures "APU bleed valve stuck closed / open").
 *
 * Design choices:
 * - "The APU is running": the APU AVAIL (L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE).
 * - The disagreement is confirmed for 10 s, as the CPIOM-A engine bleed valve position monitoring (a380_systems
 *   pneumatic.rs BLEED_VALVE_POSITION_DISAGREE_CONFIRMATION).
 * - The model has one valve for the APU bleed valve and the APU isolation valve: the APU ISOL VLV lines are not shown.
 */

/** The confirmation time of an abnormal APU bleed valve position, s (see the file comment) */
export const APU_BLEED_VALVE_DISAGREE_CONFIRMATION_S = 10;

export interface ApuBleedValveInputs {
  /** The APU is running: APU AVAIL */
  apuRunning: boolean;
  /** L:A32NX_APU_BLEED_AIR_VALVE_OPEN */
  valveOpen: boolean;
  /** L:A32NX_APU_BLEED_AIR_VALVE_COMMANDED_OPEN */
  valveCommandedOpen: boolean;
}

/** The abnormal APU bleed valve position, confirmed */
export class ApuBleedValvePositionMonitor {
  private readonly abnormallyOpenConfirmNode = new NXLogicConfirmNode(APU_BLEED_VALVE_DISAGREE_CONFIRMATION_S);

  private readonly abnormallyClosedConfirmNode = new NXLogicConfirmNode(APU_BLEED_VALVE_DISAGREE_CONFIRMATION_S);

  /** The APU bleed valve is open while the ECB commands it closed */
  public abnormallyOpen = false;

  /** The APU bleed valve is closed while the ECB commands it open */
  public abnormallyClosed = false;

  /**
   * @param inputs the APU and valve state of this frame
   * @param deltaTimeMs the frame time in milliseconds (as the NXLogic nodes take it)
   */
  public update(inputs: ApuBleedValveInputs, deltaTimeMs: number): void {
    this.abnormallyOpen = this.abnormallyOpenConfirmNode.write(
      inputs.apuRunning && inputs.valveOpen && !inputs.valveCommandedOpen,
      deltaTimeMs,
    );
    this.abnormallyClosed = this.abnormallyClosedConfirmNode.write(
      inputs.apuRunning && !inputs.valveOpen && inputs.valveCommandedOpen,
      deltaTimeMs,
    );
  }
}

/** AIR APU BLEED FAULT is triggered: the envelope case or an abnormal valve position */
export function isApuBleedFault(
  apuBleedPbOnOutsideEnvelope: boolean,
  monitor: Pick<ApuBleedValvePositionMonitor, 'abnormallyOpen' | 'abnormallyClosed'>,
): boolean {
  return apuBleedPbOnOutsideEnvelope || monitor.abnormallyOpen || monitor.abnormallyClosed;
}

export interface ApuBleedFaultItemInputs {
  abnormallyOpen: boolean;
  /** The aircraft is above FL 225 (the ADR pressure altitude above 22 500 ft) */
  aboveFl225: boolean;
  apuBleedPbOn: boolean;
}

/**
 * The items of AIR APU BLEED FAULT (ata21-22-23 211800051): 0 APU ISOL VLV NOT CLOSED, 1 APU BLEED VLV NOT CLOSED, 2 APU
 * ISOL VLV NOT OPEN, 3 APU BLEED VLV NOT OPEN, 4 APU BLEED OFF, 5 APU BLEED AVAIL BELOW FL225.
 * PDF page 5665 (l.167723-167734): "If the APU bleed valve is abnormally open: APU BLEED VLV NOT CLOSED. Otherwise: APU
 * BLEED ... OFF. If the APU bleed valve, or the APU isolation valve is closed, and the aircraft is above FL 225: APU
 * BLEED AVAIL BELOW FL 225". The NOT OPEN lines are not in the FCOM: never shown.
 * Before 2026-10-13 only the envelope case was wired: APU BLEED OFF, and APU BLEED AVAIL BELOW FL225 above FL 225 (kept).
 */
export function apuBleedFaultItems(inputs: ApuBleedFaultItemInputs): { show: boolean[]; checked: boolean[] } {
  const otherwise = !inputs.abnormallyOpen;
  return {
    show: [false, inputs.abnormallyOpen, false, false, otherwise, otherwise && inputs.aboveFl225],
    checked: [false, false, false, false, !inputs.apuBleedPbOn, false],
  };
}
