// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The AVAIL indication of the thrust gauge: after an engine start the engine is at or above idle; after a relight in
 * flight it pulses to show a successful relight. It goes after 1 min in flight or 10 s on ground, or when the thrust
 * lever is set above idle.
 *
 * Design choices:
 * - The start is successful when the FADEC engine state leaves STARTING / RESTARTING for ON (L:A32NX_ENGINE_STATE).
 *   AVAIL already shows during the end of the start sequence once the N1 is above idle.
 * - "On ground" / "in flight" is taken when the start ends.
 * - The thrust lever is above idle above 2.6 degrees TLA, the FWS value (FwsCore thrustLever1Idle: TLA <= 2.6).
 */

/** L:A32NX_ENGINE_STATE values (fadec_a380x EngineControl_A380X.h) */
export enum FadecEngineState {
  Off = 0,
  On = 1,
  Starting = 2,
  Restarting = 3,
  Shutting = 4,
}

export const AVAIL_GROUND_DURATION_S = 10;
export const AVAIL_FLIGHT_DURATION_S = 60;
const IDLE_TLA_MAX_DEGREES = 2.6;

export type AvailDisplay = 'hidden' | 'steady' | 'pulse';

export interface AvailInputs {
  /** L:A32NX_ENGINE_STATE */
  engineState: number;
  /** in percent */
  n1: number;
  /** in percent */
  idleN1: number;
  onGround: boolean;
  tlaDegrees: number;
}

/** The AVAIL indication of one engine */
export class AvailIndication {
  private wasStarting = false;

  private remainingS = 0;

  private inFlight = false;

  /**
   * @param deltaS the time since the last update, in seconds
   * @param i the engine and thrust lever state of this update
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

    const leverAboveIdle = i.tlaDegrees > IDLE_TLA_MAX_DEGREES;
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
