// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The ECON (or RTA) cruise target is a Mach above this cruise level, a speed below it. Design choice: at exactly
 * FL200 it is a speed.
 */
const LOWEST_MACH_CRUISE_FLIGHT_LEVEL = 200;

export interface ManagedCruiseTargetInputs {
  /** ECON cruise speed, or the RTA speed with a time constraint */
  econSpeed: Knots;
  econMach: Mach;
  cruiseFlightLevel: number | null;
  /** Mach of the CMS the aircraft flies, null outside a CMS */
  constantMach: Mach | null;
  /** the climb speed limit while the aircraft is below its altitude, else null */
  speedLimit: Knots | null;
  vmo: Knots;
  /** CAS of a Mach at the present static pressure, null without valid air data */
  machToCas: (mach: Mach) => Knots | null;
}

export interface ManagedCruiseTarget {
  /** the CAS the flight guidance targets (of the Mach for a Mach target) */
  cas: Knots;
  /** the Mach of a Mach target, null for a speed target */
  mach: Mach | null;
  speedLimitApplied: boolean;
}

/**
 * The managed target in the CRZ phase, sent to the flight guidance and shown on the MANAGED line of the PERF CRZ
 * table. The ECON cruise speed is the CAS of the ECON Mach at the CRZ FL, so the two only differ by rounding and by
 * the difference between the CRZ FL and the present pressure: the target type comes from the cruise level, not from
 * the lower of the two.
 */
export function managedCruiseTarget(inputs: ManagedCruiseTargetInputs): ManagedCruiseTarget {
  const unrestricted = unrestrictedCruiseTarget(inputs);
  if (inputs.speedLimit !== null && inputs.speedLimit < unrestricted.cas) {
    return { cas: inputs.speedLimit, mach: null, speedLimitApplied: true };
  }
  return { ...unrestricted, speedLimitApplied: false };
}

function unrestrictedCruiseTarget(inputs: ManagedCruiseTargetInputs): { cas: Knots; mach: Mach | null } {
  const { econSpeed, econMach, cruiseFlightLevel, constantMach, vmo, machToCas } = inputs;
  const mach = constantMach ?? econMach;
  const machCas = machToCas(mach);
  if (machCas === null) {
    return { cas: econSpeed, mach: null };
  }

  let isMachTarget: boolean;
  if (constantMach !== null) {
    isMachTarget = true;
  } else if (cruiseFlightLevel !== null) {
    isMachTarget = cruiseFlightLevel > LOWEST_MACH_CRUISE_FLIGHT_LEVEL;
  } else {
    // Without a cruise level the ECON speeds are defaults: the lower of the two targets
    isMachTarget = machCas < econSpeed;
  }
  if (!isMachTarget) {
    return { cas: econSpeed, mach: null };
  }
  return machCas > vmo ? { cas: vmo, mach: null } : { cas: machCas, mach };
}

/**
 * The speed or Mach of a cruise waypoint prediction (F-PLN SPD column), by the rule of the managed cruise target, so
 * that the F-PLN shows the target type the aircraft flies.
 * @param machCas CAS of the predicted Mach at the predicted altitude
 */
export function cruisePredictionSpeedOrMach(
  cas: Knots,
  mach: Mach,
  machCas: Knots,
  cruiseFlightLevel: number | null,
  vmo: Knots,
): Knots | Mach {
  const target = managedCruiseTarget({
    econSpeed: cas,
    econMach: mach,
    cruiseFlightLevel,
    constantMach: null,
    speedLimit: null,
    vmo,
    machToCas: () => machCas,
  });
  return target.mach ?? target.cas;
}
