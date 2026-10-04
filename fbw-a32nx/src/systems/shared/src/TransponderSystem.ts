// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320Failure } from '@failures';

/**
 * The A320 has two mode S ATC transponders, one active and the other in standby (FCOM DSC-34-SURV-60-10, a320_fcom.txt
 * 55850-55854), selected with the XPDR selector of the ATC/TCAS panel (DSC-34-SURV-10-20, a320_fcom.txt:53863,
 * L:A32NX_TRANSPONDER_SYSTEM). MSFS only supports one transponder (systems.cfg Transponder.1), so the single sim
 * transponder acts as the transponder of the selected system.
 */
export type XpdrSystem = 1 | 2;

/**
 * The transponder selected on the ATC/TCAS panel.
 * @param transponderSystemVar L:A32NX_TRANSPONDER_SYSTEM: 0 = XPDR 1, 1 = XPDR 2 (A32NX_Interior_ATC.xml)
 * @returns the selected transponder, XPDR 1 for any unexpected value
 */
export function selectedXpdrSystem(transponderSystemVar: number): XpdrSystem {
  return transponderSystemVar === 1 ? 2 : 1;
}

/**
 * The failure of a transponder.
 * @param system the transponder
 * @returns ATC/XPDR 1 (34050) or ATC/XPDR 2 (34051)
 */
export function transponderFailureKey(system: XpdrSystem): number {
  return system === 2 ? A320Failure.Transponder2 : A320Failure.Transponder1;
}

/**
 * Whether a transponder is powered. The FCOM has no equipment list, but its electrical procedures give the supplies:
 * ELEC AC ESS BUS SHED (a320_fcom.txt:76035, 76060) asks for ATC/XPDR SYS 2 and lists ATC/XPDR 1 as INOP SYS, ELEC AC
 * BUS 2 FAULT (a320_fcom.txt:75724, 75774) asks for ATC/XPDR SYS 1 and lists ATC/XPDR 2. So XPDR 1 = AC ESS SHED,
 * XPDR 2 = AC 2, as the A32NX cockpit already modelled them.
 * @param system the transponder
 * @param acEssShedPowered whether the AC ESS SHED bus is powered
 * @param ac2Powered whether AC BUS 2 is powered
 * @returns whether the transponder is powered
 */
export function isXpdrPowered(system: XpdrSystem, acEssShedPowered: boolean, ac2Powered: boolean): boolean {
  return system === 2 ? ac2Powered : acEssShedPowered;
}

/**
 * Whether a transponder can work: powered and not failed.
 * @param system the transponder
 * @param acEssShedPowered whether the AC ESS SHED bus is powered
 * @param ac2Powered whether AC BUS 2 is powered
 * @param isFailureActive whether a failure is active
 * @returns whether the transponder is operative
 */
export function isTransponderOperative(
  system: XpdrSystem,
  acEssShedPowered: boolean,
  ac2Powered: boolean,
  isFailureActive: (failure: number) => boolean,
): boolean {
  return isXpdrPowered(system, acEssShedPowered, ac2Powered) && !isFailureActive(transponderFailureKey(system));
}

/**
 * The STBY discrete of a transponder, acquired by the FWC for NAV ATC/XPDR STBY. The not selected transponder is
 * always in standby (DSC-34-SURV-60-10: "one active, the other in standby"), the selected one when the crew sets the
 * mode selector to STBY (DSC-34-SURV-10-20, a320_fcom.txt:53865: both XPDR supplied but do not operate). A failed or
 * unpowered transponder is not in standby: that is NAV ATC/XPDR 1(2) FAULT or an ELEC alert, not STBY.
 * @param system the transponder
 * @param selectedSystem the selected transponder
 * @param modeSelectorStby whether the mode selector is on STBY (L:A32NX_TRANSPONDER_MODE = 0)
 * @returns whether the transponder signals standby
 */
export function isXpdrStandbyDiscrete(
  system: XpdrSystem,
  selectedSystem: XpdrSystem,
  modeSelectorStby: boolean,
): boolean {
  return modeSelectorStby || system !== selectedSystem;
}

