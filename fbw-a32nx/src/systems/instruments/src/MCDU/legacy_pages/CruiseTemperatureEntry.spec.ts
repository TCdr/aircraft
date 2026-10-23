// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { parseCruiseTemperatureEntry } from './CruiseTemperatureEntry';

describe('the SAT/ALT field of the CRZ WIND page', () => {
  it('takes both values for the first entry, a temperature without sign being negative', () => {
    expect(parseCruiseTemperatureEntry('52/FL350', null)).toEqual({ entry: { temperature: -52, altitude: 35000 } });
    expect(parseCruiseTemperatureEntry('+5/350', null)).toEqual({ entry: { temperature: 5, altitude: 35000 } });
  });

  it('needs both values for the first entry', () => {
    expect(parseCruiseTemperatureEntry('-52', null)).toEqual({ error: 'formatError' });
    expect(parseCruiseTemperatureEntry('/FL350', null)).toEqual({ error: 'formatError' });
  });

  it('changes the temperature or the altitude of the entry shown on its own', () => {
    const shown = { temperature: -52, altitude: 35000 };

    expect(parseCruiseTemperatureEntry('-55', shown)).toEqual({ entry: { temperature: -55, altitude: 35000 } });
    expect(parseCruiseTemperatureEntry('/FL370', shown)).toEqual({ entry: { temperature: -52, altitude: 37000 } });
  });

  it('refuses a malformed or out-of-range entry', () => {
    expect(parseCruiseTemperatureEntry('abc/FL350', null)).toEqual({ error: 'formatError' });
    expect(parseCruiseTemperatureEntry('-52/FL350/1', null)).toEqual({ error: 'formatError' });
    expect(parseCruiseTemperatureEntry('-300/FL350', null)).toEqual({ error: 'entryOutOfRange' });
    expect(parseCruiseTemperatureEntry('+120/FL350', null)).toEqual({ error: 'entryOutOfRange' });
    expect(parseCruiseTemperatureEntry('-52/FL999', null)).toEqual({ error: 'entryOutOfRange' });
  });
});
