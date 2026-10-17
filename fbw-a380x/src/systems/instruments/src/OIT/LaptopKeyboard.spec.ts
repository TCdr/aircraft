// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { laptopKeyToOitKey } from './LaptopKeyboard';

describe('ACD and OIS keys for the OIT', () => {
  it('gives ENTER and ESC the names the entry fields handle', () => {
    expect(laptopKeyToOitKey('ENTER')).toBe('ENT');
    expect(laptopKeyToOitKey('ESC')).toBe('ESC');
  });

  it('names the arrow keys like the KCCU arrows', () => {
    expect(laptopKeyToOitKey('ARROW_UP')).toBe('UP');
    expect(laptopKeyToOitKey('ARROW_DOWN')).toBe('DOWN');
    expect(laptopKeyToOitKey('ARROW_LEFT')).toBe('LEFT');
    expect(laptopKeyToOitKey('ARROW_RIGHT')).toBe('RIGHT');
  });

  it('keeps the OIS MENU and OIS XFR keys', () => {
    expect(laptopKeyToOitKey('OIS_MENU')).toBe('OIS_MENU');
    expect(laptopKeyToOitKey('OIS_XFR')).toBe('OIS_XFR');
  });

  it('drops any other key', () => {
    for (const key of ['A', '5', 'SPACE_LH', 'BACKSPACE', 'F1']) {
      expect(laptopKeyToOitKey(key)).toBeNull();
    }
  });
});
