// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The AVAIL indication of the thrust gauge, A380 FCOM DSC-70-90 AVAIL INDICATION (a380_fcom.txt l.112976-112983):
 * "After engine start, the engine is at or above idle. In the case of an engine relight in flight, the message pulses
 * to indicate a successful relight. No longer appears: After 1 min in flight or 10 s on ground, or If the thrust lever
 * is set above idle."
 *
 * Design choices:
 * - The start is successful when the FADEC engine state leaves STARTING / RESTARTING for ON (L:A32NX_ENGINE_STATE). As
 *   before, AVAIL already shows during the end of the start sequence once the N1 is above idle.
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

/** l.112982: 10 s on ground */
export const AVAIL_GROUND_DURATION_S = 10;
/** l.112982: 1 min in flight */
export const AVAIL_FLIGHT_DURATION_S = 60;
/** Thrust lever angle above which the lever is above idle, in degrees (FWS value) */
export const IDLE_TLA_MAX_DEGREES = 2.6;

export type AvailDisplay = 'hidden' | 'steady' | 'pulse';

/** The inputs of the AVAIL indication, sampled every update */
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
