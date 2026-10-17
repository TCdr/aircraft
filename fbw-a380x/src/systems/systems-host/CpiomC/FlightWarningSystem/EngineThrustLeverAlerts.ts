// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2)(3)(4) THR LEVER ABOVE IDLE of the A380X FWS. It triggers when:
 * - one thrust lever is above idle and at least one thrust reverser lever is in the reverse detent, or
 * - one thrust lever is above idle and at least one lever of the other engines is at idle (an engine lever moved above
 *   idle by mistake while the thrust reversers are de-selected), or
 * - the auto-idle protection is active.
 * A dual RETARD callout comes with it; the procedure line is THR LEVER 1(2)(3)(4) IDLE. Red title with MASTER WARN,
 * inhibited in the flight phases 1, 6, 7 and 12.
 *
 * The auto-idle protection keeps the outboard engines at idle during the thrust reverser operation: it activates when
 * an outboard thrust lever is above the idle detent while the reversers operate. The systems WASM writes it per engine
 * (a380_systems engine_control_failure.rs, L:A32NX_ENGINE_n_FADEC_AUTO_IDLE); for the outboard engines 1 and 4 that
 * variable is the auto-idle protection, unless the thrust lever itself is lost (THR LEVER FAULT, the FADEC then holds
 * idle on ground: not this protection).
 */

export const THR_LEVER_ABOVE_IDLE_PHASE_INHIBITION = [1, 6, 7, 12];

/** The alert level: red, MASTER WARN */
export const THR_LEVER_ABOVE_IDLE_LEVEL = 3;

/*
 * Thrust lever angle ranges, in degrees (L:A32NX_AUTOTHRUST_TLA:n). Above idle from 2.6, the threshold the FWS already
 * uses for "at idle" (FwsCore thrustLever1Idle: TLA <= 2.6). Design choice: in the reverse detent below -4.3, the boundary
 * of the A32NX FWC (the A380 FADEC model maps 0 to -6 to reverse idle, so -4.3 is well inside the reverse range and keeps
 * a lever resting at the idle stop out of it).
 */
const ABOVE_IDLE_TLA_FROM_DEGREES = 2.6;
const REVERSE_TLA_BELOW_DEGREES = -4.3;

/** Engines 2 and 3 have the thrust reversers */
const ENGINES_WITH_REVERSER = [1, 2];
/** Engines 1 and 4 are the outboard engines of the auto-idle protection */
const OUTBOARD_ENGINES = [0, 3];

export function isThrustLeverAboveIdle(tlaDegrees: number): boolean {
  return tlaDegrees > ABOVE_IDLE_TLA_FROM_DEGREES;
}

export function isThrustLeverInReverse(tlaDegrees: number): boolean {
  return tlaDegrees < REVERSE_TLA_BELOW_DEGREES;
}

export function isThrustLeverAtIdle(tlaDegrees: number): boolean {
  return !isThrustLeverAboveIdle(tlaDegrees) && !isThrustLeverInReverse(tlaDegrees);
}

export interface ThrustLeverAboveIdleInputs {
  /** Thrust lever angle of engines 1 to 4, degrees */
  readonly tlaDegrees: readonly number[];
  /** L:A32NX_ENGINE_n_FADEC_AUTO_IDLE of engines 1 to 4 */
  readonly fadecAutoIdle: readonly boolean[];
  /** ENG n THR LEVER FAULT of engines 1 to 4 (the lever position is lost) */
  readonly thrLeverFault: readonly boolean[];
}

/**
 * ENG 1(2)(3)(4) THR LEVER ABOVE IDLE of the four engines.
 *
 * The second trigger ("during thrust reversers de-selection") needs the memory of a reverse selection: it is armed while a
 * reverser lever is in the reverse detent, and disarmed once every lever is back at idle (the de-selection is finished).
 * Design choice: no time is published; as the A32NX FWC (EngineThrustSettingAlerts), this keeps the alert away from a
 * normal taxi with asymmetric thrust.
 */
export class ThrustLeverAboveIdleMonitor {
  private reverserDeselectionArmed = false;

  private readonly active = [false, false, false, false];

  update(inputs: ThrustLeverAboveIdleInputs): void {
    // A lever with a THR LEVER FAULT has no valid position: it neither triggers nor arms the alert
    const tla = (engineIndex: number) => (inputs.thrLeverFault[engineIndex] ? 0 : inputs.tlaDegrees[engineIndex]);
    const aboveIdle = [0, 1, 2, 3].map((engineIndex) => isThrustLeverAboveIdle(tla(engineIndex)));
    const atIdle = [0, 1, 2, 3].map((engineIndex) => isThrustLeverAtIdle(tla(engineIndex)));
    const reverserLeverInReverse = ENGINES_WITH_REVERSER.some((engineIndex) =>
      isThrustLeverInReverse(tla(engineIndex)),
    );

    if (reverserLeverInReverse) {
      this.reverserDeselectionArmed = true;
    } else if (atIdle.every((idle) => idle)) {
      this.reverserDeselectionArmed = false;
    }

    for (let engineIndex = 0; engineIndex < 4; engineIndex++) {
      const otherEngineAtIdle = atIdle.some((idle, otherIndex) => otherIndex !== engineIndex && idle);
      const autoIdleProtection =
        OUTBOARD_ENGINES.includes(engineIndex) &&
        inputs.fadecAutoIdle[engineIndex] &&
        !inputs.thrLeverFault[engineIndex];
      this.active[engineIndex] =
        (aboveIdle[engineIndex] && (reverserLeverInReverse || (this.reverserDeselectionArmed && otherEngineAtIdle))) ||
        autoIdleProtection;
    }
  }

  /** @param engineIndex 0 = engine 1 ... 3 = engine 4 */
  isActive(engineIndex: number): boolean {
    return this.active[engineIndex];
  }

  isAnyActive(): boolean {
    return this.active.some((active) => active);
  }
}

/**
 * The time from the first RETARD to the second: the clip length of the FWS 'retard' sound (0.9 s, FwsSoundManager) and the
 * 0.2 s pause given there (periodicWithPause).
 */
export const DUAL_RETARD_INTERVAL_SECONDS = 1.1;

/**
 * The dual RETARD callout: two RETARD callouts when the alert comes, none after that.
 * The second one is not made when the alert has gone before it.
 */
export class DualRetardCallout {
  private wasActive = false;

  /** Time to the second RETARD in seconds, null when none is pending */
  private secondCalloutIn: number | null = null;

  /**
   * @param alertActive a THR LEVER ABOVE IDLE alert is active
   * @param deltaTimeSeconds time since the last update
   * @returns true when a RETARD callout must be made now
   */
  update(alertActive: boolean, deltaTimeSeconds: number): boolean {
    const risingEdge = alertActive && !this.wasActive;
    this.wasActive = alertActive;
    if (!alertActive) {
      this.secondCalloutIn = null;
      return false;
    }
    if (risingEdge) {
      this.secondCalloutIn = DUAL_RETARD_INTERVAL_SECONDS;
      return true;
    }
    if (this.secondCalloutIn !== null) {
      this.secondCalloutIn -= deltaTimeSeconds;
      if (this.secondCalloutIn <= 0) {
        this.secondCalloutIn = null;
        return true;
      }
    }
    return false;
  }
}
