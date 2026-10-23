// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '../../../flightplanning/FlightPlanManager';
import { FlightPlanService } from '../../../flightplanning/FlightPlanService';
import { FlightPlanTrackProfile } from '../wind/FlightPlanTrackProfile';
import { isaDeviationAt, ISA_TROPOPAUSE_ALTITUDE } from '../EconSpeeds';

/** The measured temperature stops influencing the forecast this far from the aircraft */
const MAX_MEASUREMENT_BLEND_DISTANCE = 200; // NM
const MAX_MEASUREMENT_BLEND_ALTITUDE = 10_000; // feet

/**
 * The ISA deviation expected at a cruise position: the SAT entered at the waypoint or propagated to it, else the
 * CRZ TEMP of the plan. The measured deviation counts near the aircraft and fades into it with distance and altitude.
 * Without any entry the measured deviation is used everywhere.
 * @param forecast the ISA deviation of the entries, null if there are none
 * @param measured the ISA deviation measured at the aircraft
 * @param distanceFromAircraft NM along the route
 * @param altitudeFromAircraft feet between the level and the aircraft
 */
export function blendCruiseIsaDeviation(
  forecast: number | null,
  measured: number,
  distanceFromAircraft: number,
  altitudeFromAircraft: number,
): number {
  if (forecast === null) {
    return measured;
  }
  const forecastWeight = Math.max(
    MathUtils.clamp(Math.abs(distanceFromAircraft) / MAX_MEASUREMENT_BLEND_DISTANCE, 0, 1),
    MathUtils.clamp(Math.abs(altitudeFromAircraft) / MAX_MEASUREMENT_BLEND_ALTITUDE, 0, 1),
  );
  return measured * (1 - forecastWeight) + forecast * forecastWeight;
}

export class TemperatureProfile {
  private readonly tracks = new FlightPlanTrackProfile(this.flightPlanService.get(this.index));

  constructor(
    private readonly flightPlanService: FlightPlanService,
    private readonly index: FlightPlanIndex,
  ) {}

  /** ISA deviation of the entries (SAT of the waypoint, else CRZ TEMP) at a cruise position, null if there are none */
  getCruiseForecastIsaDeviation(distanceFromStart: NauticalMiles): number | null {
    const plan = this.flightPlanService.get(this.index);
    const tropopause = plan.performanceData.tropopause.get() ?? ISA_TROPOPAUSE_ALTITUDE;

    const legIndex = this.tracks.getLegIndex(distanceFromStart);
    const entry = legIndex >= 0 ? plan.propagateTemperatureAt(legIndex) : null;
    if (entry !== null) {
      return isaDeviationAt(entry.altitude, entry.temperature, tropopause);
    }

    const cruiseLevel = plan.performanceData.cruiseFlightLevel.get();
    const cruiseTemperature = plan.performanceData.cruiseTemperature.get();
    return cruiseLevel !== null && cruiseTemperature !== null
      ? isaDeviationAt(cruiseLevel * 100, cruiseTemperature, tropopause)
      : null;
  }

  getCruiseIsaDeviation(
    distanceFromStart: NauticalMiles,
    distanceFromAircraft: NauticalMiles,
    altitude: Feet,
    measuredIsaDeviation: number,
    aircraftAltitude: Feet,
  ): number {
    return blendCruiseIsaDeviation(
      this.getCruiseForecastIsaDeviation(distanceFromStart),
      measuredIsaDeviation,
      distanceFromAircraft,
      altitude - aircraftAltitude,
    );
  }
}
