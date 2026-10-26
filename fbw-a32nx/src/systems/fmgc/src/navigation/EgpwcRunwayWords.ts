// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429SignStatusMatrix, FmArinc429OutputWord, Runway } from '@flybywiresim/fbw-sdk';
import { distanceTo } from 'msfs-geo';

const FEET_PER_METRE = 1 / 0.3048;
const FEET_PER_NAUTICAL_MILE = 6076.12;

/**
 * A runway as the EGPWC terrain functions use it: the point where it starts in the direction of use, with its
 * direction and length from there
 */
export interface EgpwcRunway {
  latitude: number;
  longitude: number;
  /** feet */
  elevation: number;
  /** degrees true */
  trueBearing: number;
  /** feet, from the start point to the far end */
  length: number;
}

/** The runways of the flight plan the terrain functions read */
export interface EgpwcRunwaysOfPlan {
  originRunway?: Runway;
  destinationRunway?: Runway;
}

/** The origin runway starts at its physical start, where the takeoff roll can start */
export function egpwcOriginRunway(runway: Runway | undefined): EgpwcRunway | null {
  if (!runway || !Number.isFinite(runway.thresholdLocation.alt)) {
    return null;
  }
  return {
    latitude: runway.startLocation.lat,
    longitude: runway.startLocation.long,
    elevation: runway.thresholdLocation.alt,
    trueBearing: runway.bearing,
    length: runway.length * FEET_PER_METRE,
  };
}

/** The destination runway starts at its threshold, which can be displaced from the physical start */
export function egpwcDestinationRunway(runway: Runway | undefined): EgpwcRunway | null {
  if (!runway || !Number.isFinite(runway.thresholdLocation.alt)) {
    return null;
  }
  const displacement = distanceTo(runway.startLocation, runway.thresholdLocation) * FEET_PER_NAUTICAL_MILE;
  return {
    latitude: runway.thresholdLocation.lat,
    longitude: runway.thresholdLocation.long,
    elevation: runway.thresholdLocation.alt,
    trueBearing: runway.bearing,
    length: Math.max(0, runway.length * FEET_PER_METRE - displacement),
  };
}

/**
 * The origin and destination runways the FMGC sends to the EGPWC, NCD without one. The destination threshold and
 * elevation already go out in the DEST_LAT, DEST_LONG and LANDING_ELEVATION words, which fall back to the airport
 * reference point without a runway; the destination direction and length come here.
 */
export class EgpwcRunwayWords {
  private readonly originLatitude = new FmArinc429OutputWord('ORIGIN_RWY_LAT');
  private readonly originLongitude = new FmArinc429OutputWord('ORIGIN_RWY_LONG');
  private readonly originElevation = new FmArinc429OutputWord('ORIGIN_RWY_ELEVATION');
  private readonly originTrueBearing = new FmArinc429OutputWord('ORIGIN_RWY_TRUE_BEARING');
  private readonly originLength = new FmArinc429OutputWord('ORIGIN_RWY_LENGTH');
  private readonly destinationTrueBearing = new FmArinc429OutputWord('DEST_RWY_TRUE_BEARING');
  private readonly destinationLength = new FmArinc429OutputWord('DEST_RWY_LENGTH');

  readonly words: readonly FmArinc429OutputWord[] = [
    this.originLatitude,
    this.originLongitude,
    this.originElevation,
    this.originTrueBearing,
    this.originLength,
    this.destinationTrueBearing,
    this.destinationLength,
  ];

  update(plan: EgpwcRunwaysOfPlan | null): void {
    const origin = egpwcOriginRunway(plan?.originRunway);
    const destination = egpwcDestinationRunway(plan?.destinationRunway);
    const originSsm = origin ? Arinc429SignStatusMatrix.NormalOperation : Arinc429SignStatusMatrix.NoComputedData;
    const destinationSsm = destination
      ? Arinc429SignStatusMatrix.NormalOperation
      : Arinc429SignStatusMatrix.NoComputedData;

    // Position and elevation encoded as the destination words; an angle word holds -180 to 180 degrees
    this.originLatitude.setBnrValue(origin?.latitude ?? 0, originSsm, 18, 180, -180);
    this.originLongitude.setBnrValue(origin?.longitude ?? 0, originSsm, 18, 180, -180);
    this.originElevation.setBnrValue(origin?.elevation ?? 0, originSsm, 14, 16384, -2048);
    this.originTrueBearing.setBnrValue(signedBearing(origin?.trueBearing ?? 0), originSsm, 15, 180, -180);
    this.originLength.setBnrValue(origin?.length ?? 0, originSsm, 15, 32768);
    this.destinationTrueBearing.setBnrValue(
      signedBearing(destination?.trueBearing ?? 0),
      destinationSsm,
      15,
      180,
      -180,
    );
    this.destinationLength.setBnrValue(destination?.length ?? 0, destinationSsm, 15, 32768);
  }
}

/** A BNR angle word holds -180 to 180 degrees */
function signedBearing(bearing: number): number {
  return bearing > 180 ? bearing - 360 : bearing;
}
