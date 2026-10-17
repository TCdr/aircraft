// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * STATUS lines of the F/CTL ALTN LAW (PROT LOST) and F/CTL DIRECT LAW alerts that are not already in FwsInopSys
 * (F/CTL PROT), FwsInformation (ALTN/DIRECT LAW : PROT LOST) and FwsLimitations (MAX SPEED).
 */

// EcamInopSys keys
const AP_1_2 = '220300007';
const FD_1_2 = '220300024';
const LOAD_ALLEVIATION = '340300014';
const CAT_2 = '220300027';
const GLS_AUTOLAND = '220300010';
// EcamInfos key
const BKUP_CTL_ACTIVE = '270200003';

/**
 * INOP SYS APPR & LDG of ALTN LAW (PROT LOST) and DIRECT LAW: CAT 2 and GLS AUTOLAND.
 * @returns the INOP SYS keys
 */
export function lawInopSysApprLdg(): string[] {
  return [CAT_2, GLS_AUTOLAND];
}

/**
 * INOP SYS ALL PHASES of DIRECT LAW, besides F/CTL PROT: LOAD ALLEVIATION, AP 1+2, FD 1+2.
 * @returns the INOP SYS keys
 */
export function directLawInopSysAllPhases(): string[] {
  return [LOAD_ALLEVIATION, AP_1_2, FD_1_2];
}

/**
 * INFO of DIRECT LAW besides DIRECT LAW : PROT LOST: F/CTL BKUP CTL ACTIVE when all the flight control computers have
 * failed.
 * @param allPrimsAndSecsFailed whether all PRIMs and SECs are failed
 * @returns the INFO keys
 */
export function directLawInfo(allPrimsAndSecsFailed: boolean): string[] {
  return allPrimsAndSecsFailed ? [BKUP_CTL_ACTIVE] : [];
}
