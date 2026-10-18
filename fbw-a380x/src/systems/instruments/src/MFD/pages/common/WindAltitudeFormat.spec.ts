// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { WindAltitudeFormat } from './DataEntryFormats';

// A ground wind is entered with an altitude below 400 ft, or with GND
describe('WIND ALTITUDE entry: ground wind', () => {
  const atElevation = (ft: number) => new WindAltitudeFormat(null, false, Subject.create<number | null>(ft));

  it('GND gives the ground altitude', async () => {
    expect(await atElevation(13).parse('GND')).toBe(13);
  });

  it('an altitude below 400 ft is a ground wind, also at a sea-level airport', async () => {
    expect(await atElevation(13).parse('00300')).toBe(13);
  });

  it('400 ft and above is a normal altitude', async () => {
    expect(await atElevation(13).parse('00400')).toBe(400);
  });

  it('NNN is a flight level', async () => {
    expect(await atElevation(13).parse('250')).toBe(25000);
  });

  it('an altitude below the airport elevation is still the ground wind', async () => {
    expect(await atElevation(2000).parse('01500')).toBe(2000);
  });
});
