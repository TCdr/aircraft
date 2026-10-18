// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AirportRunway, RunwaySurfaceType, RunwayUtils } from '@microsoft/msfs-sdk';
import { FEET_PER_METRE } from './PerformanceEntries';

/** The runways that cannot take an aircraft on wheels */
const WATER_SURFACES = [RunwaySurfaceType.WaterFSX, RunwaySurfaceType.Water, RunwaySurfaceType.WasteWater];

/** One runway direction, as the airport panel of T.O PERF and LDG PERF shows it */
export interface PerformanceRunway {
  /** e.g. 06, 27R */
  readonly ident: string;
  /** Magnetic bearing of the runway, degrees */
  readonly magneticBearing: number;
  /** The runway length for the takeoff run, metres */
  readonly takeoffLength: number;
  /** The landing distance available: the runway length after the displaced threshold, metres */
  readonly landingLength: number;
  /** Threshold elevation, feet */
  readonly elevation: number;
  /** Runway slope in %, negative downhill */
  readonly slope: number;
}

/** The runway data the performance applications use */
export type FacilityRunwayData = Pick<
  AirportRunway,
  | 'designation'
  | 'designatorCharPrimary'
  | 'designatorCharSecondary'
  | 'direction'
  | 'length'
  | 'primaryElevation'
  | 'secondaryElevation'
  | 'primaryThresholdLength'
  | 'secondaryThresholdLength'
  | 'surface'
>;

/**
 * The runway directions of an airport from the sim's airport data, in the order of their idents. The sim has no
 * clearway or stopway data: the runway length is the takeoff length.
 * @param runways the runways of the airport facility
 * @param magneticVariation the magnetic variation at the airport, degrees east positive
 * @returns the runway directions
 */
export function performanceRunways(
  runways: readonly FacilityRunwayData[],
  magneticVariation: number,
): PerformanceRunway[] {
  const result: PerformanceRunway[] = [];
  for (const runway of runways) {
    if (WATER_SURFACES.includes(runway.surface)) {
      continue;
    }
    const numbers = runway.designation.split('-');
    if (numbers.length !== 2 || numbers.some((n) => !/^\d{1,2}$/.test(n))) {
      continue;
    }
    for (const primary of [true, false]) {
      const number = numbers[primary ? 0 : 1].padStart(2, '0');
      const letter = RunwayUtils.getDesignatorLetter(
        primary ? runway.designatorCharPrimary : runway.designatorCharSecondary,
      );
      const trueBearing = primary ? runway.direction : (runway.direction + 180) % 360;
      const startElevation = primary ? runway.primaryElevation : runway.secondaryElevation;
      const endElevation = primary ? runway.secondaryElevation : runway.primaryElevation;
      const displacedThreshold = primary ? runway.primaryThresholdLength : runway.secondaryThresholdLength;
      result.push({
        ident: `${number}${letter}`,
        magneticBearing: (((trueBearing - magneticVariation) % 360) + 360) % 360,
        takeoffLength: runway.length,
        landingLength: runway.length - displacedThreshold,
        elevation: startElevation * FEET_PER_METRE,
        slope: runway.length > 0 ? ((endElevation - startElevation) / runway.length) * 100 : 0,
      });
    }
  }
  result.sort((a, b) => a.ident.localeCompare(b.ident));
  return result;
}
