// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320Failure } from '@failures';

/**
 * The A320 has two mode S ATC transponders, one active and the other in standby, selected with the XPDR selector of
 * the ATC/TCAS panel (L:A32NX_TRANSPONDER_SYSTEM). MSFS only supports one transponder (systems.cfg Transponder.1), so
 * the single sim transponder acts as the transponder of the selected system.
 */
export type XpdrSystem = 1 | 2;

/**
 * The transponder selected on the ATC/TCAS panel, XPDR 1 for any unexpected value.
 * @param transponderSystemVar L:A32NX_TRANSPONDER_SYSTEM: 0 = XPDR 1, 1 = XPDR 2 (A32NX_Interior_ATC.xml)
 */
export function selectedXpdrSystem(transponderSystemVar: number): XpdrSystem {
  return transponderSystemVar === 1 ? 2 : 1;
}

/** The flyPad failure of a transponder: ATC/XPDR 1 (34050) or ATC/XPDR 2 (34051) */
export function transponderFailureKey(system: XpdrSystem): number {
  return system === 2 ? A320Failure.Transponder2 : A320Failure.Transponder1;
}

/**
 * Whether a transponder is powered: XPDR 1 by AC ESS SHED, XPDR 2 by AC 2, as the A32NX cockpit already modelled them.
 * The electrical procedures agree: ELEC AC ESS BUS SHED asks for ATC/XPDR SYS 2 and lists ATC/XPDR 1 as INOP SYS, ELEC
 * AC BUS 2 FAULT asks for ATC/XPDR SYS 1 and lists ATC/XPDR 2.
 */
export function isXpdrPowered(system: XpdrSystem, acEssShedPowered: boolean, ac2Powered: boolean): boolean {
  return system === 2 ? ac2Powered : acEssShedPowered;
}

/** Whether a transponder can work: powered and not failed. */
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
 * always in standby, the selected one when the crew sets the mode selector to STBY (both transponders powered but not
 * operating). A failed or unpowered transponder is not in standby: that is NAV ATC/XPDR 1(2) FAULT or an ELEC alert,
 * not STBY.
 * @param modeSelectorStby whether the mode selector is on STBY (L:A32NX_TRANSPONDER_MODE = 0)
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
 * The fault condition of a transponder for the NAV ATC/XPDR alerts: the transponder fails. A transponder is also lost
 * with its bus, but the ELEC AC ESS BUS SHED and ELEC AC BUS 2 FAULT procedures already ask for the other transponder
 * and list it as INOP SYS, so the condition needs its bus powered.
 * @param xpdrFailed whether the transponder is failed or unpowered (L:A32NX_XPDR_n_FAILED)
 */
export function xpdrFaultCondition(
  system: XpdrSystem,
  xpdrFailed: boolean,
  acEssShedPowered: boolean,
  ac2Powered: boolean,
): boolean {
  return xpdrFailed && isXpdrPowered(system, acEssShedPowered, ac2Powered);
}

/** Splits the fault conditions of both transponders into the 1, 2 and 1+2 FAULT alerts. */
export function splitXpdrFaults(xpdr1Condition: boolean, xpdr2Condition: boolean): XpdrFaultAlerts {
  return {
    xpdr1: xpdr1Condition && !xpdr2Condition,
    xpdr2: xpdr2Condition && !xpdr1Condition,
    xpdr1And2: xpdr1Condition && xpdr2Condition,
  };
}

/**
 * The "ATC/XPDR ..... SYS 2(1)" action line of NAV ATC/XPDR 1(2) FAULT: shown while the failed transponder is still
 * selected and the other one works. Like the other A320 ECAM actions, it goes away once done.
 */
export function isXpdrSwitchLineShown(
  failedSystem: XpdrSystem,
  selectedSystem: XpdrSystem,
  otherSystemOperative: boolean,
): boolean {
  return selectedSystem === failedSystem && otherSystemOperative;
}

/**
 * Whether the TCAS is in standby because it has no transponder. The TCAS works through the active transponder and goes
 * to standby only when both are lost: the TCAS STBY memo comes on when both ATCs are failed, and NAV ATC/XPDR 1+2
 * FAULT lists TCAS as INOP SYS; NAV ATC/XPDR 1(2) FAULT does not list it.
 * @param xpdr1Failed L:A32NX_XPDR_1_FAILED: XPDR 1 failed or unpowered
 * @param xpdr2Failed L:A32NX_XPDR_2_FAILED: XPDR 2 failed or unpowered
 */
export function isTcasStandbyWithoutXpdr(xpdr1Failed: boolean, xpdr2Failed: boolean): boolean {
  return xpdr1Failed && xpdr2Failed;
}
