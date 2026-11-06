// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';

/*
 * The SPEED SPEED SPEED synthetic voice of the A380 FWS (low energy alert): with the speed between VLS and Vprot in
 * CONF 2 to FULL, the voice asks the crew to add thrust before the alpha floor does. It is said again every 5 s until
 * the energy is recovered, a thrust lever is at TOGA or the alpha floor is active.
 *
 * In the aircraft the PRIMs send the alert to the FWS; the A380X PRIM model leaves its low energy output at false, so
 * the FWS computes the condition itself from the PRIM speeds.
 *
 * Not simulated: the alert with slats or flaps jammed (it stays available whenever they are not clean).
 */

/** The alert is available below this radio height, feet */
const LOW_ENERGY_MAX_RADIO_HEIGHT_FT = 2_500;

/** Lowest radio height of the alert after takeoff, feet */
const LOW_ENERGY_MIN_RADIO_HEIGHT_TAKEOFF_FT = 200;

/** Lowest radio height of the alert in approach, feet */
const LOW_ENERGY_MIN_RADIO_HEIGHT_LANDING_FT = 100;

/** CONF 2 in L:A32NX_FLAPS_CONF_INDEX; CONF 2S is 4, CONF 3 is 5 and FULL is 6 */
const LOW_ENERGY_MIN_FLAPS_CONF_INDEX = 3;

/**
 * Design choice: the alert speed lies this fraction of the way from Vprot to VLS when the energy is steady. The
 * alert has to come before the alpha floor, and close to Vprot.
 */
const LOW_ENERGY_STEADY_FRACTION = 0.25;

/**
 * Design choice: the same fraction in the landing phases with a negative flight path angle or a negative speed trend,
 * where the alert is said closer to VLS because the speed is being lost faster. Not used after takeoff: the takeoff
 * VLS is high and V2 can lie below it, so a normal climb after an engine failure at V2 would say SPEED.
 */
const LOW_ENERGY_DECAYING_FRACTION = 0.75;

/** SPEED SPEED SPEED is said again after this time while the low energy lasts, seconds */
export const LOW_ENERGY_REPEAT_SECONDS = 5;

/** Design choice: the phase tells takeoff (after lift-off) from landing (below 1500 ft), as the lowest radio height differs */
const TAKEOFF_FLIGHT_PHASES: readonly number[] = [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet];
const LANDING_FLIGHT_PHASES: readonly number[] = [
  FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
  FwcFlightPhase.AtOrBelow800Feet,
];

/** What the FWS does with the voice after an update: say it, or drop any queued or running call of it */
export type LowEnergyAuralAction = 'say' | 'stop' | null;

/** The part of an ARINC 429 word that the speed limit choice needs */
interface SpeedWord {
  value: number;
  isNormalOperation(): boolean;
}

/**
 * Design choice: outside normal law Vprot is not valid, and the low speed limit shown on the speed scale is the stall
 * warning speed, so that is the limit of the alert there; the alert is available in every flight control law.
 * @param vAlphaProt Vprot of one PRIM
 * @param stallWarning the stall warning speed of the same PRIM
 * @returns the low speed limit, knots, null when neither word is valid
 */
export function selectLowSpeedLimit(vAlphaProt: SpeedWord, stallWarning: SpeedWord): number | null {
  if (vAlphaProt.isNormalOperation()) {
    return vAlphaProt.value;
  }
  return stallWarning.isNormalOperation() ? stallWarning.value : null;
}

export interface LowEnergyAuralInputs {
  /** The computed airspeed, knots, null when no ADR gives it */
  casKt: number | null;
  /** VLS, low speed limit (see selectLowSpeedLimit), flight path angle and speed trend of one PRIM, null when no PRIM gives them */
  vlsKt: number | null;
  lowSpeedLimitKt: number | null;
  flightPathAngleDeg: number | null;
  speedTrendKt: number | null;
  /** The radio height, feet, null when no radio altimeter gives it */
  radioHeightFt: number | null;
  flightPhase: number;
  flapsConfIndex: number;
  anyThrustLeverToga: boolean;
  alphaFloorActive: boolean;
}

/**
 * @param inputs the aircraft state
 * @returns whether the energy is low enough for SPEED SPEED SPEED
 */
export function isLowEnergy(inputs: LowEnergyAuralInputs): boolean {
  const { casKt, vlsKt, lowSpeedLimitKt, flightPathAngleDeg, speedTrendKt, radioHeightFt } = inputs;
  if (
    casKt === null ||
    vlsKt === null ||
    lowSpeedLimitKt === null ||
    flightPathAngleDeg === null ||
    speedTrendKt === null ||
    radioHeightFt === null
  ) {
    return false;
  }

  const minRadioHeightFt = TAKEOFF_FLIGHT_PHASES.includes(inputs.flightPhase)
    ? LOW_ENERGY_MIN_RADIO_HEIGHT_TAKEOFF_FT
    : LANDING_FLIGHT_PHASES.includes(inputs.flightPhase)
      ? LOW_ENERGY_MIN_RADIO_HEIGHT_LANDING_FT
      : null;
  if (
    minRadioHeightFt === null ||
    radioHeightFt <= minRadioHeightFt ||
    radioHeightFt >= LOW_ENERGY_MAX_RADIO_HEIGHT_FT ||
    inputs.flapsConfIndex < LOW_ENERGY_MIN_FLAPS_CONF_INDEX ||
    inputs.anyThrustLeverToga ||
    inputs.alphaFloorActive
  ) {
    return false;
  }

  const fraction =
    LANDING_FLIGHT_PHASES.includes(inputs.flightPhase) && (flightPathAngleDeg < 0 || speedTrendKt < 0)
      ? LOW_ENERGY_DECAYING_FRACTION
      : LOW_ENERGY_STEADY_FRACTION;
  return casKt < lowSpeedLimitKt + fraction * (vlsKt - lowSpeedLimitKt);
}

export class FwsLowEnergyAural {
  /** Time since the last call, null once the repeat time has passed */
  private secondsSinceCall: number | null = null;

  private lowEnergyPreviously = false;

  /**
   * @param inputs the aircraft state
   * @param gpwsAlertActive whether a GPWS alert is sounding
   * @param deltaTimeSeconds the time since the last update
   * @returns 'say' when SPEED SPEED SPEED is to be said now, 'stop' once when the low energy ends (a call still
   * queued or running is then dropped), otherwise null
   */
  public update(
    inputs: LowEnergyAuralInputs,
    gpwsAlertActive: boolean,
    deltaTimeSeconds: number,
  ): LowEnergyAuralAction {
    const lowEnergy = isLowEnergy(inputs);

    // The time keeps running while the energy is not low, so that a flickering condition cannot call more often than
    // every repeat time
    if (this.secondsSinceCall !== null) {
      this.secondsSinceCall += deltaTimeSeconds;
      if (!lowEnergy && this.secondsSinceCall >= LOW_ENERGY_REPEAT_SECONDS) {
        this.secondsSinceCall = null;
      }
    }

    const lowEnergyEnded = this.lowEnergyPreviously && !lowEnergy;
    this.lowEnergyPreviously = lowEnergy;
    if (lowEnergyEnded) {
      return 'stop';
    }
    if (!lowEnergy) {
      return null;
    }

    const callDue = this.secondsSinceCall === null || this.secondsSinceCall >= LOW_ENERGY_REPEAT_SECONDS;
    // Design choice: while a GPWS alert is active, the voice waits
    if (callDue && !gpwsAlertActive) {
      this.secondsSinceCall = 0;
      return 'say';
    }
    return null;
  }
}
