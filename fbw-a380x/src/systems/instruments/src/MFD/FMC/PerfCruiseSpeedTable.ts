// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';

/**
 * The second line of the CRZ speed mode table of the PERF page, in the CRZ phase:
 * - selected speed control: MANAGED, the managed cruise speed with its time and distance to the reference point (T/D, or
 *   the next step);
 * - managed speed control: ECON, only when a speed restriction makes the managed speed differ from the ECON speed (the
 *   climb speed limit below its altitude).
 */

/**
 * Design choice: the time to the reference point at the managed cruise speed keeps the distance of the flight plan
 * predictions (made with the selected speed) and flies it at the true airspeed of the managed target plus the present
 * wind component along the track (ground speed minus true airspeed).
 * @param distanceNm distance to the reference point
 * @param managedTrueAirspeedKt true airspeed of the managed cruise target
 * @param groundSpeedKt present ground speed
 * @param trueAirspeedKt present true airspeed
 * @returns seconds to the reference point at the managed speed, null when it cannot be computed
 */
export function managedCruiseSecondsToReference(
  distanceNm: number,
  managedTrueAirspeedKt: number,
  groundSpeedKt: number,
  trueAirspeedKt: number,
): number | null {
  const managedGroundSpeed = managedTrueAirspeedKt + (groundSpeedKt - trueAirspeedKt);
  if (!(distanceNm >= 0) || !(managedGroundSpeed > 0)) {
    return null;
  }
  return (distanceNm / managedGroundSpeed) * 3600;
}

/**
 * @param speedLimit the climb speed limit of the flight plan, which applies in cruise too
 * @param altitudeFt the aircraft altitude
 * @param econSpeedKt the ECON cruise speed
 * @returns whether the speed limit makes the managed cruise speed lower than the ECON speed
 */
export function isCruiseSpeedLimitApplied(
  speedLimit: SpeedLimit | null,
  altitudeFt: number,
  econSpeedKt: number,
): boolean {
  return speedLimit !== null && altitudeFt < speedLimit.underAltitude && speedLimit.speed < econSpeedKt;
}
