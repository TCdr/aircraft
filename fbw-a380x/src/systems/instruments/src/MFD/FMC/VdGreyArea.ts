// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MathUtils } from '@flybywiresim/fbw-sdk';

/** Beyond a turn of more than this, the terrain on the VD no longer lies straight ahead of the aircraft */
const GREY_AREA_TRACK_CHANGE_THRESHOLD_DEGREES = 3;

/**
 * Whether the vertical display grey area starts where the flight plan turns from one track to the next.
 * @param previousTrack track of the leg before the waypoint, degrees true
 * @param nextTrack track of the leg after the waypoint, degrees true
 */
export function isGreyAreaTrackChange(previousTrack: number, nextTrack: number): boolean {
  return Math.abs(MathUtils.diffAngle(previousTrack, nextTrack)) > GREY_AREA_TRACK_CHANGE_THRESHOLD_DEGREES;
}
