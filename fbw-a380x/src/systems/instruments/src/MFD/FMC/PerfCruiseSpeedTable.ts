// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';

/**
 * The CRZ speed mode table of the PERF page, in the CRZ phase:
 * - the MANAGED line shows the managed cruise target and, in small font, the speed restriction that sets it;
 * - the ECON line shows the ECON speed/Mach when the managed target differs from it;
 * - the speed restriction label below the table gives the restriction speed with its end altitude or hold waypoint.
 */

/** The restrictions of the managed cruise speed, in decreasing order of priority */
export type CruiseSpeedRestriction = 'SPD LIM' | 'CMS' | 'HOLD SPD' | 'PROC SP' | 'RTA';

export interface CruiseSpeedRestrictionInputs {
  /** the climb speed limit lowers the managed target (the aircraft is below its altitude) */
  speedLimitApplied: boolean;
  /** the managed target is the Mach of the CMS the aircraft flies */
  constantMachApplied: boolean;
  /** the managed target is the hold speed, null outside a hold and its deceleration */
  hold: { isProcedureIcaoLimit: boolean } | null;
  /** the managed target is optimized for a time constraint */
  rtaApplied: boolean;
}

export function cruiseSpeedRestriction(inputs: CruiseSpeedRestrictionInputs): CruiseSpeedRestriction | null {
  if (inputs.speedLimitApplied) {
    return 'SPD LIM';
  }
  if (inputs.constantMachApplied) {
    return 'CMS';
  }
  if (inputs.hold !== null) {
    return inputs.hold.isProcedureIcaoLimit ? 'PROC SP' : 'HOLD SPD';
  }
  return inputs.rtaApplied ? 'RTA' : null;
}

/** The title of the speed restriction label below the table; the CMS and RTA have none */
export function cruiseSpeedRestrictionLabelTitle(restriction: CruiseSpeedRestriction | null): string | null {
  switch (restriction) {
    case 'SPD LIM':
      return 'CLB SPD LIM';
    case 'HOLD SPD':
      return 'HOLD SPD';
    case 'PROC SP':
      return 'PROC SPD';
    default:
      return null;
  }
}

/** The managed cruise target of a flight plan, with the speed restriction that sets it */
export interface ManagedCruiseSpeedInfo {
  /** CAS of the target (of the Mach when the target is a Mach) */
  targetCas: Knots;
  /** the Mach of a Mach target, null for a speed target */
  targetMach: Mach | null;
  restriction: CruiseSpeedRestriction | null;
  /** the climb speed limit, when it is the restriction */
  speedLimit: SpeedLimit | null;
  /** the hold waypoint, when the hold speed is the restriction */
  holdWaypoint: string | null;
  econSpeed: Knots;
  econMach: Mach;
  /** CAS of the ECON target (of the Mach when the ECON target is a Mach) */
  econCas: Knots;
}

/** The speed and Mach cells of a managed line: the active target type gets the value, the other one dashes */
export function managedTargetCells(info: ManagedCruiseSpeedInfo): { speed: string; mach: string } {
  return info.targetMach !== null
    ? { speed: '---', mach: formatMach(info.targetMach) }
    : { speed: info.targetCas.toFixed(0), mach: '.--' };
}

/**
 * The ECON line is shown only when the managed target differs from the ECON target. The targets are compared as CAS,
 * so that a Mach target and a speed target compare too.
 */
export function isEconLineShown(info: ManagedCruiseSpeedInfo): boolean {
  return Math.round(info.targetCas) !== Math.round(info.econCas);
}

export function formatMach(mach: Mach): string {
  return `.${mach.toFixed(2).split('.')[1]}`;
}

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
