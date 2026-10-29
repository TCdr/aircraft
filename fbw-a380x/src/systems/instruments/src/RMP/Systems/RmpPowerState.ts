// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RmpState } from '@flybywiresim/rmp';

/**
 * @param powerOn whether the RMP is supplied
 * @param brightnessOn whether the brightness knob is not at OFF
 * @param failed whether the RMP has a flyPad failure
 * @param powerUpWaitSeconds the seconds the RMP still has to wait for its place in the cockpit power-up order
 * @returns the state of the RMP; it stays dark (standby) while it waits
 */
export function resolveRmpState(
  powerOn: boolean,
  brightnessOn: boolean,
  failed: boolean,
  powerUpWaitSeconds: number,
): RmpState {
  if (!powerOn || failed) {
    return brightnessOn ? RmpState.OnFailed : RmpState.OffFailed;
  }
  return brightnessOn && powerUpWaitSeconds === 0 ? RmpState.On : RmpState.OffStandby;
}
