// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SystemKeys } from './KeypadController';

/**
 * Which transmission key of one RMP is in transmission mode.
 *
 * A press turns the transmission mode of a key on, a second press turns it off; only one communication type at a
 * time (internal or external) can be in transmission mode on each RMP. For a PA announcement the flight crew keeps
 * the PA transmission key pressed during the announcement.
 */
export interface TransmissionState {
  /** The key in transmission mode, null when none is. */
  readonly active: SystemKeys | null;
  /**
   * While the PA key is held: the key that was in transmission mode before the PA key was pressed. The PA key does not
   * latch, so the previous selection comes back when it is released (design choice: nothing says that the PA
   * announcement deselects the radio the crew had selected).
   */
  readonly beforePa: SystemKeys | null;
}

export const NO_TRANSMISSION: TransmissionState = { active: null, beforePa: null };

/**
 * The transmission state after a transmission key press.
 * @param state the state before the press
 * @param key the pressed transmission key (VHF/HF/TEL/MECH/CAB/PA, not the VOICE key)
 * @returns the new state
 */
export function transmissionAfterKeyPressed(state: TransmissionState, key: SystemKeys): TransmissionState {
  if (key === SystemKeys.PaCall) {
    // PA: in transmission mode while the key is held
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
