// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isXpdrTcasPowered, SurvSystem } from '../../Misc/Communications/TransponderSystem';

/**
 * Decision logic of the SURV XPDR and TCAS alerts of the FWS, one state per surveillance system (A380 FCOM
 * PRO-ABN-ECAM-10-34-20). Each SURV system has its own XPDR and TCAS: SURV SYS 1 on AC ESS, SURV SYS 2 on AC 4
 * (DSC-34-20-100, a380_fcom.txt:92741-92743).
 */

/** The SYS 1, SYS 2 and SYS 1+2 alerts made from the fault conditions of both systems. */
export interface SurvFaultAlerts {
  /** The SYS 1 alert (e.g. SURV TCAS 1 FAULT): SYS 1 faulty, SYS 2 not */
  sys1: boolean;
  /** The SYS 2 alert: SYS 2 faulty, SYS 1 not */
  sys2: boolean;
  /** The SYS 1+2 alert: both faulty */
  sys1And2: boolean;
}

/**
 * Splits the fault conditions of both systems into the 1, 2 and 1+2 alerts, which never show together.
 * @param sys1Condition the fault condition of SURV SYS 1
 * @param sys2Condition the fault condition of SURV SYS 2
 * @returns the alerts
 */
export function splitSurvFaults(sys1Condition: boolean, sys2Condition: boolean): SurvFaultAlerts {
  return {
    sys1: sys1Condition && !sys2Condition,
    sys2: sys2Condition && !sys1Condition,
    sys1And2: sys1Condition && sys2Condition,
  };
}

/**
 * The fault condition of SURV XPDR 1(2) FAULT. FCOM a380_fcom.txt:167287: "The XPDR function of SURV SYS 1(2) is
 * failed". The XPDR is also lost with its busbar, but ELEC AC ESS BUS FAULT already lists XPDR 1 and TCAS 1
 * (a380_fcom.txt:139256-139275), so like the TCAS alerts the condition needs the busbar of that system powered.
 * @param system the surveillance system
 * @param xpdrFailed whether the XPDR of that system is failed or unpowered (L:A32NX_XPDR_n_FAILED)
 * @param acEssPowered whether the AC ESS busbar (400XP) is powered
 * @param ac4Powered whether the AC 4 busbar is powered
 * @returns whether the XPDR fault alert condition of that system is true
 */
export function xpdrFaultCondition(
  system: SurvSystem,
  xpdrFailed: boolean,
  acEssPowered: boolean,
  ac4Powered: boolean,
): boolean {
  return xpdrFailed && isXpdrTcasPowered(system, acEssPowered, ac4Powered);
}

/**
 * The fault condition of SURV TCAS 1(2) FAULT. FCOM a380_fcom.txt:166890: "The TCAS surveillance function of SURV
 * system 1(2) is failed". Needs the busbar of that system powered (ELEC AC ESS BUS FAULT lists TCAS 1 itself,
 * a380_fcom.txt:139256-139275) and at least one valid radio altimeter.
 * @param system the surveillance system
 * @param tcasInopConfirmed the TCAS of that system inoperative, after the ADR/IR inhibit confirm node of the FWS
 * @param allRaInvalid whether all radio altimeters are invalid
 * @param acEssPowered whether the AC ESS busbar (400XP) is powered
 * @param ac4Powered whether the AC 4 busbar is powered
 * @returns whether the TCAS fault alert condition of that system is true
 */
export function tcasFaultCondition(
  system: SurvSystem,
  tcasInopConfirmed: boolean,
  allRaInvalid: boolean,
  acEssPowered: boolean,
  ac4Powered: boolean,
): boolean {
  return !allRaInvalid && tcasInopConfirmed && isXpdrTcasPowered(system, acEssPowered, ac4Powered);
}

/**
 * Whether the STATUS of a SURV XPDR/TCAS 1(2) FAULT lists AP/FD TCAS MODE: "If the XPDR/TCAS is selected on SYS 1(2)"
 * (a380_fcom.txt:166923-166924, 167321-167322).
 * @param failedSystem the system of the alert
 * @param selectedSystem the XPDR & TCAS system in use
 * @returns whether AP/FD TCAS MODE is inoperative
 */
export function isApFdTcasModeInop(failedSystem: SurvSystem, selectedSystem: SurvSystem): boolean {
  return failedSystem === selectedSystem;
}

/**
 * The "XPDR & TCAS ..... SYS 2(1)" line of SURV TCAS 1(2) FAULT and SURV XPDR 1(2) FAULT: shown "If the XPDR/TCAS is
 * selected on SYS 1(2), and if the XPDR/TCAS on SYS 2(1) [the XPDR 2(1)] is operative" (a380_fcom.txt:166912-166914,
 * 167297-167298). The FWS evaluates the lines on every update, so once the crew selects the other system the line
 * would vanish instead of showing as done: it stays shown (and ticked) while the alert is active, unless the other
 * system fails as well.
 */
export class XpdrTcasSwitchLine {
  private shown = false;

  /**
   * @param failedSystem the system of the alert (SYS 1 for the TCAS 1 / XPDR 1 FAULT alert)
   */
  constructor(private readonly failedSystem: SurvSystem) {}

  /**
   * Updates the line once per FWS update.
   * @param alertActive whether the fault condition of the alert is true
   * @param selectedSystem the XPDR & TCAS system in use
   * @param otherSystemOperative whether the XPDR/TCAS (TCAS alert) or the XPDR (XPDR alert) of the other system is
   * operative
   */
  public update(alertActive: boolean, selectedSystem: SurvSystem, otherSystemOperative: boolean): void {
    this.shown = alertActive && otherSystemOperative && (this.shown || selectedSystem === this.failedSystem);
  }

  /** @returns whether the line is shown */
  public isShown(): boolean {
    return this.shown;
  }

  /**
   * @param selectedSystem the XPDR & TCAS system in use
   * @returns whether the line is done: the other system is selected
   */
  public isChecked(selectedSystem: SurvSystem): boolean {
    return selectedSystem !== this.failedSystem;
  }
}
