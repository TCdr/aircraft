// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { forgetOfpMemory, OFP_MEMORY_KEYS } from './cancelOfp';

describe('cancelOfp', () => {
  it('clears every key the dashboard stores for an OFP', () => {
    const cleared: string[] = [];
    forgetOfpMemory((key) => cleared.push(key));
    expect(cleared).toEqual([...OFP_MEMORY_KEYS]);
  });
});
