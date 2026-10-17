// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import { isKccuKeyAvailable, kccuFailureState } from './Kccu';

const withFailures =
  (...active: number[]) =>
  (id: number) =>
    active.includes(id);

describe('KCCU failures', () => {
  it('has nothing failed without a failure', () => {
    expect(kccuFailureState('L', withFailures())).toEqual({ cursorControlDeviceFailed: false, keyboardFailed: false });
  });

  it('fails the cursor control device or the keyboard alone, and both with the whole KCCU', () => {
    expect(kccuFailureState('L', withFailures(A380Failure.CaptKccuCursorControl))).toEqual({
      cursorControlDeviceFailed: true,
      keyboardFailed: false,
    });
    expect(kccuFailureState('L', withFailures(A380Failure.CaptKccuKeyboard))).toEqual({
      cursorControlDeviceFailed: false,
      keyboardFailed: true,
    });
    expect(kccuFailureState('R', withFailures(A380Failure.FoKccu))).toEqual({
      cursorControlDeviceFailed: true,
      keyboardFailed: true,
    });
  });

  it('keeps the two sides apart', () => {
    expect(kccuFailureState('L', withFailures(A380Failure.FoKccu))).toEqual({
      cursorControlDeviceFailed: false,
      keyboardFailed: false,
    });
    expect(kccuFailureState('R', withFailures(A380Failure.CaptKccuKeyboard)).keyboardFailed).toBe(false);
  });

  it('takes no keyboard key from a failed keyboard, but still the cursor control device keys', () => {
    const keyboardFailed = { cursorControlDeviceFailed: false, keyboardFailed: true };
    expect(isKccuKeyAvailable('DIR', true, true, keyboardFailed)).toBe(false);
    expect(isKccuKeyAvailable('A', true, true, keyboardFailed)).toBe(false);
    expect(isKccuKeyAvailable('ESC2', true, true, keyboardFailed)).toBe(true);
  });

  it('takes no cursor control device key from a failed device, but still the keyboard keys', () => {
    const deviceFailed = { cursorControlDeviceFailed: true, keyboardFailed: false };
    expect(isKccuKeyAvailable('KBD', true, true, deviceFailed)).toBe(false);
    expect(isKccuKeyAvailable('ESC2', true, true, deviceFailed)).toBe(false);
    expect(isKccuKeyAvailable('DIR', true, true, deviceFailed)).toBe(true);
  });

  it('still needs the ON/OFF switches without a failure', () => {
    const none = { cursorControlDeviceFailed: false, keyboardFailed: false };
    expect(isKccuKeyAvailable('DIR', false, true, none)).toBe(false);
    expect(isKccuKeyAvailable('ESC2', true, false, none)).toBe(false);
    expect(isKccuKeyAvailable('DIR', true, false, none)).toBe(true);
  });

  it('is applied by the MFD and the ND key handlers', () => {
    const instruments = resolve(__dirname, '..');
    const mfd = readFileSync(resolve(instruments, 'MFD/MFD.tsx'), 'utf-8');
    const mfdInstrument = readFileSync(resolve(instruments, 'MFD/instrument.tsx'), 'utf-8');
    const nd = readFileSync(resolve(instruments, 'ND/instrument.tsx'), 'utf-8');
    expect(mfd).toContain('isKccuKeyAvailable(');
    expect(mfd).not.toContain('isKccuKeyActive(');
    expect(mfdInstrument.match(/isFailureActive=\{\(id\) => this\.failuresConsumer\.isActive\(id\)\}/g)).toHaveLength(
      2,
    );
    expect(nd).toContain('isKccuKeyAvailable(key, this.kccuKeyboardOn, this.kccuCursorControlDeviceOn, failures)');
    expect(nd).toContain('this.failuresConsumer.update();');
  });
});
