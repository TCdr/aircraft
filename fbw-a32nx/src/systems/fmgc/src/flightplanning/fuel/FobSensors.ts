// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/*
 * The fuel on board (FOB) of the A320 FMS and the fuel sensors it is computed from (FUEL PRED page [4R]).
 *
 * The FUEL PRED page shows the FOB with the sensors it comes from: fuel flow and fuel quantity (/FF+FQ), fuel flow
 * only (/FF) or fuel quantity only (/FQ). In flight the crew can enter a FOB, or the sensors (/FF, /FQ, /FF+FQ or
 * /FQ+FF). The FOB is entered as NN.N (leading zeros may be omitted), in thousands of kg or lb.
 * SENSOR IS INVALID: the sole selected sensor or both selected sensors are invalid, or the crew entered a FOB only
 * while the FF sensor is invalid.
 * After the first engine start the predictions use the FOB of the FQI computer.
 *
 * What the sensors mean here:
 * - FQ: the fuel quantity gauged by the FQI.
 * - FF: a reference FOB minus the fuel the engines burnt since then (fuel flow integration). The reference is the last
 *   FQ value used, or the FOB the crew entered. So the FF value only sees what the engines burn (a fuel leak does not
 *   lower it).
 * - FF+FQ (the default): the FQ value; the FF value when the FQ is invalid (both FQI channels failed), since the FMS
 *   then still has the other selected sensor.
 * Design choice (the aircraft documents give no rule): when the only selected sensor becomes invalid later on, the FMS
 * goes on with the other one, so that the predictions are kept.
 */

/** The fuel sensors the FMS computes the FOB from */
export enum FobSensors {
  /** Fuel flow and fuel quantity sensors (/FF+FQ), the default */
  FuelFlowAndQuantity,
  /** Fuel flow sensors only (/FF) */
  FuelFlow,
  /** Fuel quantity sensors only (/FQ) */
  FuelQuantity,
}

/** The text of the FOB sensors on the FUEL PRED page, after the FOB and its slash */
export function fobSensorsText(sensors: FobSensors): string {
  switch (sensors) {
    case FobSensors.FuelFlow:
      return 'FF';
    case FobSensors.FuelQuantity:
      return 'FQ';
    default:
      return 'FF+FQ';
  }
}

/** A parsed FOB [4R] entry: the FOB, the sensors, or both */
export interface FobEntry {
  /** The entered FOB, in the user's unit (thousands of kg or lb), null when only the sensors are entered */
  fob: number | null;
  /** The entered sensors, null when only the FOB is entered */
  sensors: FobSensors | null;
}

/** The entry formats: NN.N, /FF, /FQ, /FF+FQ, /FQ+FF, or NN.N followed by one of the sensor entries */
const FOB_ENTRY_FORMAT = /^(\d{1,3}(?:\.\d)?|\.\d)?(?:\/(FF\+FQ|FQ\+FF|FF|FQ))?$/;

/**
 * Parses a FOB [4R] entry of the FUEL PRED page.
 * @param entry the scratchpad text
 * @returns the entry, or null on a format error
 */
export function parseFobEntry(entry: string): FobEntry | null {
  const match = FOB_ENTRY_FORMAT.exec(entry.replace(/ /g, ''));
  if (match === null || (match[1] === undefined && match[2] === undefined)) {
    return null;
  }
  let sensors: FobSensors | null = null;
  if (match[2] === 'FF') {
    sensors = FobSensors.FuelFlow;
  } else if (match[2] === 'FQ') {
    sensors = FobSensors.FuelQuantity;
  } else if (match[2] !== undefined) {
    sensors = FobSensors.FuelFlowAndQuantity;
  }
  return { fob: match[1] !== undefined ? parseFloat(match[1]) : null, sensors };
}

/** Whether the selected sensors give no valid value: the sole sensor, or both of them, invalid (SENSOR IS INVALID) */
export function areFobSensorsInvalid(sensors: FobSensors, fuelFlowValid: boolean, fuelQuantityValid: boolean): boolean {
  switch (sensors) {
    case FobSensors.FuelFlow:
      return !fuelFlowValid;
    case FobSensors.FuelQuantity:
      return !fuelQuantityValid;
    default:
      return !fuelFlowValid && !fuelQuantityValid;
  }
}

