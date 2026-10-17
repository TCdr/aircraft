// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The A380 fuel tank temperature and collector cell quantity indications, shared by the FQMS simulation (CpiomF), the
 * FUEL SD page (React SD) and the FWS: their L:vars, the temperature sensor immersion and the alert thresholds.
 * Each feed tank contains a collector cell, kept full to keep the fuel pumps immersed.
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

/** Approximate collector cell capacity */
export const COLLECTOR_CELL_CAPACITY_KG = 2_866 * KG_PER_LB;

/** COLLECTOR CELL NOT FULL below 265 US gal (1 735 lb) in the collector cell */
export const COLLECTOR_CELL_NOT_FULL_KG = 1_735 * KG_PER_LB;

/** The NOT FULL alert goes away above 317 US gal (2 076 lb) */
export const COLLECTOR_CELL_FULL_AGAIN_KG = 2_076 * KG_PER_LB;

/**
 * Whether a collector cell is not full, with the alert hysteresis (also the amber collector cell quantity of the FUEL
 * SD page).
 * @param quantityKg the collector cell quantity
 * @param wasNotFull whether the collector cell was not full on the last update
 */
export function isCollectorCellNotFull(quantityKg: number, wasNotFull: boolean): boolean {
  return wasNotFull ? quantityKg <= COLLECTOR_CELL_FULL_AGAIN_KG : quantityKg < COLLECTOR_CELL_NOT_FULL_KG;
}

/** FUEL TEMP LO and the amber temperatures below this */
export const FUEL_TEMP_LO_C = -40;

/** FUEL FEED TK 1(2)(3)(4) TEMP HI and the amber feed tank temperature above this */
export const FEED_TANK_TEMP_HI_C = 53;

/** Approximate quantity above which the tank temperature sensor is immersed */
const OUTER_TANK_TEMP_SENSOR_IMMERSED_KG = 8_819 * KG_PER_LB;
const TRIM_TANK_TEMP_SENSOR_IMMERSED_KG = 13_890 * KG_PER_LB;

/**
 * Whether the temperature sensor of a tank is immersed; a temperature whose sensor is not immersed is not displayed.
 * The aircraft data gives the thresholds of the outer and trim tanks only; design choice: the sensors of the other
 * tanks are immersed while their tank holds fuel.
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

/** Whether a feed tank temperature is abnormal: above 53 °C or below -40 °C, amber on the FUEL SD page */
export function isFeedTankTemperatureAbnormal(temperatureC: number): boolean {
  return temperatureC > FEED_TANK_TEMP_HI_C || temperatureC < FUEL_TEMP_LO_C;
}
