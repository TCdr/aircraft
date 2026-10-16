// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SystemKeys } from './KeypadController';

/**
 * Which transmission key of one RMP is in transmission mode.
 *
 * A380 FCOM DSC-23-20 INT(CAB)(PA) transmission key (a380_fcom.txt l.48050-48063): "When pressed, the transmission key
 * turns on the transmission mode." "Only one communication type at a time (internal and external communication) can be
 * in transmission mode on each RMP." "When pressed, the transmission key turns off the transmission mode." "To make an
 * announcement on the PA, the flight crew must press and maintain the PA transmission key during the announcement."
 */
export interface TransmissionState {
  /** The key in transmission mode, null when none is. */
  readonly active: SystemKeys | null;
  /**
   * While the PA key is held: the key that was in transmission mode before the PA key was pressed. The PA key does not
   * latch, so the previous selection comes back when it is released (the FCOM does not say that the PA announcement
   * deselects the radio the crew had selected).
   */
  readonly beforePa: SystemKeys | null;
}

/** No key in transmission mode. */
export const NO_TRANSMISSION: TransmissionState = { active: null, beforePa: null };

/**
 * The transmission state after a transmission key press.
 * @param state the state before the press
 * @param key the pressed transmission key (VHF/HF/TEL/MECH/CAB/PA, not the VOICE key)
 * @returns the new state
 */
export function transmissionAfterKeyPressed(state: TransmissionState, key: SystemKeys): TransmissionState {
  if (key === SystemKeys.PaCall) {
    // PA: in transmission mode while the key is held (l.48061-48063)
    const beforePa = state.active === SystemKeys.PaCall ? state.beforePa : state.active;
    return { active: SystemKeys.PaCall, beforePa };
  }
  // the other keys latch: a press selects the key (and deselects the others), a second press deselects it
  return { active: state.active === key ? null : key, beforePa: null };
}

/**
 * The transmission state after a transmission key release.
 * @param state the state before the release
 * @param key the released transmission key
 * @returns the new state
 */
export function transmissionAfterKeyReleased(state: TransmissionState, key: SystemKeys): TransmissionState {
  if (key === SystemKeys.PaCall && state.active === SystemKeys.PaCall) {
    // end of the PA announcement: back to the key that was in transmission mode before
    return { active: state.beforePa, beforePa: null };
  }
  return state;
}
