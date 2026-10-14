// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The A380 fuel tank temperature and collector cell quantity indications, shared by the FQMS simulation (CpiomF), the
 * FUEL SD page (React SD) and the FWS: their L:vars, the temperature sensor immersion and the alert thresholds.
 *
 * Source: A380 FCOM (KAL fleet). "l." = line of the text copy references/manuals/a380_fcom.txt.
 * - DSC-28-10 FEED TANKS, l.57265-57271: "Each feed tank [...] Contains a collector cell that has a fuel capacity of
 *   approximately 2 866 lb. The collector cell is maintained full, to keep the fuel pumps immersed".
 * - DSC-28-20 FUEL SD page, l.58553-58580 (collector cells), l.58693-58713 (outer and trim tank temperatures),
 *   l.58763-58776 (feed tank temperatures).
 * - PRO-ABN-ECAM-10-28 FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL l.149560-149568, FUEL FEED TK 1(2)(3)(4) TEMP HI
 *   l.150383, FUEL TEMP LO l.153448.
 */

const KG_PER_LB = 0.45359237;

/** The A380 fuel tanks, named as the FQMS quantity L:vars (A32NX_FQMS_{tank}_TANK_QUANTITY) */
export type A380FuelTankName =
  | 'LEFT_OUTER'
  | 'FEED_1'
  | 'LEFT_MID'
  | 'LEFT_INNER'
  | 'FEED_2'
  | 'FEED_3'
  | 'RIGHT_INNER'
  | 'RIGHT_MID'
  | 'FEED_4'
  | 'RIGHT_OUTER'
  | 'TRIM';

/** The L:var of a fuel tank temperature, in degrees Celsius (written by CpiomF/FuelTankTemperatures) */
export function fuelTankTemperatureVar(tank: A380FuelTankName): string {
  return `L:A380X_FUEL_${tank}_TANK_TEMPERATURE`;
}

/** The L:var of the fuel quantity of collector cell 1 to 4, in kg (written by CpiomF/FuelCollectorCells) */
export function collectorCellQuantityVar(cell: number): string {
  return `L:A380X_FUEL_COLLECTOR_CELL_${cell}_QUANTITY`;
}

/** l.57268: the collector cell capacity, "approximately 2 866 lb" */
export const COLLECTOR_CELL_CAPACITY_KG = 2_866 * KG_PER_LB;

/** l.149562: COLLECTOR CELL NOT FULL when "less than 265 US Gal (1 735 lb) in the collector cell" */
export const COLLECTOR_CELL_NOT_FULL_KG = 1_735 * KG_PER_LB;

/** l.149562-149564: "The alert no longer appears, when the fuel quantity exceeds 317 US Gal (2 076 lb)" */
export const COLLECTOR_CELL_FULL_AGAIN_KG = 2_076 * KG_PER_LB;

/**
 * Whether a collector cell is "not full", with the hysteresis of l.149562-149564 (also the amber collector cell
 * quantity of the FUEL SD page, l.58574).
 * @param quantityKg the collector cell quantity
 * @param wasNotFull whether the collector cell was not full on the last update
 */
export function isCollectorCellNotFull(quantityKg: number, wasNotFull: boolean): boolean {
  return wasNotFull ? quantityKg <= COLLECTOR_CELL_FULL_AGAIN_KG : quantityKg < COLLECTOR_CELL_NOT_FULL_KG;
}

/** l.58710, l.153448: FUEL TEMP LO and the amber temperatures below -40 °C */
export const FUEL_TEMP_LO_C = -40;

/** l.150383, l.58772: FUEL FEED TK 1(2)(3)(4) TEMP HI and the amber feed tank temperature above 53 °C */
export const FEED_TANK_TEMP_HI_C = 53;

/** l.58700: the outer tank temperature sensor is immersed above about 8 819 lb */
export const OUTER_TANK_TEMP_SENSOR_IMMERSED_KG = 8_819 * KG_PER_LB;

/** l.58701: the trim tank temperature sensor is immersed above about 13 890 lb */
export const TRIM_TANK_TEMP_SENSOR_IMMERSED_KG = 13_890 * KG_PER_LB;

/**
 * Whether the temperature sensor of a tank is immersed, so that its temperature is measured: "When the fuel temperature
 * sensors are not immersed, the associated fuel temperatures are not displayed" (l.58703-58704). The FCOM gives the
 * thresholds of the outer and trim tanks only (l.58698-58701); design choice: the sensors of the other tanks are
 * immersed while their tank holds fuel.
 * @param tank the tank
 * @param quantityKg its fuel quantity
 */
export function isTemperatureSensorImmersed(tank: A380FuelTankName, quantityKg: number): boolean {
  switch (tank) {
    case 'LEFT_OUTER':
    case 'RIGHT_OUTER':
      return quantityKg > OUTER_TANK_TEMP_SENSOR_IMMERSED_KG;
    case 'TRIM':
      return quantityKg > TRIM_TANK_TEMP_SENSOR_IMMERSED_KG;
    default:
      return quantityKg > 0;
  }
}

/** Whether a feed tank temperature is abnormal: above 53 °C or below -40 °C (l.58772), amber on the FUEL SD page */
export function isFeedTankTemperatureAbnormal(temperatureC: number): boolean {
  return temperatureC > FEED_TANK_TEMP_HI_C || temperatureC < FUEL_TEMP_LO_C;
}
