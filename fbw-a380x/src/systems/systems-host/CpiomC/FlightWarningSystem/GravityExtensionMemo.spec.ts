// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  GRAVITY_EXTENSION_MEMO,
  GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION,
  isGravityExtensionMemoShown,
} from './GravityExtensionMemo';

describe('L/G GRVTY EXTN memo', () => {
  it('shows once the gears are down and locked with the L/G GRVTY sw at DOWN', () => {
    expect(isGravityExtensionMemoShown(2, true)).toBe(true);
    // extension in progress
    expect(isGravityExtensionMemoShown(2, false)).toBe(false);
    // normal extension (sw OFF) and after the RESET
    expect(isGravityExtensionMemoShown(1, true)).toBe(false);
    expect(isGravityExtensionMemoShown(0, true)).toBe(false);
  });

  it('is inhibited in the phases 3 to 7', () => {
    expect(GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7]);
  });

  it('is the green memo 321000002 of EcamMemos', () => {
    const ecamMessages = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
      'utf-8',
    );
    expect(GRAVITY_EXTENSION_MEMO).toBe('321000002');
    expect(ecamMessages).toContain("'321000002': '\\x1b<3mL/G GRVTY EXTN',");
  });

  it('is wired in FwsMemos and FwsCore', () => {
    const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(memos).toContain('[GRAVITY_EXTENSION_MEMO]: {');
    expect(memos).toContain('simVarIsActive: this.fws.gravityExtensionMemo,');
    expect(core).toContain('this.gravityExtensionMemo.set(');
  });
});