/** The NAV ATC/XPDR 1, 2 and 1+2 FAULT alerts, which never show together. */
export interface XpdrFaultAlerts {
  /** NAV ATC/XPDR 1 FAULT: XPDR 1 failed, XPDR 2 not */
  xpdr1: boolean;
  /** NAV ATC/XPDR 2 FAULT: XPDR 2 failed, XPDR 1 not */
  xpdr2: boolean;
  /** NAV ATC/XPDR 1+2 FAULT: both failed */
  xpdr1And2: boolean;
}

/**
 * The fault condition of a transponder for the NAV ATC/XPDR alerts: "the related transponder fails" (FCOM PRO-ABN-NAV,
 * a320_fcom.txt:92774). A transponder is also lost with its bus, but the ELEC AC ESS BUS SHED and ELEC AC BUS 2 FAULT
 * procedures already ask for the other transponder and list it as INOP SYS, so the condition needs its bus powered.
 * @param system the transponder
 * @param xpdrFailed whether the transponder is failed or unpowered (L:A32NX_XPDR_n_FAILED)
 * @param acEssShedPowered whether the AC ESS SHED bus is powered
 * @param ac2Powered whether AC BUS 2 is powered
 * @returns whether the fault condition of that transponder is true
 */
export function xpdrFaultCondition(
  system: XpdrSystem,
  xpdrFailed: boolean,
  acEssShedPowered: boolean,
  ac2Powered: boolean,
): boolean {
  return xpdrFailed && isXpdrPowered(system, acEssShedPowered, ac2Powered);
}

/**
 * Splits the fault conditions of both transponders into the 1, 2 and 1+2 FAULT alerts.
 * @param xpdr1Condition the fault condition of XPDR 1
 * @param xpdr2Condition the fault condition of XPDR 2
 * @returns the alerts
 */
export function splitXpdrFaults(xpdr1Condition: boolean, xpdr2Condition: boolean): XpdrFaultAlerts {
  return {
    xpdr1: xpdr1Condition && !xpdr2Condition,
    xpdr2: xpdr2Condition && !xpdr1Condition,
    xpdr1And2: xpdr1Condition && xpdr2Condition,
  };
}

/**
 * The "ATC/XPDR ..... SYS 2(1)" action line of NAV ATC/XPDR 1(2) FAULT (a320_fcom.txt:92780): shown while the failed
 * transponder is still selected and the other one works. Like the other A320 ECAM actions, it goes away once done.
 * @param failedSystem the transponder of the alert
 * @param selectedSystem the selected transponder
 * @param otherSystemOperative whether the other transponder is operative
 * @returns whether the action line is shown
 */
export function isXpdrSwitchLineShown(
  failedSystem: XpdrSystem,
  selectedSystem: XpdrSystem,
  otherSystemOperative: boolean,
): boolean {
  return selectedSystem === failedSystem && otherSystemOperative;
}

/**
 * Whether the TCAS is in standby because it has no transponder. The TCAS works through the active transponder (DSC-34
 * -SURV-60-10, a320_fcom.txt:55850-55854). The FCOM puts the TCAS in standby only when both are lost: the TCAS STBY
 * memo comes on when "both ATCs ... are failed" (DSC-34-SURV-60-20, a320_fcom.txt:56377-56382) and NAV ATC/XPDR 1+2
 * FAULT lists TCAS as INOP SYS (a320_fcom.txt:92822-92830); NAV ATC/XPDR 1(2) FAULT does not list it.
 * @param xpdr1Failed whether XPDR 1 is failed or unpowered (L:A32NX_XPDR_1_FAILED)
 * @param xpdr2Failed whether XPDR 2 is failed or unpowered (L:A32NX_XPDR_2_FAILED)
 * @returns whether the TCAS must be in standby
 */
export function isTcasStandbyWithoutXpdr(xpdr1Failed: boolean, xpdr2Failed: boolean): boolean {
  return xpdr1Failed && xpdr2Failed;
}
