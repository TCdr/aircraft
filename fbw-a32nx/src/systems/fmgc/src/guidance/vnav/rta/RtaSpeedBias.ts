// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Common } from '@fmgc/guidance/vnav/common';
import { EconAircraftParameters, EconSpeedSet, ISA_TROPOPAUSE_ALTITUDE } from '@fmgc/guidance/vnav/EconSpeeds';

/**
 * The speed range of the RTA speed control, in each phase: from green dot to the VMO/MMO margins of the ECON speeds
 * (A320: VMO - 10 kt / MMO - 0.02).
 */
export interface RtaSpeedEnvelope {
  /** lowest speeds, in knots CAS */
  climbMinSpeed: number;
  cruiseMinSpeed: number;
  descentMinSpeed: number;
  /** lowest cruise Mach (the cruise minimum speed at the cruise level) */
  cruiseMinMach: number;
  /** highest speed, in knots CAS */
  maxSpeed: number;
  /** highest Mach (MMO margin, or the maximum speed at the cruise level when lower) */
  maxMach: number;
}

/**
 * The RTA speed range: the lowest speeds of each phase (green dot, given by the aircraft), the highest speed and Mach
 * of the ECON speeds (VMO and MMO less their margins), and their Mach at the cruise level.
 * @param cruiseAltitude in feet
 * @param tropopause in feet, null for the ISA tropopause
 */
export function rtaSpeedEnvelope(
  aircraft: EconAircraftParameters,
  cruiseAltitude: number,
  tropopause: number | null,
  minSpeeds: { climb: number; cruise: number; descent: number },
): RtaSpeedEnvelope {
  const delta = Common.getDelta(cruiseAltitude, cruiseAltitude > (tropopause ?? ISA_TROPOPAUSE_ALTITUDE));
  return {
    climbMinSpeed: minSpeeds.climb,
    cruiseMinSpeed: minSpeeds.cruise,
    descentMinSpeed: minSpeeds.descent,
    cruiseMinMach: Common.CAStoMach(minSpeeds.cruise, delta),
    maxSpeed: aircraft.maxSpeed,
    maxMach: Math.min(aircraft.maxMach, Common.CAStoMach(aircraft.maxSpeed, delta)),
  };
}

/**
 * Moves a value from its ECON value toward the top (bias +1) or the bottom (bias -1) of its range. The ECON value is
 * kept inside the range first.
 */
function biased(econ: number, bias: number, min: number, max: number): number {
  const centre = Math.min(max, Math.max(min, econ));
  return bias >= 0 ? centre + bias * (max - centre) : centre + bias * (centre - min);
}

/**
 * The managed speeds that meet the RTA: the ECON speeds moved by the RTA speed bias, between the lowest (bias -1) and
 * the highest (bias +1) speed of the RTA range. The climb and descent Mach stay the cruise Mach, as for the ECON
 * speeds.
 *
 * Design choice: the RTA Mach is not rounded (the ECON Mach is rounded to two decimals) so that the time can be met
 * within seconds after hours of cruise; the speeds are rounded to the knot.
 */
export function applyRtaSpeedBias(econ: EconSpeedSet, bias: number, envelope: RtaSpeedEnvelope): EconSpeedSet {
  const clampedBias = Math.max(-1, Math.min(1, bias));
  if (clampedBias === 0) {
    return econ;
  }
  const cruiseMach = biased(econ.cruiseMach, clampedBias, envelope.cruiseMinMach, envelope.maxMach);
  const speed = (econSpeed: number, minSpeed: number) =>
    Math.round(biased(econSpeed, clampedBias, minSpeed, envelope.maxSpeed));
  return {
    climbSpeed: speed(econ.climbSpeed, envelope.climbMinSpeed),
    climbMach: cruiseMach,
    cruiseSpeed: speed(econ.cruiseSpeed, envelope.cruiseMinSpeed),
    cruiseMach,
    descentSpeed: speed(econ.descentSpeed, envelope.descentMinSpeed),
    descentMach: cruiseMach,
  };
}

/**
 * How much faster (up) and slower (down) the full bias makes the aircraft, as fractions of the ECON cruise Mach: the
 * speed controller uses it for its first step.
 */
export function rtaSpeedSpan(econ: EconSpeedSet, envelope: RtaSpeedEnvelope): { up: number; down: number } {
  const mach = econ.cruiseMach;
  if (!(mach > 0)) {
    return { up: 0, down: 0 };
  }
  return {
    up: Math.max(0, envelope.maxMach - mach) / mach,
    down: Math.max(0, mach - envelope.cruiseMinMach) / mach,
  };
}
