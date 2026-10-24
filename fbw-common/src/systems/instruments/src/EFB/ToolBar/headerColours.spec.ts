// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { headerColoursClass } from './headerColours';

describe('headerColoursClass', () => {
  it('adds the soft class only for the soft colours', () => {
    expect(headerColoursClass('soft')).toBe('efb-headers-soft');
    expect(headerColoursClass('vivid')).toBe('');
  });
});
