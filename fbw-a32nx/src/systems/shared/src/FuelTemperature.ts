// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The fuel temperature limits of the SD FUEL page and of the FWC, for the temperatures of the systems WASM
 * (a320_systems fuel/fuel_temperature.rs, L:A32NX_FUEL_{LEFT|RIGHT}_{INNER|OUTER}_TANK_TEMPERATURE).
 *
 * A320 FCOM DSC-28-20 FUEL TEMPERATURE INDICATION (a320_fcom.txt l.43178-43187): "This appears when its associated
 * temperature sensor is wet. It is normally in green. An advisory only appears in phases 2 and 6, when the fuel
 * temperature is: - Above 45 °C for the inner cell, or 55 °C for the outer cell. - Below -40 °C. It becomes amber, and
 * the ECAM displays a caution, if the temperature goes above the high limit or below the low limit."
 *
 * The limits of the cautions, FCOM PRO-ABN-FUEL:
 * - FUEL L (R) OUTER (INNER) TK HI TEMP (l.85983-85998): "This alert triggers when the fuel temperature: - In outer
 *   cell, is above 55 °C on ground - In outer cell, is above 60 °C in flight - In inner cell, is above 45 °C on ground -
 *   In inner cell, is above 54 °C in flight." (The 2019 FCOM PDF, PRO-ABN-FUEL P 45/74, gives a variant for later
 *   aircraft with the in-flight limits only; the text of a320_fcom.txt, "Applicable to: ALL", is used.)
 * - FUEL L (R) OUTER (INNER) TK LO TEMP (l.86059-86069): "This alert triggers when the fuel temperature is approximately
 *   below -43 °C."
 */

/** A cell of a wing tank */
export type FuelCell = 'inner' | 'outer';

/** l.85995-85998: the HI TEMP limits, °C */
export const FUEL_HIGH_TEMPERATURE_LIMIT_C = {
  inner: { onGround: 45, inFlight: 54 },
  outer: { onGround: 55, inFlight: 60 },
} as const;

/** l.86069: the LO TEMP limit, °C */
export const FUEL_LOW_TEMPERATURE_LIMIT_C = -43;

/** l.43183: the high temperatures of the advisory, °C */
export const FUEL_HIGH_TEMPERATURE_ADVISORY_C = { inner: 45, outer: 55 } as const;

/** l.43184: the low temperature of the advisory, °C */
export const FUEL_LOW_TEMPERATURE_ADVISORY_C = -40;

/** l.43182: the FWC flight phases of the advisory */
const ADVISORY_FLIGHT_PHASES = [2, 6];

/**
 * Design choice (the FCOM gives no sensor height): the temperature sensor of a cell is wet while the cell holds more
 * than this, kg.
 */
export const FUEL_TEMPERATURE_SENSOR_WET_MIN_KG = 20;

/** Whether the temperature sensor of a cell is wet (the temperature is measured and shown) */
export function isFuelTemperatureSensorWet(cellQuantityKg: number): boolean {
  return cellQuantityKg > FUEL_TEMPERATURE_SENSOR_WET_MIN_KG;
}

/** Whether the fuel of a cell is above its HI TEMP limit (l.85995-85998) */
export function isFuelTemperatureHigh(cell: FuelCell, temperatureC: number, onGround: boolean): boolean {
  const limits = FUEL_HIGH_TEMPERATURE_LIMIT_C[cell];
  return temperatureC > (onGround ? limits.onGround : limits.inFlight);
}

/** Whether the fuel of a cell is below the LO TEMP limit (l.86069) */
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
 * The SD FUEL page indication of a cell temperature (l.43178-43187).
 * @param cell the inner or outer cell
 * @param temperatureC the fuel temperature of the cell
 * @param cellQuantityKg the fuel in the cell
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
