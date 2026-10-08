// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) OIL LO PR, ENG 1(2) OIL HI TEMP and ENG 1(2) OIL FILTER CLOG (A320 FCOM PRO-ABN-ENG, a320_fcom.txt
 * l.80487-80591; OIL FILTER CLOG l.80497: "This alert triggers when the oil filter is clogged."). Their title colours
 * and flight phase inhibition figures are images, read on the 2019 FCOM PDF pages 2281-2283: OIL LO PR is a red warning
 * inhibited in phases 1 and 10; OIL HI TEMP an amber caution inhibited in phases 4, 5, 7 and 8; OIL FILTER CLOG an amber
 * caution inhibited in phases 3, 4, 5, 7 and 8.
 */

/** l.80569: "This alert triggers when oil pressure is below 13 PSI." */
export const OIL_LO_PR_THRESHOLD_PSI = 13;

/** l.80528-80530: "This alert triggers when the oil temperature is: - Between 140 °C and 155 °C for more than 15 min, or - Above 155 °C." */
export const OIL_HI_TEMP_ADVISORY_CELSIUS = 140;
export const OIL_HI_TEMP_LIMIT_CELSIUS = 155;
export const OIL_HI_TEMP_ADVISORY_MAX_SECONDS = 15 * 60;

export interface EngineOilInputs {
  masterOn: boolean;
  /** The FADEC reports the engine running (ENGINE_STATE On) */
  engineRunning: boolean;
  oilPressurePsi: number;
  oilTemperatureCelsius: number;
  /** The oil filter clog failure (L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED, systems engine/oil_failure.rs) */
  oilFilterClogged: boolean;
}

/**
 * The oil alerts of one engine.
 *
 * Design choice: the three alerts are monitored while the engine runs with its ENG MASTER ON. The FCOM gives no such
 * condition, but a stopped engine has no oil pressure, and the OIL LO PR and OIL HI TEMP procedures end with the ENG
 * MASTER OFF, after which the ENG SHUT DOWN procedure takes over (FCOM "ASSOCIATED PROCEDURES", l.80543 and l.80582). A
 * clogged oil filter only shows a pressure loss while the oil flows, with the engine running.
 */
export class EngineOilMonitor {
  private aboveAdvisorySeconds = 0;

  private lowPressure = false;

  private highTemperature = false;

  private filterClog = false;

  update(inputs: EngineOilInputs, deltaTimeSeconds: number): void {
    const monitored = inputs.masterOn && inputs.engineRunning;
    const temperature = inputs.oilTemperatureCelsius;

    // The time spent at or above the 140 °C advisory, for the "more than 15 min" condition
    this.aboveAdvisorySeconds =
      temperature >= OIL_HI_TEMP_ADVISORY_CELSIUS ? this.aboveAdvisorySeconds + deltaTimeSeconds : 0;

    this.lowPressure = monitored && inputs.oilPressurePsi < OIL_LO_PR_THRESHOLD_PSI;
    this.highTemperature =
      monitored &&
      (temperature > OIL_HI_TEMP_LIMIT_CELSIUS || this.aboveAdvisorySeconds > OIL_HI_TEMP_ADVISORY_MAX_SECONDS);
    this.filterClog = monitored && inputs.oilFilterClogged;
  }

  /** ENG 1(2) OIL LO PR */
  get isLowPressure(): boolean {
    return this.lowPressure;
  }

  /** ENG 1(2) OIL HI TEMP */
  get isHighTemperature(): boolean {
    return this.highTemperature;
  }

  /** ENG 1(2) OIL FILTER CLOG */
  get isFilterClogged(): boolean {
    return this.filterClog;
  }
}

/**
 * The lines of ENG 1(2) OIL LO PR and ENG 1(2) OIL HI TEMP, by index in their codes (EwdMessages 7707901/7707902,
 * 7707911/7707912): 0 title, 1 -THR LEVER n IDLE, 2 -ENG MASTER n OFF.
 * l.80536-80537 (OIL HI TEMP) and l.80576-80578 (OIL LO PR): THR LEVER (AFFECTED ENGINE) IDLE, ENG MASTER (AFFECTED
 * ENGINE) OFF. The line of a lever already at idle goes; the alert ends with the ENG MASTER OFF (EngineOilMonitor).
 */
export function engineOilShutDownLines(thrLeverIdle: boolean): number[] {
  return [0, ...(thrLeverIdle ? [] : [1]), 2];
}
