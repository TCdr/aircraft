// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The keys of the KCCU cursor control device (A380 FCOM DSC-31-30-20: Validation pb, ESC key, KBD key, navigation keys),
 * named as in the KCCU H events (`A32NX_KCCU_{L,R}_<KEY>`). Every other KCCU key belongs to the keyboard.
 */
const CURSOR_CONTROL_DEVICE_KEYS: ReadonlySet<string> = new Set(['ESC2', 'KBD', 'REWIND', 'FORWARD']);

/**
 * Whether a KCCU key press is taken. A380 FCOM DSC-31-30-20: the keyboard and the cursor control device each have an ON/OFF
 * switch ("The KCCU keyboard is not active" when OFF) and are independent of each other.
 * @param key the key name of the H event
 * @param keyboardOn the KBD ON/OFF switch of this KCCU
 * @param cursorControlDeviceOn the CCD ON/OFF switch of this KCCU
 */
export function isKccuKeyActive(key: string, keyboardOn: boolean, cursorControlDeviceOn: boolean): boolean {
  return CURSOR_CONTROL_DEVICE_KEYS.has(key) ? cursorControlDeviceOn : keyboardOn;
}
