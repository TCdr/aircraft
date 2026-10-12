// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FwsWindshearAural } from './FwsWindshearAural';

describe('A380 WINDSHEAR voice (a380_fcom.txt l.9274-9276, 73643)', () => {
  it('is said once when the reactive windshear warning comes, again at the next warning', () => {
    const aural = new FwsWindshearAural();
    expect([false, true, true, true, false, true].map((warning) => aural.update(warning))).toEqual([
      false,
      true,
      false,
      false,
      false,
      true,
    ]);
  });
});
