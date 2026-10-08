// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isStartIndicationShown } from './StartIndications';

describe('SD ENG page starting sequence indications', () => {
  it('show at IGN/START and at CRANK, not at NORM', () => {
    expect(isStartIndicationShown(2)).toBe(true);
    expect(isStartIndicationShown(0)).toBe(true);
    expect(isStartIndicationShown(1)).toBe(false);
  });
});
