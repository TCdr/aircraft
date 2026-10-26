// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isTakeoffDerateFormat,
  parseTakeoffDerateEntry,
  stripFlexEntryPrefix,
  takeoffDerateLabel,
} from './TakeoffDerate';

describe('DRT TO entry', () => {
  it('accepts the eight levels D04 to D32', () => {
    const levels = [4, 8, 12, 16, 20, 24, 28, 32].map((p) => parseTakeoffDerateEntry(takeoffDerateLabel(p)));
    expect(levels).toEqual([4, 8, 12, 16, 20, 24, 28, 32]);
  });

  it('accepts D4 and lowercase', () => {
    expect(parseTakeoffDerateEntry('D4')).toBe(4);
    expect(parseTakeoffDerateEntry('d12')).toBe(12);
  });

  it('rejects values that are not a level', () => {
    expect(parseTakeoffDerateEntry('D05')).toBeNull();
    expect(parseTakeoffDerateEntry('D36')).toBeNull();
    expect(parseTakeoffDerateEntry('D00')).toBeNull();
    expect(parseTakeoffDerateEntry('55')).toBeNull();
    expect(isTakeoffDerateFormat('D05')).toBe(true);
    expect(isTakeoffDerateFormat('55')).toBe(false);
  });

  it('labels the thrust reduction with two digits', () => {
    expect(takeoffDerateLabel(4)).toBe('D04');
    expect(takeoffDerateLabel(24)).toBe('D24');
  });

  it('strips the F of a FLEX TO TEMP entry', () => {
    expect(stripFlexEntryPrefix('F55')).toBe('55');
    expect(stripFlexEntryPrefix('F -5')).toBe('-5');
    expect(stripFlexEntryPrefix('55')).toBe('55');
  });
});
