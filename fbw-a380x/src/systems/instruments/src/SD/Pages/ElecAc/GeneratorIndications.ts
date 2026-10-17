// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Generator indications of the ELEC AC and APU SD pages.
 */

/** A generator load is normal below 108 % */
const GENERATOR_OVERLOAD_PERCENT = 108;

/** An overload is shown once the load has been above 108 % for more than 10 s */
const GENERATOR_OVERLOAD_CONFIRMATION_MS = 10_000;

/** The APU and engine generator voltage is normal between 110 V and 120 V */
const GENERATOR_VOLTAGE_NORMAL_LOWER = 110;
const GENERATOR_VOLTAGE_NORMAL_UPPER = 120;

/** The APU generator frequency is normal between 390 Hz and 410 Hz */
const APU_GENERATOR_FREQUENCY_NORMAL_LOWER = 390;
const APU_GENERATOR_FREQUENCY_NORMAL_UPPER = 410;

/** OVHT: the engine generator temperature is above 185 C */
const ENGINE_GENERATOR_OVERHEAT_CELSIUS = 185;

/**
 * How long a generator load has been above GENERATOR_OVERLOAD_PERCENT, for the 10 s confirmation of the amber load
 * (APU and engine generators, RAT).
 * @param previousDurationMs the overload duration at the previous update
 * @param loadPercent the generator load in percent
 * @param deltaMs the time since the previous update
 * @returns the new overload duration, 0 when the load is not above 108 %
 */
export function nextGeneratorOverloadDurationMs(
  previousDurationMs: number,
  loadPercent: number,
  deltaMs: number,
): number {
  return loadPercent > GENERATOR_OVERLOAD_PERCENT ? previousDurationMs + deltaMs : 0;
}

/**
 * The load is amber (generator overload) only once it has been above 108 % for more than
 * 10 s; a short peak stays green.
 * @param overloadDurationMs the time the load has been above 108 % (nextGeneratorOverloadDurationMs)
 * @returns whether the load is amber
 */
export function isGeneratorLoadAmber(overloadDurationMs: number): boolean {
  return overloadDurationMs > GENERATOR_OVERLOAD_CONFIRMATION_MS;
}

/**
 * @param potentialVolts the generator voltage
 * @returns whether it is in the normal 110 V to 120 V band (green), else amber
 */
export function isGeneratorVoltageNormal(potentialVolts: number): boolean {
  return potentialVolts > GENERATOR_VOLTAGE_NORMAL_LOWER && potentialVolts < GENERATOR_VOLTAGE_NORMAL_UPPER;
}

/**
 * @param frequencyHertz the APU generator frequency
 * @returns whether it is in the normal 390 Hz to 410 Hz band (green), else amber
 */
export function isApuGeneratorFrequencyNormal(frequencyHertz: number): boolean {
  return frequencyHertz > APU_GENERATOR_FREQUENCY_NORMAL_LOWER && frequencyHertz < APU_GENERATOR_FREQUENCY_NORMAL_UPPER;
}

/**
 * The engine generator is off (OFF) or disconnected from the engine (DISC). The drive disconnection (DRIVE pb, or the
 * automatic disconnection of ELEC DRIVE OIL OVHT / OIL PRESS LO) stops the generator whatever its GEN pb, so DISC wins
 * over OFF. Design choice (the source gives no picture): DISC in amber at the place of OFF, as the drive can only be
 * reconnected by maintenance.
 * @param genPbOn GEN pb-sw ON
 * @param driveConnected the generator drive is connected (L:A32NX_ELEC_ENG_GEN_n_IDG_IS_CONNECTED)
 * @returns 'DISC', 'OFF', or null when the generator is in operation (load and voltage shown)
 */
export function engineGeneratorOffText(genPbOn: boolean, driveConnected: boolean): 'DISC' | 'OFF' | null {
  if (!driveConnected) {
    return 'DISC';
  }
  return genPbOn ? null : 'OFF';
}

/**
 * OVHT indication of an engine generator. The generator is cooled by the oil of its drive, so the
 * temperature of the oil leaving it (L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_OUTLET_TEMPERATURE, systems
 * electrical/engine_generator.rs DirectDrive) stands for the generator temperature (design choice: the generator
 * winding temperature is not modelled). It goes above 185 C after a lost oil cooling or an oil leak, before the
 * 200 C of ELEC DRIVE OIL OVHT.
 * @param oilOutletCelsius the drive oil outlet temperature
 * @returns whether the amber OVHT is shown
 */
export function isEngineGeneratorOverheat(oilOutletCelsius: number): boolean {
  return oilOutletCelsius > ENGINE_GENERATOR_OVERHEAT_CELSIUS;
}

/** The states of the shedding of the commercial loads and the galleys */
export interface LoadSheddingState {
  /** COMMERCIAL 1 pb-sw OFF (L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON false) */
  readonly commercial1Off: boolean;
  /** COMMERCIAL 2 pb-sw OFF (L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF) */
  readonly commercial2Off: boolean;
  /** At least one galley is shed (L:A32NX_ELEC_GALLEY_IS_SHED) */
  readonly galleyShed: boolean;
  /** Some, not all, galleys are shed (L:A32NX_ELEC_GALLEY_IS_PARTIALLY_SHED) */
  readonly galleyPartiallyShed: boolean;
}

/**
 * GALLEY/COMMERCIAL indication of the ELEC AC page: COMMERCIAL OFF (all commercial loads shed), GALLEY SHED (all
 * galley loads shed), COMMERCIAL PARTIALLY SHED or GALLEY PARTIALLY SHED (some loads shed). The COMMERCIAL 1(2) pb-sw
 * sheds the commercial loads of the upper left (right) cabin supply centers: both OFF shed them all, one OFF some.
 * The galley shedding comes from the ENMU / ELMU of systems.wasm (a380_systems electrical/galley.rs).
 * Design choice (the source gives one item for them, no picture): the four legends share one place, all loads before
 * some loads.
 * @param state the shedding state
 * @returns the lines of the legend, or an empty list when nothing is shed
 */
export function galleyCommercialIndication(state: LoadSheddingState): string[] {
  if (state.commercial1Off && state.commercial2Off) {
    return ['COMMERCIAL', 'OFF'];
  }
  if (state.galleyShed && !state.galleyPartiallyShed) {
    return ['GALLEY SHED'];
  }
  if (state.commercial1Off || state.commercial2Off) {
    return ['COMMERCIAL', 'PARTIALLY', 'SHED'];
  }
  if (state.galleyPartiallyShed) {
    return ['GALLEY', 'PARTIALLY', 'SHED'];
  }
  return [];
}
