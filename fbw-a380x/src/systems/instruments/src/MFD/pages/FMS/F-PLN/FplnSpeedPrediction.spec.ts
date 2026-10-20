// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatSpeedPrediction, isSameSpeedPrediction } from './FplnSpeedPrediction';

describe('the F-PLN speed prediction', () => {
  it('shows a CAS in knots and a Mach as .NN', () => {
    expect(formatSpeedPrediction(287.4)).toBe('287');
    expect(formatSpeedPrediction(0.854)).toBe('.85');
  });

  it('shows the ditto character when the shown value is the one of the waypoint just above', () => {
    expect(isSameSpeedPrediction(0.853, 0.849)).toBe(true);
    expect(isSameSpeedPrediction(287.4, 286.6)).toBe(true);
  });

  it('shows the value when it differs from the one shown just above, even by less than 0.01 or 1 kt', () => {
    expect(isSameSpeedPrediction(0.856, 0.851)).toBe(false);
    expect(isSameSpeedPrediction(287.6, 287.2)).toBe(false);
  });
});
