// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmsErrorType } from '@fmgc/FmsError';
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

  it('refuses a five digit entry outside the channels and names the channel range', async () => {
    for (const entry of ['20000', '40000', '19999']) {
      await expect(format.parse(entry)).rejects.toMatchObject({
        type: FmsErrorType.EntryOutOfRange,
        details: 'RNG: 20001 TO 39999',
      });
    }
  });

  it('refuses any other number outside the frequency band and names the frequency range', async () => {
    for (const entry of ['112.00', '107.95', '5']) {
      await expect(format.parse(entry)).rejects.toMatchObject({
        type: FmsErrorType.EntryOutOfRange,
        details: 'RNG: 108.00 TO 111.95',
      });
    }
  });

  it('refuses text as a format error', async () => {
    await expect(format.parse('ABCDE')).rejects.toMatchObject({
      type: FmsErrorType.FormatError,
      details: 'FORMAT: XXX.XX or NNNNN',
    });
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
