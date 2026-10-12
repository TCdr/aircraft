// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * STATUS lines of the F/CTL ALTN LAW (PROT LOST) and F/CTL DIRECT LAW alerts that are not already in FwsInopSys
 * (F/CTL PROT), FwsInformation (ALTN/DIRECT LAW : PROT LOST) and FwsLimitations (MAX SPEED) (A380 FCOM
 * PRO-ABN-ECAM-10-27-10).
 */

/** INOP SYS AP 1+2 (EcamInopSys 220300007) */
const AP_1_2 = '220300007';
/** INOP SYS FD 1+2 (EcamInopSys 220300024) */
const FD_1_2 = '220300024';
/** INOP SYS LOAD ALLEVIATION (EcamInopSys 340300014) */
const LOAD_ALLEVIATION = '340300014';
/** INOP SYS CAT 2 (EcamInopSys 220300027) */
const CAT_2 = '220300027';
/** INOP SYS GLS AUTOLAND (EcamInopSys 220300010) */
const GLS_AUTOLAND = '220300010';
/** INFO F/CTL BKUP CTL ACTIVE (EcamInfos 270200003) */
const BKUP_CTL_ACTIVE = '270200003';

/**
 * INOP SYS APPR & LDG of ALTN LAW (PROT LOST) and DIRECT LAW: CAT 2 and GLS AUTOLAND (a380_fcom.txt l.144870-144871,
 * 144982-144983).
 * @returns the INOP SYS keys
 */
export function lawInopSysApprLdg(): string[] {
  return [CAT_2, GLS_AUTOLAND];
}

/**
 * INOP SYS ALL PHASES of DIRECT LAW, besides F/CTL PROT: LOAD ALLEVIATION, AP 1+2, FD 1+2 (a380_fcom.txt
 * l.144982-144985).
 * @returns the INOP SYS keys
 */
export function directLawInopSysAllPhases(): string[] {
  return [LOAD_ALLEVIATION, AP_1_2, FD_1_2];
}

/**
 * INFO of DIRECT LAW besides DIRECT LAW : PROT LOST: "If all the flight control computers are failed: F/CTL BKUP CTL
 * ACTIVE" (a380_fcom.txt l.144990-144992).
 * @param allPrimsAndSecsFailed whether all PRIMs and SECs are failed
 * @returns the INFO keys
 */
export function directLawInfo(allPrimsAndSecsFailed: boolean): string[] {
  return allPrimsAndSecsFailed ? [BKUP_CTL_ACTIVE] : [];
}
