// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FrequencyOrChannelLsFormat } from './DataEntryFormats';

describe('LS FREQ/CHAN entry', () => {
  const format = new FrequencyOrChannelLsFormat();

  it('accepts an ILS frequency', async () => {
    expect(await format.parse('110.30')).toBe(110.3);
    expect(await format.parse('108.00')).toBe(108);
    expect(await format.parse('111.95')).toBe(111.95);
  });

  it('accepts the lowest and the highest GLS channel', async () => {
    expect(await format.parse('20001')).toBe(20001);
    expect(await format.parse('39999')).toBe(39999);
  });

  it('refuses the channels just outside the range', async () => {
    await expect(format.parse('20000')).rejects.toBeDefined();
    await expect(format.parse('40000')).rejects.toBeDefined();
  });

  it('refuses a number between the frequency band and the channels', async () => {
    await expect(format.parse('112.00')).rejects.toBeDefined();
    await expect(format.parse('19999')).rejects.toBeDefined();
  });

  it('refuses text', async () => {
    await expect(format.parse('ABCDE')).rejects.toBeDefined();
  });

  it('clears the field on an empty entry', async () => {
    expect(await format.parse('')).toBeNull();
  });

  it('shows a frequency with two decimals and a channel as five digits', () => {
    expect(format.format(110.3)[0]).toBe('110.30');
    expect(format.format(20001)[0]).toBe('20001');
    expect(format.format(null)[0]).toBe('---.--');
  });
});
