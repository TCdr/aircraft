// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightLevelFixedWidthFormat, FlightLevelFormat } from './DataEntryFormats';

describe('the fixed width flight level format', () => {
  it('has no overflow digits: the input field takes a field with them out of the layout at the third digit', () => {
    expect(new FlightLevelFormat().maxOverflowDigits).toBeDefined();
    expect(new FlightLevelFixedWidthFormat().maxOverflowDigits).toBeUndefined();
  });

  it('formats and parses like the flight level format', async () => {
    const format = new FlightLevelFixedWidthFormat();

    expect(format.format(410)).toEqual(['410', 'FL', null]);
    expect(await format.parse('370')).toBe(370);
    expect(await format.parse('')).toBeNull();
    await expect(format.parse('999')).rejects.toBeDefined();
  });
});
