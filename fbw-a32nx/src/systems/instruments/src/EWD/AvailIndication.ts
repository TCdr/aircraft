// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The AVAIL indication of the N1 gauge, A320 FCOM DSC-70-90-40-50 AVAIL INDICATION (a320_fcom.txt l.64209-64216):
 * "The engine is started, and at or above idle. On ground, appears steady during 10 s after a successful start. In
 * flight, pulses during 1 min after a successful relight. The AVAIL Indication disappears when the flight crew moves the
 * thrust lever forward the idle detent."
 *
 * Design choices:
 * - The start is successful when the FADEC engine state leaves STARTING / RESTARTING for ON (L:A32NX_ENGINE_STATE). As
 *   before, AVAIL already shows during the end of the start sequence once the N1 is above idle.
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

/** l.64214: steady during 10 s on ground */
export const AVAIL_GROUND_DURATION_S = 10;
/** l.64214-64215: pulses during 1 min in flight */
export const AVAIL_FLIGHT_DURATION_S = 60;
/** Thrust lever angle from which the lever is forward of the idle detent, in degrees (FWC value) */
export const ABOVE_IDLE_TLA_DEGREES = 2.6;

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
