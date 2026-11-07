// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { HeightCalloutRepeatGate } from './HeightCalloutRepeatGate';

describe('HeightCalloutRepeatGate', () => {
  it('lets a word through the first time', () => {
    expect(new HeightCalloutRepeatGate().tryEnqueue('alt_400')).toBe(true);
  });

  it('blocks the same word within 11 s of its last enqueue', () => {
    const gate = new HeightCalloutRepeatGate();
    gate.tryEnqueue('alt_400');
    gate.advance(10.9);
    expect(gate.tryEnqueue('alt_400')).toBe(false);
  });

  it('lets the same word through again after 11 s', () => {
    const gate = new HeightCalloutRepeatGate();
    gate.tryEnqueue('alt_400');
    gate.advance(11);
    expect(gate.tryEnqueue('alt_400')).toBe(true);
  });

  it('a blocked attempt does not restart the 11 s', () => {
    const gate = new HeightCalloutRepeatGate();
    gate.tryEnqueue('alt_400');
    gate.advance(6);
    gate.tryEnqueue('alt_400');
    gate.advance(5);
    expect(gate.tryEnqueue('alt_400')).toBe(true);
  });

  it('does not affect other words', () => {
    const gate = new HeightCalloutRepeatGate();
    gate.tryEnqueue('alt_400');
    gate.advance(1);
    expect(gate.tryEnqueue('alt_300')).toBe(true);
    expect(gate.tryEnqueue('alt_400')).toBe(false);
  });
});
