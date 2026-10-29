// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LaptopKeyChords, laptopKeyToOitKey, shortcutChord } from './LaptopKeyboard';

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

describe('shortcut chords', () => {
  it('turns the shortcut labels of the menus into chords', () => {
    expect(shortcutChord('Ctrl P')).toBe('CTRL+P');
    expect(shortcutChord('Alt ←')).toBe('ALT+LEFT');
    expect(shortcutChord('Alt →')).toBe('ALT+RIGHT');
    expect(shortcutChord('Alt F4')).toBe('ALT+F4');
    expect(shortcutChord('F11')).toBe('F11');
  });
});

describe('CTRL and ALT latch for the next key', () => {
  it('gives the function keys directly, without a modifier', () => {
    const keys = new LaptopKeyChords();
    expect(keys.press('F8')).toEqual({ kind: 'shortcut', chord: 'F8' });
    expect(keys.press('F10')).toEqual({ kind: 'shortcut', chord: 'F10' });
  });

  it('latches CTRL for the next key only', () => {
    const keys = new LaptopKeyChords();
    expect(keys.press('CTRL_LH')).toEqual({ kind: 'none' });
    expect(keys.ctrlLatched).toBe(true);
    expect(keys.press('P')).toEqual({ kind: 'shortcut', chord: 'CTRL+P' });
    expect(keys.ctrlLatched).toBe(false);
    expect(keys.press('P')).toEqual({ kind: 'none' });
  });

  it('combines the modifiers with function keys and arrows', () => {
    const keys = new LaptopKeyChords();
    keys.press('CTRL_RH');
    expect(keys.press('F2')).toEqual({ kind: 'shortcut', chord: 'CTRL+F2' });
    keys.press('ALT_LH');
    expect(keys.altLatched).toBe(true);
    expect(keys.press('ARROW_LEFT')).toEqual({ kind: 'shortcut', chord: 'ALT+LEFT' });
    keys.press('CTRL_LH');
    keys.press('ALT_RH');
    expect(keys.press('F4')).toEqual({ kind: 'shortcut', chord: 'CTRL+ALT+F4' });
  });

  it('releases a latched modifier with a second press, and never turns a modified key into an entry key', () => {
    const keys = new LaptopKeyChords();
    keys.press('ALT_LH');
    keys.press('ALT_LH');
    expect(keys.altLatched).toBe(false);
    keys.press('CTRL_LH');
    expect(keys.press('ENTER')).toEqual({ kind: 'none' });
    expect(keys.press('ENTER')).toEqual({ kind: 'oit-key', key: 'ENT' });
  });

  it('ignores plain letters, which only start a shortcut after a modifier', () => {
    expect(new LaptopKeyChords().press('H')).toEqual({ kind: 'none' });
  });
});
