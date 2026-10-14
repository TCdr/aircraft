// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';

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

/** The flyPad failures of the KCCU of one side: its cursor control device, its keyboard, or the whole unit */
export interface KccuFailureIds {
  readonly cursorControlDevice: number;
  readonly keyboard: number;
  readonly wholeUnit: number;
}

/** The KCCU failures of the captain (L) and first officer (R) sides */
export const KCCU_FAILURES: Readonly<Record<'L' | 'R', KccuFailureIds>> = {
  L: {
    cursorControlDevice: A380Failure.CaptKccuCursorControl,
    keyboard: A380Failure.CaptKccuKeyboard,
    wholeUnit: A380Failure.CaptKccu,
  },
  R: {
    cursorControlDevice: A380Failure.FoKccuCursorControl,
    keyboard: A380Failure.FoKccuKeyboard,
    wholeUnit: A380Failure.FoKccu,
  },
};

/** Which parts of a KCCU are failed */
export interface KccuFailureState {
  readonly cursorControlDeviceFailed: boolean;
  readonly keyboardFailed: boolean;
}

/**
 * The failed parts of the KCCU of one side. A380 FCOM PRO-ABN-ECAM-10-31 (a380_fcom.txt l.157621-157680): the Cursor
 * Control Device (CCD) and the keyboard fail alone (CURSOR CTL FAULT, KEYBOARD FAULT), or the whole KCCU fails (CURSOR
 * CTL+KEYBOARD FAULT, "The CAPT (F/O) Keyboard and Cursor Control Unit (KCCU) is failed").
 * @param side L for the captain, R for the first officer
 * @param isFailureActive whether a flyPad failure is active (FailuresConsumer.isActive)
 */
export function kccuFailureState(side: 'L' | 'R', isFailureActive: (id: number) => boolean): KccuFailureState {
  const ids = KCCU_FAILURES[side];
  const wholeUnitFailed = isFailureActive(ids.wholeUnit);
  return {
    cursorControlDeviceFailed: wholeUnitFailed || isFailureActive(ids.cursorControlDevice),
    keyboardFailed: wholeUnitFailed || isFailureActive(ids.keyboard),
  };
}

/**
 * Whether a KCCU key press is taken, with the failures: a failed keyboard or cursor control device takes no key press,
 * as when it is switched OFF.
 * @param key the key name of the H event
 * @param keyboardOn the KBD ON/OFF switch of this KCCU
 * @param cursorControlDeviceOn the CCD ON/OFF switch of this KCCU
 * @param failures the failed parts of this KCCU
 */
export function isKccuKeyAvailable(
  key: string,
  keyboardOn: boolean,
  cursorControlDeviceOn: boolean,
  failures: KccuFailureState,
): boolean {
  return isKccuKeyActive(
    key,
    keyboardOn && !failures.keyboardFailed,
    cursorControlDeviceOn && !failures.cursorControlDeviceFailed,
  );
}
