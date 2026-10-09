// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isThrustLeverAtIdle } from './EngineThrustSettingAlerts';

/*
 * ENG 1(2) LOW N1 (ON GROUND) (A320 FCOM PRO-ABN-ENG, a320_fcom.txt l.80343-80362). l.80353: "This alert triggers when N1
 * rotation is failed during start."; l.80359: "No N1 rotation during start."; l.80361-80363: "IF CONFIRMED: THR LEVER
 * (AFFECTED) ... IDLE, ENG MASTER (AFFECTED) ... OFF". The flight phase inhibition figure is an image, read on the 2019 FCOM
 * PDF page 2277: inhibited in the phases 4 to 9 (shown in 1, 2, 3 and 10). The FCOM page gives neither the title colour
 * nor the aural: design choice, an amber caution (single chime, MASTER CAUT) like the other start alerts (ENG 1(2) START
 * FAULT). No STATUS.
 *
 * The failure that makes the N1 stay at 0 during a start: flyPad ATA 72 "Engine 1(2) fan blocked (no N1 rotation at
 * start)" (FADEC FanBlockedStart_A32NX.hpp).
 */

/** ENG 1(2) LOW N1 flight phase inhibition (2019 FCOM PDF page 2277) */
export const LOW_N1_PHASE_INHIBITION = [4, 5, 6, 7, 8, 9];

/**
 * Design choice, no FCOM value: the N1 has failed to rotate when it is still below 2 % once the core turns at 35 % N2 or
 * more. In a normal start the N1 is about 5 % at 35 % N2 (FADEC start polynomial, fan_blocked_start_test.cpp checks the
 * margin); the core of a start lights up at 22 % N2 (FCOM DSC-70-80-40 l.63707-63708) and the start ends at 50 % N2.
 */
export const LOW_N1_MIN_N2_PERCENT = 35;
export const LOW_N1_MAX_N1_PERCENT = 2;

/** Design choice: the condition must hold for 2 s, so that a single frame of the N1 indication cannot trigger it */
export const LOW_N1_CONFIRM_SECONDS = 2;

export interface EngineLowN1Inputs {
  onGround: boolean;
  masterOn: boolean;
  /** The FADEC engine state is STARTING or RESTARTING */
  engineStarting: boolean;
  /** The N1 and N2 the FADEC shows (L:A32NX_ENGINE_N1:n, L:A32NX_ENGINE_N2:n) */
  n1Percent: number;
  n2Percent: number;
}

/**
 * ENG 1(2) LOW N1 of one engine.
 *
 * Design choice: once confirmed, the alert stays until the ENG MASTER of the engine is OFF (the last line of the
 * procedure) or the aircraft is no longer on the ground. A blocked fan holds the core below idle, and the FADEC may abort an
 * automatic start for the hung core (ENG 1(2) START FAULT): the core then runs down to the crank speed, but the N1 has still
 * not rotated and the procedure still asks for the ENG MASTER OFF.
 */
export class EngineLowN1Monitor {
  private conditionSeconds = 0;

  private latched = false;

  update(inputs: EngineLowN1Inputs, deltaTimeSeconds: number): void {
    if (!inputs.onGround || !inputs.masterOn) {
      this.conditionSeconds = 0;
      this.latched = false;
      return;
    }
    const noN1Rotation =
      inputs.engineStarting && inputs.n2Percent >= LOW_N1_MIN_N2_PERCENT && inputs.n1Percent < LOW_N1_MAX_N1_PERCENT;
    this.conditionSeconds = noN1Rotation ? this.conditionSeconds + deltaTimeSeconds : 0;
    if (this.conditionSeconds >= LOW_N1_CONFIRM_SECONDS) {
      this.latched = true;
    }
  }

  get isActive(): boolean {
    return this.latched;
  }
}

/**
 * The lines of ENG 1(2) LOW N1: 0 title, 1 "IF CONFIRMED:", 2 "THR LEVER n ... IDLE" while the lever is not at idle,
 * 3 "ENG MASTER n ... OFF" (the alert goes with the ENG MASTER OFF).
 */
export function lowN1Lines(tlaDegrees: number): number[] {
  return isThrustLeverAtIdle(tlaDegrees) ? [0, 1, 3] : [0, 1, 2, 3];
}
