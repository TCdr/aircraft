// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AwarenessRunway, AwarenessRunwayGeometry, RunwayFramePosition } from '@flybywiresim/fbw-sdk';

/**
 * The RWY AHEAD prediction volume against the runways of the sim's airport database, for when OANS has no airport
 * map (AMDB) loaded: the rectangle from the aircraft nose to where the aircraft will be in 7 s, 60 m wide, the same
 * volume as with the airport map.
 */
export class OansRunwayAheadWithoutMap {
  private static readonly pos: RunwayFramePosition = { along: 0, cross: 0 };

  private static readonly centre: RunwayFramePosition = { along: 0, cross: 0 };

  /**
   * The runways the prediction volume enters and the aircraft is not on yet.
   * @param runways the runways around the aircraft
   * @param latitude the aircraft latitude, in degrees
   * @param longitude the aircraft longitude, in degrees
   * @param trueHeading the aircraft true heading, in degrees
   * @param noseDistance the distance from the aircraft position to its nose, in metres
   * @param horizon the distance from the aircraft position to the far end of the volume, in metres
   * @param halfWidth the half width of the volume, in metres
   * @returns the runways, as their QFU (e.g. "09L - 27R")
   */
  public static runwaysAhead(
    runways: readonly AwarenessRunway[],
    latitude: number,
    longitude: number,
    trueHeading: number,
    noseDistance: number,
    horizon: number,
    halfWidth: number,
  ): string[] {
    const qfus: string[] = [];
    for (const runway of runways) {
      AwarenessRunwayGeometry.toRunwayFrame(runway, latitude, longitude, 0, 0, OansRunwayAheadWithoutMap.pos);
      if (AwarenessRunwayGeometry.isOnRunway(runway, OansRunwayAheadWithoutMap.pos)) {
        continue;
      }
      AwarenessRunwayGeometry.toRunwayFrame(
        runway,
        latitude,
        longitude,
        (noseDistance + horizon) / 2,
        trueHeading,
        OansRunwayAheadWithoutMap.centre,
      );
      if (
        OansRunwayAheadWithoutMap.intersects(
          runway,
          OansRunwayAheadWithoutMap.centre,
          trueHeading,
          (horizon - noseDistance) / 2,
          halfWidth,
        )
      ) {
        qfus.push(`${runway.ends[0].ident} - ${runway.ends[1].ident}`);
      }
    }
    return qfus;
  }

  /**
   * Whether a rectangle crosses a runway (separating axis test of two rectangles).
   * @param runway the runway
   * @param centre the centre of the rectangle, in the runway frame
   * @param trueHeading the direction of the rectangle's length, in degrees true
   * @param halfLength the half length of the rectangle, in metres
   * @param halfWidth the half width of the rectangle, in metres
   */
  public static intersects(
    runway: AwarenessRunway,
    centre: RunwayFramePosition,
    trueHeading: number,
    halfLength: number,
    halfWidth: number,
  ): boolean {
    const relative = ((trueHeading - runway.ends[0].course) * Math.PI) / 180;
    // The rectangle's axes in the runway frame (along, cross)
    const forward = [Math.cos(relative), Math.sin(relative)];
    const right = [-Math.sin(relative), Math.cos(relative)];
    const axes = [[1, 0], [0, 1], forward, right];
    for (const [a, c] of axes) {
      const distance = Math.abs(centre.along * a + centre.cross * c);
      const runwayExtent = (runway.length / 2) * Math.abs(a) + (runway.width / 2) * Math.abs(c);
      const volumeExtent =
        halfLength * Math.abs(forward[0] * a + forward[1] * c) + halfWidth * Math.abs(right[0] * a + right[1] * c);
      if (distance > runwayExtent + volumeExtent) {
        return false;
      }
    }
    return true;
  }
}
