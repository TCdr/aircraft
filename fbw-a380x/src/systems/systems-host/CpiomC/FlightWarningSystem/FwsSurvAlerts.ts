// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isXpdrTcasPowered, SurvSystem } from '../../Misc/Communications/TransponderSystem';

/**
 * Decision logic of the SURV XPDR and TCAS alerts of the FWS, one state per surveillance system. Each SURV system has
 * its own XPDR and TCAS: SURV SYS 1 on AC ESS, SURV SYS 2 on AC 4.
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
 * The fault condition of SURV XPDR 1(2) FAULT: the XPDR function of that SURV system has failed. The XPDR is also
 * lost with its busbar, but ELEC AC ESS BUS FAULT already lists XPDR 1 and TCAS 1, so like the TCAS alerts the
 * condition needs the busbar of that system powered.
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
 * The fault condition of SURV TCAS 1(2) FAULT: the TCAS surveillance function of that SURV system has failed. Needs
 * the busbar of that system powered (ELEC AC ESS BUS FAULT lists TCAS 1 itself) and at least one valid radio
 * altimeter.
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
 * Whether the STATUS of a SURV XPDR/TCAS 1(2) FAULT lists AP/FD TCAS MODE: only while the XPDR/TCAS of the failed
 * system is the one in use.
 * @param failedSystem the system of the alert
 * @param selectedSystem the XPDR & TCAS system in use
 * @returns whether AP/FD TCAS MODE is inoperative
 */
export function isApFdTcasModeInop(failedSystem: SurvSystem, selectedSystem: SurvSystem): boolean {
  return failedSystem === selectedSystem;
}

/**
 * The "XPDR & TCAS ..... SYS 2(1)" line of SURV TCAS 1(2) FAULT and SURV XPDR 1(2) FAULT: shown while the failed
 * system is in use and the XPDR/TCAS (XPDR alert: the XPDR) of the other system is operative. The FWS evaluates the
 * lines on every update, so once the crew selects the other system the line would vanish instead of showing as done:
 * it stays shown (and ticked) while the alert is active, unless the other system fails as well.
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

/** The TAWS functions lost on one SURV system, each reported by one alert only. */
export interface TawsFunctionFaults {
  /** SURV TAWS 1(2) FAULT: the whole TAWS function (GPWS and TERR SYS) of that SURV system has failed */
  taws: boolean;
  /** SURV GPWS 1(2) FAULT: the GPWS has failed, the TERR SYS still works */
  gpws: boolean;
  /** SURV TERR SYS 1(2) FAULT, the GPWS still working */
  terr: boolean;
}

/**
 * The fault conditions of the TAWS of one SURV system. GPWS and TERR SYS both failed is by definition the TAWS fault,
 * which replaces the GPWS and the TERR SYS faults. The L:A32NX_GPWS_n_FAILED and L:A32NX_TERR_n_FAILED
 * (Misc/EfisTawsBridge.ts) include the AESU reset and the unpowered system, so the alerts need the busbar powered
 * (ELEC AC ESS BUS FAULT lists TAWS 1 itself).
 * @param gpwsFailed L:A32NX_GPWS_n_FAILED
 * @param terrFailed L:A32NX_TERR_n_FAILED
 * @param powered the busbar of that SURV system (AC ESS for SYS 1, AC 4 for SYS 2) is powered
 * @returns the TAWS, GPWS and TERR SYS fault conditions of that system
 */
export function tawsFunctionFaults(gpwsFailed: boolean, terrFailed: boolean, powered: boolean): TawsFunctionFaults {
  const taws = gpwsFailed && terrFailed && powered;
  return {
    taws,
    gpws: gpwsFailed && powered && !taws,
    terr: terrFailed && powered && !taws,
  };
}

/**
 * The lines of SURV GPWS 1(2) FAULT: WXR & TAWS ... SYS 2(1) while the failed system is in use and the WXR/TAWS of
 * the other system is operative; [MFD SURV] STATUS & SWTG PAGE ... CHECK and WXR & TAWS ... AS RQRD while the WXR or
 * the TAWS of the other system has failed.
 * @param failedSystem the system of the alert
 * @param selectedSystem the WXR/TAWS system in use (L:A32NX_WXR_TAWS_SYS_SELECTED)
 * @param otherWxrFailed the WXR of the other system is failed
 * @param otherTawsFailed a TAWS function (GPWS or TERR SYS) of the other system is failed
 * @returns which of the 3 lines are shown
 */
export function gpwsFaultItemsToShow(
  failedSystem: SurvSystem,
  selectedSystem: number,
  otherWxrFailed: boolean,
  otherTawsFailed: boolean,
): boolean[] {
  const otherFailed = otherWxrFailed || otherTawsFailed;
  return [selectedSystem === failedSystem && !otherFailed, otherFailed, otherFailed];
}
