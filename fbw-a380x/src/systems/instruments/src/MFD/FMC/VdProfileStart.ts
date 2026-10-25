// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VerticalPathCheckpoint } from '@flybywiresim/fbw-sdk';

/**
 * On the ground the profile starts at the take-off point of the plan, which lies behind an aircraft parked or taxiing
 * past it, so the first part of the climb would fall off the left edge of the VD. The whole profile is then moved
 * back so that the take-off point sits at the aircraft: the climb keeps the distances the FMS predicts.
 */
export function startProfileAtAircraftOnGround(
  profile: VerticalPathCheckpoint[],
  isOnGround: boolean,
): VerticalPathCheckpoint[] {
  if (!isOnGround || profile.length === 0 || profile[0].distanceFromAircraft >= 0) {
    return profile;
  }

  const shift = profile[0].distanceFromAircraft;
  return profile.map((point) => ({ ...point, distanceFromAircraft: point.distanceFromAircraft - shift }));
}
