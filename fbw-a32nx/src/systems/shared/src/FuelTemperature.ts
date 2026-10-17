// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The fuel temperature limits of the SD FUEL page and of the FWC, for the temperatures of the systems WASM
 * (a320_systems fuel/fuel_temperature.rs, L:A32NX_FUEL_{LEFT|RIGHT}_{INNER|OUTER}_TANK_TEMPERATURE).
 *
 * SD FUEL page temperature of a cell: shown only while its sensor is wet, normally green. It pulses green (advisory) in
 * flight phases 2 and 6 above 45 °C (inner cell) or 55 °C (outer cell), or below -40 °C. It turns amber, with the ECAM
 * caution, above the high limit or below the low limit.
 *
 * The limits of the cautions:
 * - FUEL L (R) OUTER (INNER) TK HI TEMP: outer cell above 55 °C on ground, 60 °C in flight; inner cell above 45 °C on
 *   ground, 54 °C in flight. Design choice: these limits for all aircraft (later aircraft have a variant with the
 *   in-flight limits only).
 * - FUEL L (R) OUTER (INNER) TK LO TEMP: below about -43 °C.
 */

/** A cell of a wing tank */
export type FuelCell = 'inner' | 'outer';

/** The HI TEMP limits, °C */
export const FUEL_HIGH_TEMPERATURE_LIMIT_C = {
  inner: { onGround: 45, inFlight: 54 },
  outer: { onGround: 55, inFlight: 60 },
} as const;

/** The LO TEMP limit, °C */
export const FUEL_LOW_TEMPERATURE_LIMIT_C = -43;

/** The high temperatures of the advisory, °C */
export const FUEL_HIGH_TEMPERATURE_ADVISORY_C = { inner: 45, outer: 55 } as const;

/** The low temperature of the advisory, °C */
export const FUEL_LOW_TEMPERATURE_ADVISORY_C = -40;

/** The FWC flight phases of the advisory */
const ADVISORY_FLIGHT_PHASES = [2, 6];

/**
 * Design choice (the sensor height is not published): the temperature sensor of a cell is wet while the cell holds more
 * than this, kg.
 */
export const FUEL_TEMPERATURE_SENSOR_WET_MIN_KG = 20;

/** Whether the temperature sensor of a cell is wet (the temperature is measured and shown) */
export function isFuelTemperatureSensorWet(cellQuantityKg: number): boolean {
  return cellQuantityKg > FUEL_TEMPERATURE_SENSOR_WET_MIN_KG;
}

/** Whether the fuel of a cell is above its HI TEMP limit */
export function isFuelTemperatureHigh(cell: FuelCell, temperatureC: number, onGround: boolean): boolean {
  const limits = FUEL_HIGH_TEMPERATURE_LIMIT_C[cell];
  return temperatureC > (onGround ? limits.onGround : limits.inFlight);
}

/** Whether the fuel of a cell is below the LO TEMP limit */
export function isFuelTemperatureLow(temperatureC: number): boolean {
  return temperatureC < FUEL_LOW_TEMPERATURE_LIMIT_C;
}

/** How the SD FUEL page shows the temperature of a cell */
export enum FuelTemperatureIndication {
  /** The sensor is dry: no temperature */
  Hidden,
  /** Green */
  Normal,
  /** Green, pulsing (advisory) */
  Advisory,
  /** Amber (with the ECAM caution) */
  Amber,
}

/**
 * The SD FUEL page indication of a cell temperature.
 * @param onGround the aircraft is on the ground (the limits of the caution differ)
 * @param fwcFlightPhase the FWC flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 */
export function fuelTemperatureIndication(
  cell: FuelCell,
  temperatureC: number,
  cellQuantityKg: number,
  onGround: boolean,
  fwcFlightPhase: number,
): FuelTemperatureIndication {
  if (!isFuelTemperatureSensorWet(cellQuantityKg)) {
    return FuelTemperatureIndication.Hidden;
  }
  if (isFuelTemperatureHigh(cell, temperatureC, onGround) || isFuelTemperatureLow(temperatureC)) {
    return FuelTemperatureIndication.Amber;
  }
  const advisory =
    temperatureC > FUEL_HIGH_TEMPERATURE_ADVISORY_C[cell] || temperatureC < FUEL_LOW_TEMPERATURE_ADVISORY_C;
  return advisory && ADVISORY_FLIGHT_PHASES.includes(fwcFlightPhase)
    ? FuelTemperatureIndication.Advisory
    : FuelTemperatureIndication.Normal;
}
