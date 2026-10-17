// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The tyre pressure indicating system (TPIS, an option of the A320) as the SD WHEEL page and the FWC see it: the
 * pressures written by the systems WASM (a320_systems tyre_pressure.rs) and the low pressure rule shared by the amber
 * WHEEL page pressures and the WHEEL TYRE LO PR caution.
 *
 * WHEEL TYRE LO PR rule: one tyre below 74 % of its nominal pressure between liftoff and engines shutdown (89 % in the
 * other cases), or a difference between the two tyres of an axle above 21 % of the nominal pressure between liftoff
 * and engines shutdown (15 % in the other cases). The WHEEL page shows a tyre pressure in green, in amber with the
 * caution condition.
 *
 * Design choices:
 * - "Between liftoff and engines shutdown" is FWC flight phases 5 (LIFTOFF) to 9 (until the 2ND ENG SHUTDOWN).
 * - The amber pressure is the caution condition applied to each tyre: a tyre below its low limit, and both tyres of an
 *   axle whose difference is too high (the A380 TPIS uses the same rule for its indications).
 */

/** The flyPad aircraft option (NXDataStore key): '1' TPIS installed, '0' not installed */
export const TPIS_INSTALLED_SETTING = 'CONFIG_A32NX_TPIS_INSTALLED';

/** Not installed by default: nearly every A320 is delivered without the TPIS */
export const TPIS_INSTALLED_DEFAULT = '0';

/** The tyres, in the order of the WHEEL page: main wheels 1 to 4 (left to right, as the brakes), nose 1 (left), 2 */
export enum Tyre {
  Main1,
  Main2,
  Main3,
  Main4,
  Nose1,
  Nose2,
}

export const TYRES: readonly Tyre[] = [Tyre.Main1, Tyre.Main2, Tyre.Main3, Tyre.Main4, Tyre.Nose1, Tyre.Nose2];

/** The ARINC 429 L:var of the TPIS pressure of a tyre, PSI */
export function tyrePressureVar(tyre: Tyre): string {
  return tyre >= Tyre.Nose1
    ? `L:A32NX_TPIS_NOSE_${tyre - Tyre.Nose1 + 1}_TYRE_PRESSURE`
    : `L:A32NX_TPIS_MAIN_${tyre + 1}_TYRE_PRESSURE`;
}

/** The L:vars of the nominal tyre pressures, PSI (written by the TPIS model with the pressures) */
export const MAIN_NOMINAL_PRESSURE_VAR = 'L:A32NX_TPIS_MAIN_NOMINAL_TYRE_PRESSURE';
export const NOSE_NOMINAL_PRESSURE_VAR = 'L:A32NX_TPIS_NOSE_NOMINAL_TYRE_PRESSURE';

/** The other tyre of the same axle: main 1 <-> 2 (left gear), main 3 <-> 4 (right gear), nose 1 <-> 2 */
export function axleMate(tyre: Tyre): Tyre {
  return tyre % 2 === 0 ? tyre + 1 : tyre - 1;
}

/** The low limits, fractions of the nominal pressure */
const TYRE_LOW_FRACTION_LIFTOFF_TO_SHUTDOWN = 0.74;
const TYRE_LOW_FRACTION_OTHER = 0.89;

/** The axle difference limits, fractions of the nominal pressure */
const AXLE_DIFFERENCE_FRACTION_LIFTOFF_TO_SHUTDOWN = 0.21;
const AXLE_DIFFERENCE_FRACTION_OTHER = 0.15;

/** Whether the FWC flight phase is "between liftoff and engines shutdown" (phases 5 to 9) */
function isBetweenLiftoffAndEnginesShutdown(fwcFlightPhase: number): boolean {
  return fwcFlightPhase >= 5 && fwcFlightPhase <= 9;
}

export interface NominalTyrePressures {
  mainPsi: number;
  nosePsi: number;
}

/**
 * Whether the pressure of a tyre is abnormal for the WHEEL TYRE LO PR caution: below its low limit, or too different
 * from the other tyre of its axle. A tyre without valid TPIS data (null) is never abnormal: the WHEEL page shows XX.
 * @param pressuresPsi the TPIS pressures in the order of TYRES, null when the data is not valid
 * @param nominal the nominal pressures (no rule while they are not known yet, 0)
 * @param tyre the tyre
 * @param fwcFlightPhase the FWC flight phase (1 to 10)
 */
export function isTyrePressureAbnormal(
  pressuresPsi: readonly (number | null)[],
  nominal: NominalTyrePressures,
  tyre: Tyre,
  fwcFlightPhase: number,
): boolean {
  const pressure = pressuresPsi[tyre];
  const nominalPsi = tyre >= Tyre.Nose1 ? nominal.nosePsi : nominal.mainPsi;
  if (pressure === null || !(nominalPsi > 0)) {
    return false;
  }

  const liftoffToShutdown = isBetweenLiftoffAndEnginesShutdown(fwcFlightPhase);
  const lowLimit = nominalPsi * (liftoffToShutdown ? TYRE_LOW_FRACTION_LIFTOFF_TO_SHUTDOWN : TYRE_LOW_FRACTION_OTHER);
  const maxDifference =
    nominalPsi * (liftoffToShutdown ? AXLE_DIFFERENCE_FRACTION_LIFTOFF_TO_SHUTDOWN : AXLE_DIFFERENCE_FRACTION_OTHER);

  const matePressure = pressuresPsi[axleMate(tyre)];
  const axleDifferenceTooHigh = matePressure !== null && Math.abs(pressure - matePressure) > maxDifference;

  return pressure < lowLimit || axleDifferenceTooHigh;
}

/** How the WHEEL page shows the pressure of one tyre */
export interface TyrePressureIndication {
  /** The pressure in PSI, or XX when the TPIS data is not valid */
  text: string;
  amber: boolean;
}

/**
 * The WHEEL page pressure of a tyre: green, amber with the WHEEL TYRE LO PR condition; amber XX when the TPIS data is
 * not valid (any SD parameter that is not available shows amber crosses).
 */
export function tyrePressureIndication(
  pressuresPsi: readonly (number | null)[],
  nominal: NominalTyrePressures,
  tyre: Tyre,
  fwcFlightPhase: number,
): TyrePressureIndication {
  const pressure = pressuresPsi[tyre];
  if (pressure === null) {
    return { text: 'XX', amber: true };
  }
  return {
    text: Math.round(pressure).toString(),
    amber: isTyrePressureAbnormal(pressuresPsi, nominal, tyre, fwcFlightPhase),
  };
}
