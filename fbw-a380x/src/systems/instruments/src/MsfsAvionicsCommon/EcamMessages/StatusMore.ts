// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Type only: importing the EcamMessages tables here would close an import cycle (index -> AbnormalSensed -> index) that
// breaks the unit tests; the callers pass EcamAbnormalProcedures
import type { AbnormalProcedure } from './index';

/*
 * The STATUS MORE sections ALERTS IMPACTING LDG PERF and MORE INFO: every ECAM alert with an impact on landing
 * performance is listed in ALERTS IMPACTING LDG PERF; MORE INFO gives additional procedural information in white, with
 * a separation line above it when there is at least one CANCELLED CAUTION.
 */

/** The procedure lines that mean the alert impacts the landing performance */
const LANDING_PERFORMANCE_LINE =
  /^LDG (DIST:? AFFECTED|PERF:? AFFECTED|PERF ?: ?COMPUTE|DIST COMPUTATION|PERF COMPUTATION|DIST IMPACT ON WET\/CONTAM RWY ONLY)/;

export function procedureImpactsLandingPerformance(procedure: AbnormalProcedure | undefined): boolean {
  return procedure !== undefined && procedure.items.some((item) => LANDING_PERFORMANCE_LINE.test(item.name));
}

/**
 * The keys of the ALERTS IMPACTING LDG PERF section
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
 * The MORE INFO lines by alert key, white on the STATUS MORE page. In the procedures every MORE INFO section holds the
 * REDUND LOSS items (the INOP SYS REDUND section), except the one of MISC OIS FAULT. The line breaks are a design
 * choice for the SD STATUS page width.
 */
export const EcamMoreInfo: { [key: string]: string[] } = {
  990900008: ['IF CAPT + F/O OITs AFFECTED,', 'CONSIDER NSS FLT OPS RESET', 'PROCEDURE.'],
};

/**
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
