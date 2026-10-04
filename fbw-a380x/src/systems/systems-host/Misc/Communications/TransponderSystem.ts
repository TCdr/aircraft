// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';

/**
 * The A380 has two surveillance systems (AESS), each with its own transponder: SURV SYS 1 and SURV SYS 2. MSFS only
 * supports one transponder, so the systems host drives that single sim transponder as the one of the selected system
 * (XPDR & TCAS SYS 1/2 on the SURV panel or the MFD SURV page, L:A32NX_TRANSPONDER_SYSTEM).
 */
export type SurvSystem = 1 | 2;

/**
 * The XPDR & TCAS system selected on the SURV panel / MFD SURV page.
 * @param transponderSystemVar L:A32NX_TRANSPONDER_SYSTEM: 0 = SYS 1, 1 = SYS 2 (pedestal.xml, MfdSurvStatusSwitching).
 * @returns the selected surveillance system, SYS 1 for any unexpected value
 */
export function selectedSurvSystem(transponderSystemVar: number): SurvSystem {
  return transponderSystemVar === 1 ? 2 : 1;
}

/**
 * The failure of the transponder of a surveillance system.
 * @param system the surveillance system
 * @returns XPDR 1 (34003) for SYS 1, XPDR 2 (34004) for SYS 2
 */
export function transponderFailureKey(system: SurvSystem): number {
  return system === 2 ? A380Failure.Transponder2 : A380Failure.Transponder1;
}

/**
 * Whether the XPDR/TCAS of a surveillance system is powered.
 * A380 FCOM DSC-34-20-100 (a380_fcom.txt:92741-92743): SURV SYS 1 (XPDR/TCAS) = 115 V AC ESS, SURV SYS 2 = 115 V AC 4.
 * @param system the surveillance system
 * @param acEssPowered whether the AC ESS busbar (400XP) is powered
 * @param ac4Powered whether the AC 4 busbar is powered
 * @returns whether the XPDR/TCAS of that system is powered
 */
export function isXpdrTcasPowered(system: SurvSystem, acEssPowered: boolean, ac4Powered: boolean): boolean {
  return system === 2 ? ac4Powered : acEssPowered;
}

/**
 * Whether the transponder of a surveillance system can work: powered and not failed.
 * @param system the surveillance system
 * @param acEssPowered whether the AC ESS busbar (400XP) is powered
 * @param ac4Powered whether the AC 4 busbar is powered
 * @param isFailureActive whether a failure is active
 * @returns whether the transponder of that system is operative
 */
export function isTransponderOperative(
  system: SurvSystem,
  acEssPowered: boolean,
  ac4Powered: boolean,
  isFailureActive: (failure: number) => boolean,
): boolean {
  return isXpdrTcasPowered(system, acEssPowered, ac4Powered) && !isFailureActive(transponderFailureKey(system));
}

/**
 * Whether the TCAS function of a surveillance system is inoperative.
 * A380 FCOM SURV XPDR 1(2) FAULT (a380_fcom.txt:167281-167322): with the XPDR function of SURV SYS 1(2) failed, the
 * STATUS lists XPDR 1(2) and TCAS 1(2) as INOP SYS. MSFS runs one TCAS computer (LegacyTcasComputer,
 * L:A32NX_TCAS_FAULT) as the TCAS of the selected system, so its fault is the TCAS fault of the selected system only.
 * @param system the surveillance system
 * @param selectedSystem the XPDR & TCAS system in use (L:A32NX_TRANSPONDER_SYSTEM)
 * @param xpdrFailed whether the transponder of that system is failed or unpowered (L:A32NX_XPDR_n_FAILED)
 * @param selectedTcasFault whether the sim TCAS computer reports a fault (L:A32NX_TCAS_FAULT)
 * @returns whether the TCAS of that system is inoperative
 */
export function isTcasInoperative(
  system: SurvSystem,
  selectedSystem: SurvSystem,
  xpdrFailed: boolean,
  selectedTcasFault: boolean,
): boolean {
  return xpdrFailed || (system === selectedSystem && selectedTcasFault);
}
