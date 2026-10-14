// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Generator indications of the ELEC AC and APU SD pages (FCOM gap report 2026-10-10, A380X ATA 24 rows #32, #33, #35,
 * #36). Source: A380 FCOM DSC-24-20 CONTROLS AND INDICATORS (ELEC AC page) and DSC-49-20 (APU page); "l." = line of
 * references/manuals/a380_fcom.txt.
 */

/** "The load is normal, when it is less than 108 %." (l.51003, 51092, 51162, 108596) */
export const GENERATOR_OVERLOAD_PERCENT = 108;

/** "The load is greater than 108 % for more than 10 s." (l.51013, 51097, 51167, 108601) */
export const GENERATOR_OVERLOAD_CONFIRMATION_MS = 10_000;

/** "The voltage is normal between 110 V and 120 V." (l.51020 APU gen, l.51104 engine gen, l.108608 APU page) */
const GENERATOR_VOLTAGE_NORMAL_LOWER = 110;
const GENERATOR_VOLTAGE_NORMAL_UPPER = 120;

/** "The frequency is between 390 Hz and 410 Hz." (l.51029 ELEC AC page, l.108617 APU page) */
const APU_GENERATOR_FREQUENCY_NORMAL_LOWER = 390;
const APU_GENERATOR_FREQUENCY_NORMAL_UPPER = 410;

/** OVHT INDICATION: "The engine generator overheats. The temperature is above 185 C." (l.51107-51112) */
export const ENGINE_GENERATOR_OVERHEAT_CELSIUS = 185;

/**
 * How long a generator load has been above GENERATOR_OVERLOAD_PERCENT, for the 10 s confirmation of the amber load
 * (l.51011-51013 APU gen, l.51094-51097 engine gen, l.51164-51167 RAT, l.108599-108601 APU page).
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
 * The load is amber ("There is an overload on the ... generator") only once it has been above 108 % for more than
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
 * ENGINE GENERATOR OFF (l.51061-51065): "The engine generator is off." / "The engine generator is disconnected from the
 * engine." The drive disconnection (DRIVE pb, or the automatic disconnection of ELEC DRIVE OIL OVHT / OIL PRESS LO)
 * stops the generator whatever its GEN pb, so DISC wins over OFF. The FCOM figure is not in the text: DISC in amber at
 * the place of OFF is a design choice (the drive can only be reconnected by maintenance, l.50783-50786).
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
 * OVHT INDICATION of an engine generator (l.51107-51112). The generator is cooled by the oil of its drive, so the
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
 * GALLEY/COMMERCIAL INDICATION of the ELEC AC page (l.51033-51046): "COMMERCIAL OFF All commercial loads are shed.",
 * "GALLEY SHED All galley loads are shed.", "COMMERCIAL PARTIALLY SHED Some commercial loads are shed.", "GALLEY
 * PARTIALLY SHED Some galley loads are shed." The COMMERCIAL 1(2) pb-sw sheds the commercial loads of the upper left
 * (right) cabin supply centers (l.50709-50716): both OFF shed them all, one OFF some. The galley shedding comes from the
 * ENMU / ELMU of systems.wasm (a380_systems electrical/galley.rs).
 * The four legends share one place, in the FCOM order (all loads before some loads), as the FCOM gives one item for
 * them (design choice; the figure is not in the text).
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
