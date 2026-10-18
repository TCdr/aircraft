// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { FmsErrorType } from '@fmgc/FmsError';
import { A380FmsError } from '../../MFD/shared/A380FmsError';
import {
  AtmoAltitudeFormat,
  AtmoNumberFormat,
  AtmoWindFormat,
  atmoEntryErrorText,
  parseAtmoNumber,
} from './InFltPerfAtmoFormats';

/**
 * @param entry an entry being parsed
 * @returns the error it throws, null when it is accepted
 */
async function errorOf(entry: Promise<unknown>): Promise<A380FmsError | null> {
  try {
    await entry;
    return null;
  } catch (e) {
    return e as A380FmsError;
  }
}

describe('ATMO entry fields', () => {
  it('read numbers with a sign or decimals', () => {
    expect(parseAtmoNumber('-5')).toBe(-5);
    expect(parseAtmoNumber('.85')).toBe(0.85);
    expect(parseAtmoNumber('1050.0')).toBe(1050);
    expect(parseAtmoNumber('1,5')).toBeNull();
    expect(parseAtmoNumber('')).toBeNull();
  });

  it('refuse an entry out of range, with the range in the RESULTS panel text', async () => {
    const mach = new AtmoNumberFormat(0.1, 0.99, 2, 4);
    expect(await mach.parse('.85')).toBe(0.85);
    expect(mach.format(0.85)[0]).toBe('0.85');
    const error = await errorOf(mach.parse('1.2'));
    expect(error?.type).toBe(FmsErrorType.EntryOutOfRange);
    expect(atmoEntryErrorText(error!)).toBe('Entry out of range: 0.10 to 0.99');
    const formatError = await errorOf(mach.parse('M85'));
    expect(atmoEntryErrorText(formatError!)).toBe('Format error');
    expect(await mach.parse('')).toBeNull();
  });

  it('show an altitude with its flight level, and read FL entries', async () => {
    const altitude = new AtmoAltitudeFormat(-1_000, 45_000);
    expect(await altitude.parse('FL350')).toBe(35_000);
    expect(altitude.format(35_000)[0]).toBe('35000 ( FL350 )');
    expect(altitude.format(-500)[0]).toBe('-500');
    expect((await errorOf(altitude.parse('FL460')))?.type).toBe(FmsErrorType.EntryOutOfRange);
  });

  it('show the wind with its projection on the course entered', async () => {
    const course = Subject.create<number | null>(null);
    const wind = new AtmoWindFormat(course, Subject.create(false));
    const entry = await wind.parse('180/10');
    expect(wind.format(entry)[0]).toBe('(180/10)');
    course.set(180);
    expect(wind.format(entry)[0]).toBe('(180/10) HD10');
    expect((await errorOf(wind.parse('180-10')))?.type).toBe(FmsErrorType.FormatError);
  });
});