/** The sensor readings the FOB is computed from, all fuel values in tonnes (or all in another common unit) */
export interface FobSensorReadings {
  /** The FOB gauged by the FQI */
  fuelQuantity: number;
  /** Whether the FQI gives a valid FOB (at least one FQI channel works) */
  fuelQuantityValid: boolean;
  /** The fuel used by the engines, from their fuel flow, since the FADEC counters were reset */
  fuelUsed: number;
}

/** The FMS FOB computed from the selected fuel sensors, and the crew entries that change it */
export class FobSensorComputer {
  private selectedSensors = FobSensors.FuelFlowAndQuantity;

  /** The FOB the fuel flow integration starts from, null before a first FQ value or crew entry */
  private fuelFlowReferenceFob: number | null = null;

  /** The fuel used counter at the reference FOB */
  private fuelFlowReferenceFuelUsed = 0;

  /** The fuel used counter at the previous computation, to see a counter reset */
  private lastFuelUsed = 0;

  public get sensors(): FobSensors {
    return this.selectedSensors;
  }

  /** Back to the default sensors, without a reference FOB (FMS reset at the end of a flight) */
  public reset(): void {
    this.selectedSensors = FobSensors.FuelFlowAndQuantity;
    this.fuelFlowReferenceFob = null;
    this.fuelFlowReferenceFuelUsed = 0;
    this.lastFuelUsed = 0;
  }

  /**
   * The FOB from the selected sensors.
   * @param readings the sensor readings
   * @returns the FOB, null when no sensor gives a value
   */
  public compute(readings: FobSensorReadings): number | null {
    this.followFuelUsedCounterReset(readings.fuelUsed);

    const useFuelQuantity = this.selectedSensors !== FobSensors.FuelFlow && readings.fuelQuantityValid;
    if (useFuelQuantity) {
      // the fuel flow integration goes on from the last FQ value
      this.fuelFlowReferenceFob = readings.fuelQuantity;
      this.fuelFlowReferenceFuelUsed = readings.fuelUsed;
      return readings.fuelQuantity;
    }

    if (this.fuelFlowReferenceFob === null) {
      if (!readings.fuelQuantityValid) {
        return null;
      }
      this.fuelFlowReferenceFob = readings.fuelQuantity;
      this.fuelFlowReferenceFuelUsed = readings.fuelUsed;
    }
    return Math.max(0, this.fuelFlowReferenceFob - (readings.fuelUsed - this.fuelFlowReferenceFuelUsed));
  }

  /**
   * Selects the sensors (entry /FF, /FQ, /FF+FQ or /FQ+FF).
   * @returns false (SENSOR IS INVALID, the selection unchanged) when the selected sensors give no valid value
   */
  public selectSensors(sensors: FobSensors, fuelFlowValid: boolean, fuelQuantityValid: boolean): boolean {
    if (areFobSensorsInvalid(sensors, fuelFlowValid, fuelQuantityValid)) {
      return false;
    }
    this.selectedSensors = sensors;
    return true;
  }

  /**
   * Enters a FOB (in flight): the fuel flow integration starts from it, and the FMS uses the fuel flow sensors.
   * @param fob the entered FOB
   * @param fuelUsed the fuel used counter now
   * @param fuelFlowValid whether the fuel flow sensors are valid
   * @returns false (SENSOR IS INVALID, nothing changed) when the fuel flow sensors are invalid
   */
  public enterFob(fob: number, fuelUsed: number, fuelFlowValid: boolean): boolean {
    if (!fuelFlowValid) {
      return false;
    }
    this.followFuelUsedCounterReset(fuelUsed);
    this.fuelFlowReferenceFob = fob;
    this.fuelFlowReferenceFuelUsed = fuelUsed;
    this.selectedSensors = FobSensors.FuelFlow;
    return true;
  }

  /**
   * The FADEC resets its fuel used counters to 0 at an engine start on the ground (EngineControlA32NX.cpp): the fuel
   * burnt up to the reset is taken off the reference, so that the fuel flow value does not jump back up.
   */
  private followFuelUsedCounterReset(fuelUsed: number): void {
    if (fuelUsed < this.lastFuelUsed && this.fuelFlowReferenceFob !== null) {
      this.fuelFlowReferenceFob -= this.lastFuelUsed - this.fuelFlowReferenceFuelUsed;
      this.fuelFlowReferenceFuelUsed = 0;
    }
    this.lastFuelUsed = fuelUsed;
  }
}
