// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Type only: importing the EcamMessages tables here would close an import cycle (index -> AbnormalSensed -> index) that
// breaks the unit tests; the callers pass EcamAbnormalProcedures
import type { AbnormalProcedure } from './index';

/*
 * The STATUS MORE sections ALERTS IMPACTING LDG PERF and MORE INFO (A380 FCOM DSC-31-40-10, a380_fcom.txt):
 * l.72964-72977 "The STATUS MORE page: ... Indicates, in the ALERTS IMPACTING LDG PERF section, the alerts associated
 * with performance ... Provides, in white, additional procedural information. This section also refers to as MORE INFO.
 * When there is at least one CANCELLED CAUTION, a separation line appears above the MORE INFO."
 * l.72617-72619 "All ECAM alerts that have an impact on landing performance are listed on the STATUS MORE page of the SD".
 */

/**
 * The procedure lines that say that an alert impacts the landing performance: the ECAM displays of the LANDING
 * PERFORMANCE INDICATIONS table (l.72560-72610): LDG DIST AFFECTED, LDG PERF AFFECTED, LDG PERF : COMPUTE, the
 * LDG DIST (PERF) COMPUTATION CONFIRM lines, and LDG DIST IMPACT ON WET/CONTAM RWY ONLY.
 */
const LANDING_PERFORMANCE_LINE =
  /^LDG (DIST:? AFFECTED|PERF:? AFFECTED|PERF ?: ?COMPUTE|DIST COMPUTATION|PERF COMPUTATION|DIST IMPACT ON WET\/CONTAM RWY ONLY)/;

/**
 * Whether an ECAM alert impacts the landing performance: its procedure has a landing performance line
 * @param procedure the ECAM procedure of the alert
 */
export function procedureImpactsLandingPerformance(procedure: AbnormalProcedure | undefined): boolean {
  return procedure !== undefined && procedure.items.some((item) => LANDING_PERFORMANCE_LINE.test(item.name));
}

/**
 * The keys of the ALERTS IMPACTING LDG PERF section: the active alerts that impact the landing performance, in the order
 * of the active alerts, each once
 * @param activeAlertKeys the active ECAM alerts (sensed alerts and activated not-sensed procedures)
 * @param procedures the ECAM procedures by alert key (EcamAbnormalProcedures)
 */
export function alertsImpactingLandingPerformance(
  activeAlertKeys: readonly string[],
  procedures: { readonly [key: string]: AbnormalProcedure | undefined },
): string[] {
  const keys: string[] = [];
  for (const key of activeAlertKeys) {
    if (!keys.includes(key) && procedureImpactsLandingPerformance(procedures[key])) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * The MORE INFO lines of the ECAM procedures, by alert key, in white on the STATUS MORE page. In the FCOM, every MORE
 * INFO section of the ALL ECAM PROCEDURES chapter holds the REDUND LOSS items (the INOP SYS REDUND section), except
 * the one of MISC OIS FAULT (PRO-ABN-ECAM-10-46, l.170041-170045: "IF CAPT + F/O OITs AFFECTED, CONSIDER NSS FLT OPS
 * RESET PROCEDURE."). The line breaks are a design choice for the SD STATUS page width.
 */
export const EcamMoreInfo: { [key: string]: string[] } = {
  990900008: ['IF CAPT + F/O OITs AFFECTED,', 'CONSIDER NSS FLT OPS RESET', 'PROCEDURE.'],
};

/**
 * The keys of the active alerts that have MORE INFO, in the order of the active alerts, each once
 * @param activeAlertKeys the active ECAM alerts (sensed alerts and activated not-sensed procedures)
 */
export function alertsWithMoreInfo(activeAlertKeys: readonly string[]): string[] {
  const keys: string[] = [];
  for (const key of activeAlertKeys) {
    if (!keys.includes(key) && EcamMoreInfo[key] !== undefined) {
      keys.push(key);
    }
  }
  return keys;
}
