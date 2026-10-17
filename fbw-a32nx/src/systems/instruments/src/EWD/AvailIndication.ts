// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The AVAIL indication of the N1 gauge: the engine is started and at or above idle. It shows steady for 10 s after a
 * successful start on ground, pulses for 1 min after a successful relight in flight, and goes away when the thrust
 * lever leaves the idle detent.
 *
 * Design choices:
 * - The start is successful when the FADEC engine state leaves STARTING / RESTARTING for ON (L:A32NX_ENGINE_STATE).
 *   AVAIL already shows during the end of the start sequence once the N1 is above idle.
 * - "On ground" / "in flight" is taken when the start ends.
 * - The thrust lever is forward of the idle detent from 2.6 degrees TLA, the FWC value (systems-host FWC/Logic
 *   EngineThrustSettingAlerts.ts isThrustLeverAboveIdle).
 */

/** L:A32NX_ENGINE_STATE values (fadec_a32nx EngineControlA32NX.h) */
export enum FadecEngineState {
  Off = 0,
  On = 1,
  Starting = 2,
  Restarting = 3,
  Shutting = 4,
}

/** Steady for 10 s on ground */
export const AVAIL_GROUND_DURATION_S = 10;
/** Pulses for 1 min in flight */
export const AVAIL_FLIGHT_DURATION_S = 60;
/** Thrust lever angle from which the lever is forward of the idle detent, in degrees (FWC value) */
const ABOVE_IDLE_TLA_DEGREES = 2.6;

export type AvailDisplay = 'hidden' | 'steady' | 'pulse';

export interface AvailInputs {
  /** L:A32NX_ENGINE_STATE */
  engineState: number;
  /** N1 in percent */
  n1: number;
  /** idle N1 in percent */
  idleN1: number;
  onGround: boolean;
  /** thrust lever angle in degrees */
  tlaDegrees: number;
}

/** The AVAIL indication of one engine */
export class AvailIndication {
  private wasStarting = false;

  private remainingS = 0;

  private inFlight = false;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param i the inputs
   * @returns how AVAIL shows
   */
  public update(deltaS: number, i: AvailInputs): AvailDisplay {
    const starting = i.engineState === FadecEngineState.Starting || i.engineState === FadecEngineState.Restarting;

    if (this.wasStarting && i.engineState === FadecEngineState.On) {
      // Successful start or relight
      this.inFlight = !i.onGround;
      this.remainingS = this.inFlight ? AVAIL_FLIGHT_DURATION_S : AVAIL_GROUND_DURATION_S;
    } else if (this.remainingS > 0) {
      this.remainingS = Math.max(0, this.remainingS - deltaS);
    }
    if (starting) {
      this.inFlight = !i.onGround;
    }
    this.wasStarting = starting;

    const leverAboveIdle = i.tlaDegrees >= ABOVE_IDLE_TLA_DEGREES;
    if (leverAboveIdle || i.engineState === FadecEngineState.Off || i.engineState === FadecEngineState.Shutting) {
      this.remainingS = 0;
      return 'hidden';
    }

    const startedAboveIdle = starting && i.n1 > Math.floor(i.idleN1);
    if (startedAboveIdle || this.remainingS > 0) {
      return this.inFlight ? 'pulse' : 'steady';
    }
    return 'hidden';
  }
}
