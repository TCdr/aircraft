// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Thrust setting alerts of the A320:
 *
 * - ENG 1(2) THR LEVER ABV IDLE: at landing, one thrust lever is above idle while the other is in the reverse detent;
 *   or, at the reverser deselection during the landing roll, one lever is above idle while the other is at idle. The
 *   repetitive RETARD-RETARD synthetic voice sounds at landing. THR LEVER (AFFECTED ENGINE) ... IDLE. A red warning
 *   with the master warning lights, inhibited in the flight phases 1, 5 and 10. No STATUS.
 * - ENG SAT ABOVE FLEX TEMP: the SAT is above the FLEX TEMP; T.O DATA ... CHECK. An amber caution, shown in flight
 *   phase 2 only. No STATUS.
 */

/** ENG 1(2) THR LEVER ABV IDLE flight phase inhibition */
export const THR_LEVER_ABV_IDLE_PHASE_INHIBITION = [1, 5, 10];

/** ENG SAT ABOVE FLEX TEMP flight phase inhibition: shown in phase 2 only */
export const SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION = [1, 3, 4, 5, 6, 7, 8, 9, 10];

/*
 * Thrust lever angle ranges, in degrees, the ones the FWC already uses (PseudoFWC thr1TLAReverse, FwsAutoCallouts
 * engine1TlaIdle): in the reverse range below -4.3, at the idle detent from -4.3 to 2.6, above idle from 2.6.
 */
const REVERSE_TLA_BELOW_DEGREES = -4.3;
const ABOVE_IDLE_TLA_FROM_DEGREES = 2.6;

/** The RETARD-RETARD voice of THR LEVER ABV IDLE sounds above this speed */
const RETARD_CALLOUT_MIN_SPEED_KNOTS = 40;

export function isThrustLeverInReverse(tlaDegrees: number): boolean {
  return tlaDegrees < REVERSE_TLA_BELOW_DEGREES;
}

export function isThrustLeverAboveIdle(tlaDegrees: number): boolean {
  return tlaDegrees >= ABOVE_IDLE_TLA_FROM_DEGREES;
}

export function isThrustLeverAtIdle(tlaDegrees: number): boolean {
  return !isThrustLeverInReverse(tlaDegrees) && !isThrustLeverAboveIdle(tlaDegrees);
}

/**
 * The landing roll of the THR LEVER ABV IDLE triggers: on ground in the FWC flight phases 8 (touchdown to 80 kt) and 9
 * (80 kt to the second engine shutdown). Design choice: the alert is documented "at landing" and "during landing roll"
 * without a phase; these are the two ground phases after the touchdown.
 */
function isLandingRoll(onGround: boolean, flightPhase: number): boolean {
  return onGround && (flightPhase === 8 || flightPhase === 9);
}

export interface ThrustLeverAboveIdleInputs {
  onGround: boolean;
  flightPhase: number;
  /** Thrust lever angle of engine 1 and engine 2, degrees */
  tlaDegrees: readonly [number, number];
}

/**
 * ENG 1(2) THR LEVER ABV IDLE of both engines.
 *
 * The second trigger ("at reverser deselection") needs the memory of a reverse selection: it is armed when a thrust
 * lever is in the reverse range during the landing roll, and disarmed once no lever is in reverse or above idle (the
 * deselection is finished with both levers at idle), or when the landing roll ends. Design choice: no
 * time is documented for "at reverser deselection"; this keeps the alert away from a normal taxi with one lever above idle.
 */
export class ThrustLeverAboveIdleMonitor {
  private reverserDeselectionArmed = false;

  private readonly active: [boolean, boolean] = [false, false];

  update(inputs: ThrustLeverAboveIdleInputs): void {
    const landingRoll = isLandingRoll(inputs.onGround, inputs.flightPhase);
    const inReverse = inputs.tlaDegrees.map(isThrustLeverInReverse);
    const aboveIdle = inputs.tlaDegrees.map(isThrustLeverAboveIdle);
    const atIdle = inputs.tlaDegrees.map(isThrustLeverAtIdle);

    if (!landingRoll || (!inReverse[0] && !inReverse[1] && !aboveIdle[0] && !aboveIdle[1])) {
      this.reverserDeselectionArmed = false;
    } else if (inReverse[0] || inReverse[1]) {
      this.reverserDeselectionArmed = true;
    }

    for (const engineIndex of [0, 1]) {
      const otherIndex = 1 - engineIndex;
      this.active[engineIndex] =
        landingRoll &&
        aboveIdle[engineIndex] &&
        (inReverse[otherIndex] || (this.reverserDeselectionArmed && atIdle[otherIndex]));
    }
  }

  /** @param engineIndex 0 = engine 1, 1 = engine 2 */
  isActive(engineIndex: number): boolean {
    return this.active[engineIndex];
  }

  /**
   * The repetitive RETARD-RETARD synthetic voice: at least one thrust lever above IDLE after touchdown, permanent above
   * 40 kt, cancelled when all thrust levers are at IDLE or REVERSE (the alert then ends). Design choice: the 40 kt are the computed airspeed of the ADR the FWC reads.
   */
  isRetardCalloutRequired(computedAirspeedKnots: number): boolean {
    return (this.active[0] || this.active[1]) && computedAirspeedKnots > RETARD_CALLOUT_MIN_SPEED_KNOTS;
  }
}

export interface SatAboveFlexTempInputs {
  /** The FMS FLEX TEMP (L:A32NX_AIRLINER_TO_FLEX_TEMP), °C; 0 when none is entered */
  flexTemperatureCelsius: number;
  /** The SAT of the first valid ADR, °C; null when no ADR gives a valid SAT */
  staticAirTemperatureCelsius: number | null;
}

/**
 * ENG SAT ABOVE FLEX TEMP.
 *
 * The FMS writes 0 when no FLEX TEMP is entered and 0.1 for a FLEX TEMP of 0 °C (A32NX_FMCMainDisplay
 * setPerfTOFlexTemp, the convention FwsLegacyFlightPhases also reads), so 0 means "no FLEX TEMP" and gives no alert.
 */
export function isSatAboveFlexTemp(inputs: SatAboveFlexTempInputs): boolean {
  return (
    inputs.flexTemperatureCelsius !== 0 &&
    inputs.staticAirTemperatureCelsius !== null &&
    inputs.staticAirTemperatureCelsius > inputs.flexTemperatureCelsius
  );
}
