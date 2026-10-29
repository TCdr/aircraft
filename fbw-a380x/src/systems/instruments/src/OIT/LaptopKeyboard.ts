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

const FUNCTION_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
const LETTER_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** The keys a shortcut can use, by the name of the laptop key; the function keys also work alone */
const SHORTCUT_KEY_NAMES: Readonly<Record<string, string>> = {
  ...FUNCTION_KEYS.reduce<Record<string, string>>((names, key) => ({ ...names, [key]: key }), {}),
  ...LETTER_KEYS.reduce<Record<string, string>>((names, key) => ({ ...names, [key]: key }), {}),
  ARROW_LEFT: 'LEFT',
  ARROW_RIGHT: 'RIGHT',
};

const CTRL_KEYS = ['CTRL_LH', 'CTRL_RH'];
const ALT_KEYS = ['ALT_LH', 'ALT_RH'];

/** What a press of a laptop key does for the OIT */
export type LaptopKeyAction =
  | { readonly kind: 'none' }
  /** A shortcut such as F8, CTRL+P or ALT+LEFT (see shortcutChord) */
  | { readonly kind: 'shortcut'; readonly chord: string }
  /** A key of the entry fields (see laptopKeyToOitKey) */
  | { readonly kind: 'oit-key'; readonly key: string };

/**
 * @param label a shortcut as written on the OIT menus and buttons, e.g. "Ctrl P", "Alt ←" or "F8"
 * @returns the chord that the laptop keyboard produces for it, e.g. "CTRL+P", "ALT+LEFT" or "F8"
 */
export function shortcutChord(label: string): string {
  return label.replace('←', 'LEFT').replace('→', 'RIGHT').toUpperCase().split(/\s+/).join('+');
}

/**
 * Turns the laptop key presses of one keyboard into OIT keys and shortcuts. The 3D keyboard has no chords, so CTRL and
 * ALT work as one-shot latches (Design choice): a press of the key latches it, its backlight shows that, and the next
 * key press is made with it and releases it. A second press of the latched key releases it unused.
 */
export class LaptopKeyChords {
  private _ctrlLatched = false;
  private _altLatched = false;

  /** @returns whether CTRL is latched for the next key (its key is backlit) */
  public get ctrlLatched(): boolean {
    return this._ctrlLatched;
  }

  /** @returns whether ALT is latched for the next key (its key is backlit) */
  public get altLatched(): boolean {
    return this._altLatched;
  }

  /** Releases both latches */
  public reset(): void {
    this._ctrlLatched = false;
    this._altLatched = false;
  }

  /**
   * @param laptopKey the key name of H:A380X_LAPTOP_KEYBOARD_L(R)_<key>
   * @returns what the OIT does with the key
   */
  public press(laptopKey: string): LaptopKeyAction {
    if (CTRL_KEYS.includes(laptopKey)) {
      this._ctrlLatched = !this._ctrlLatched;
      return { kind: 'none' };
    }
    if (ALT_KEYS.includes(laptopKey)) {
      this._altLatched = !this._altLatched;
      return { kind: 'none' };
    }

    const modifiers = [this._ctrlLatched ? 'CTRL' : null, this._altLatched ? 'ALT' : null].filter(
      (modifier): modifier is string => modifier !== null,
    );
    this.reset();
    const keyName = SHORTCUT_KEY_NAMES[laptopKey];

    if (modifiers.length > 0) {
      // A key pressed with a modifier is never also an entry key (CTRL ENTER does not enter)
      return keyName === undefined ? { kind: 'none' } : { kind: 'shortcut', chord: [...modifiers, keyName].join('+') };
    }
    if (FUNCTION_KEYS.includes(laptopKey)) {
      return { kind: 'shortcut', chord: laptopKey };
    }
    const oitKey = laptopKeyToOitKey(laptopKey);
    return oitKey === null ? { kind: 'none' } : { kind: 'oit-key', key: oitKey };
  }
}
