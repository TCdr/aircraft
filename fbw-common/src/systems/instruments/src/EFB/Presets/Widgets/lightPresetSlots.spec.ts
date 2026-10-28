// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { autoLoadTags, normalizePresetName, presetLabel, timeOfDayFromSimValue } from './lightPresetSlots';

/** Returns the key and the replacement values, so the tests can see which text is used */
const translate = (key: string, replacements?: Record<string, string>[]) =>
  `<${key}${replacements ? `:${replacements.map((r) => Object.values(r)[0]).join(',')}` : ''}>`;

describe('timeOfDayFromSimValue', () => {
  it('maps the sim enum 1/2/3 to day, dawn/dusk and night', () => {
    expect(timeOfDayFromSimValue(1)).toBe('day');
    expect(timeOfDayFromSimValue(2)).toBe('dawnDusk');
    expect(timeOfDayFromSimValue(3)).toBe('night');
  });

  it('gives none for any other value', () => {
    expect(timeOfDayFromSimValue(0)).toBeNull();
    expect(timeOfDayFromSimValue(4)).toBeNull();
    expect(timeOfDayFromSimValue(Number.NaN)).toBeNull();
  });
});

describe('autoLoadTags', () => {
  it('lists every time of day the preset is assigned to, in day, dawn/dusk, night order', () => {
    expect(autoLoadTags(2, { day: 2, dawnDusk: 5, night: 2 })).toEqual(['day', 'night']);
    expect(autoLoadTags(5, { day: 2, dawnDusk: 5, night: 2 })).toEqual(['dawnDusk']);
  });

  it('lists all three when one preset serves every time of day', () => {
    expect(autoLoadTags(4, { day: 4, dawnDusk: 4, night: 4 })).toEqual(['day', 'dawnDusk', 'night']);
  });

  it('is empty for a preset that is not assigned', () => {
    expect(autoLoadTags(7, { day: 2, dawnDusk: 5, night: 2 })).toEqual([]);
  });

  it('never tags a preset for the "none" assignment 0', () => {
    expect(autoLoadTags(0, { day: 0, dawnDusk: 0, night: 0 })).toEqual([]);
  });
});

describe('presetLabel', () => {
  it('uses the name when there is one', () => {
    expect(presetLabel(3, 'Night cruise', translate)).toBe('Night cruise');
  });

  it('falls back to the numbered default for no name or an empty name', () => {
    expect(presetLabel(6, undefined, translate)).toBe('<Presets.InteriorLighting.PresetNumber:6>');
    expect(presetLabel(6, '', translate)).toBe('<Presets.InteriorLighting.PresetNumber:6>');
  });
});

describe('normalizePresetName', () => {
  it('trims the typed name', () => {
    expect(normalizePresetName('  Taxi dim  ')).toBe('Taxi dim');
  });

  it('turns a blank name into the unnamed state', () => {
    expect(normalizePresetName('')).toBe('');
    expect(normalizePresetName('   ')).toBe('');
  });
});
