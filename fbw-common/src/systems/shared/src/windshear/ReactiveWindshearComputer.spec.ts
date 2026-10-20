// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isReactiveWindshearDetectionAvailable } from './ReactiveWindshearComputer';

describe('the availability of the reactive windshear detection', () => {
  it('needs one healthy computer', () => {
    expect(isReactiveWindshearDetectionAvailable([false, false, true], false)).toBe(true);
    expect(isReactiveWindshearDetectionAvailable([false, false, false], false)).toBe(false);
  });

  it('is lost when the detection function is failed, whatever the computers', () => {
    expect(isReactiveWindshearDetectionAvailable([true, true, true], true)).toBe(false);
  });
});
