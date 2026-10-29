// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { parseEcamText, plainEcamText } from './ecam-text';

describe('parseEcamText', () => {
  it('applies a colour control', () => {
    expect(parseEcamText('\x1b<5m -PACK 1.............OFF')).toEqual([
      { text: ' -PACK 1.............OFF', colour: 'cyan', underline: false },
    ]);
  });

  it('underlines until the reset control', () => {
    expect(parseEcamText('\x1b<2m\x1b4mCAB PR\x1bm EXCESS CAB ALT')).toEqual([
      { text: 'CAB PR', colour: 'red', underline: true },
      { text: ' EXCESS CAB ALT', colour: 'red', underline: false },
    ]);
  });

  it('gives text without controls the default colour', () => {
    expect(parseEcamText('PLAIN')).toEqual([{ text: 'PLAIN', colour: 'white', underline: false }]);
    expect(parseEcamText('PLAIN', 'green')[0].colour).toBe('green');
  });

  it('ignores flash and box controls', () => {
    expect(parseEcamText("\x1b)mA\x1b'mB")).toEqual([{ text: 'AB', colour: 'white', underline: false }]);
  });

  it('drops empty segments', () => {
    expect(parseEcamText('\x1b<1m\x1b<3mGO')).toEqual([{ text: 'GO', colour: 'green', underline: false }]);
  });
});

describe('plainEcamText', () => {
  it('removes the controls', () => {
    expect(plainEcamText('\x1b<4m\x1b4mCOND\x1bm HOT AIR 1 FAULT')).toBe('COND HOT AIR 1 FAULT');
  });
});
