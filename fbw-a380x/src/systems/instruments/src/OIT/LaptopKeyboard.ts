// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The keys that reach the OIT as H:A380X_LAPTOP_KEYBOARD_L(R)_<key>: the OIS MENU and OIS XFR keys of the laptop
 * keyboard and the 8 keys of the ACD beside the OIT (keyboard.xml). ENTER, ESC and the arrows are renamed to the KCCU
 * key names, so that the entry fields shared with the MFD handle them unchanged.
 */
const LAPTOP_KEY_TO_OIT_KEY: Readonly<Record<string, string>> = {
  ENTER: 'ENT',
  ESC: 'ESC',
  ARROW_UP: 'UP',
  ARROW_DOWN: 'DOWN',
  ARROW_LEFT: 'LEFT',
  ARROW_RIGHT: 'RIGHT',
  OIS_MENU: 'OIS_MENU',
  OIS_XFR: 'OIS_XFR',
};

/**
 * @param laptopKey the key name of H:A380X_LAPTOP_KEYBOARD_L(R)_<key>
 * @returns the key name for the OIT pages, or null for a key the OIT does not use
 */
export function laptopKeyToOitKey(laptopKey: string): string | null {
  return LAPTOP_KEY_TO_OIT_KEY[laptopKey] ?? null;
}
