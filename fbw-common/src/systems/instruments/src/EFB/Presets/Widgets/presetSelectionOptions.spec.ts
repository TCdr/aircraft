// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { buildPresetSelectionOptions, PRESET_IDS } from './presetSelectionOptions';

/** Returns the translation key itself, so the tests can see which text is used */
const translate = (key: string) => `<${key}>`;

const NONE = '<Presets.InteriorLighting.AutoLoadNoneSelection>';
const NO_NAME = '<Presets.InteriorLighting.NoName>';

describe('buildPresetSelectionOptions', () => {
  it('offers None first, then all 8 presets even when none is named', () => {
    const options = buildPresetSelectionOptions(new Map(), translate);

    expect(options).toHaveLength(9);
    expect(options[0]).toEqual({ value: 0, displayValue: NONE });
    expect(options.slice(1).map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    options.slice(1).forEach((option) => expect(option.displayValue).toBe(`${option.value} - ${NO_NAME}`));
  });

  it('shows each preset as "<number> - <name>"', () => {
    const options = buildPresetSelectionOptions(
      new Map([
        [1, 'Day'],
        [3, 'Night'],
        [8, 'Dawn and dusk'],
      ]),
      translate,
    );

    expect(options[1]).toEqual({ value: 1, displayValue: '1 - Day' });
    expect(options[2]).toEqual({ value: 2, displayValue: `2 - ${NO_NAME}` });
    expect(options[3]).toEqual({ value: 3, displayValue: '3 - Night' });
    expect(options[8]).toEqual({ value: 8, displayValue: '8 - Dawn and dusk' });
  });

  it('treats an empty name as unnamed', () => {
    const options = buildPresetSelectionOptions(new Map([[5, '']]), translate);

    expect(options[5]).toEqual({ value: 5, displayValue: `5 - ${NO_NAME}` });
  });

  it('ignores names of IDs that have no preset row', () => {
    const options = buildPresetSelectionOptions(new Map([[9, 'Extra']]), translate);

    expect(options.map((option) => option.value)).toEqual([0, ...PRESET_IDS]);
    expect(options.some((option) => option.displayValue.includes('Extra'))).toBe(false);
  });
});
