// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alertHueClash,
  applyThemeChoice,
  chartColours,
  checkPalette,
  CUSTOM_THEME_STYLE_ID,
  derivePalette,
  encodeThemeChoice,
  hexToOklch,
  legacyThemeOf,
  M3_TOKEN_NAMES,
  M3Tokens,
  parseHexColour,
  parseThemeChoice,
  PRESET_BASE,
  PRESET_SEED,
  PRESET_TOKENS,
  OFFERED_SWATCHES,
  resolveThemeChoice,
  seatColours,
  THEME_SWATCHES,
  ThemeBase,
  ThemeChoice,
  themeSettingMigration,
  themeTokens,
} from './themePalette';
import { migrateThemeSetting } from '../Settings/Migration';

const BASES: ThemeBase[] = ['grey', 'black', 'light'];

/** The swatches plus the hard seeds of the report's grid: amber, red, yellow, white and black */
const GRID_SEEDS = [
  ...THEME_SWATCHES.map((swatch) => swatch.hex),
  '#f59e0b',
  '#dc2626',
  '#eab308',
  '#ffffff',
  '#000000',
];

/** The --m3-* values of one theme class of Assets/Theme.css */
function themeCssTokens(themeClass: string): Record<string, string> {
  const css = readFileSync(join(__dirname, '../Assets/Theme.css'), 'utf-8');
  // the Material block of the class: the last rule whose selector names it and that holds --m3- values
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
    ([, selector, body]) => selector.includes(`.${themeClass}`) && body.includes('--m3-'),
  );
  expect(rules.length).toBe(1);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of rules[0][2].matchAll(/--m3-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

/** OKLab distance of two colours */
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const [L, C, h] = hexToOklch(hex);
    return [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The checks that fail, as readable lines (empty when the palette passes) */
const failures = (tokens: M3Tokens) =>
  checkPalette(tokens)
    .filter((check) => !check.pass)
    .map((check) => `${check.fg}/${check.bg} ${check.ratio.toFixed(2)} < ${check.min}`);

describe('theme presets', () => {
  it.each(['blue', 'dark', 'light'] as const)('%s keeps exactly the values of Assets/Theme.css', (preset) => {
    const css = themeCssTokens(`theme-${preset}`);
    expect(Object.keys(css).sort()).toEqual([...M3_TOKEN_NAMES].sort());
    expect(PRESET_TOKENS[preset]).toEqual(css);
    // a preset is never derived
    expect(themeTokens({ kind: 'preset', preset })).toBe(PRESET_TOKENS[preset]);
  });

  it.each(['blue', 'dark', 'light'] as const)('%s passes the 11 contrast checks', (preset) => {
    expect(failures(PRESET_TOKENS[preset])).toEqual([]);
  });

  it.each(['blue', 'dark', 'light'] as const)(
    'the derivation of %s from its base and seed stays within 0.005 OKLab of the preset',
    (preset) => {
      const derived = derivePalette(PRESET_BASE[preset], PRESET_SEED[preset]);
      for (const name of M3_TOKEN_NAMES) {
        expect(deltaE(derived[name], PRESET_TOKENS[preset][name]), name).toBeLessThanOrEqual(0.005);
      }
    },
  );

  it('keeps the old payload chart and seat map colours', () => {
    expect(chartColours(PRESET_TOKENS.blue)).toEqual({
      zfw: '#e3e5ea',
      tow: '#00a4ad',
      ldw: '#f2c14e',
      grid: '#44474e',
      gridMinor: '#262a31',
      ring: '#1b1e24',
    });
    expect(chartColours(PRESET_TOKENS.dark)).toEqual({
      zfw: '#e3e5ea',
      tow: '#3b82f6',
      ldw: '#f2c14e',
      grid: '#3a4150',
      gridMinor: '#222833',
      ring: '#161a21',
    });
    expect(chartColours(PRESET_TOKENS.light)).toEqual({
      zfw: '#1b1e24',
      tow: '#1d6fe0',
      ldw: '#7a5a00',
      grid: '#c5c8ce',
      gridMinor: '#e6e8ec',
      ring: '#ffffff',
    });
    expect(seatColours({ kind: 'preset', preset: 'blue' })).toEqual(['#fff', '#00C9E4', '#84CC16']);
    expect(seatColours({ kind: 'preset', preset: 'dark' })).toEqual(['#fff', '#3B82F6', '#84CC16']);
    expect(seatColours({ kind: 'preset', preset: 'light' })).toEqual(['#000000', '#3B82F6', '#84CC16']);
  });
});

describe('custom theme derivation', () => {
  it('passes the 11 WCAG 2.1 AA checks for every base x primary x secondary of the grid (720 combinations)', () => {
    const failing: string[] = [];
    for (const base of BASES) {
      for (const primary of GRID_SEEDS) {
        for (const secondary of [null, ...GRID_SEEDS]) {
          const bad = failures(derivePalette(base, primary, secondary));
          if (bad.length > 0) {
            failing.push(`${base} ${primary} ${secondary}: ${bad.join(', ')}`);
          }
        }
      }
    }
    expect(failing).toEqual([]);
  });

  it('passes them for 3000 pseudo-random seed pairs as well', () => {
    // a fixed linear congruential sequence: the same colours on every run
    let state = 12345;
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    const randomHex = () => `#${(next() % 0x1000000).toString(16).padStart(6, '0')}`;
    const failing: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const primary = randomHex();
      const secondary = randomHex();
      for (const base of BASES) {
        const bad = failures(derivePalette(base, primary, secondary));
        if (bad.length > 0) {
          failing.push(`${base} ${primary} ${secondary}: ${bad.join(', ')}`);
        }
      }
    }
    expect(failing).toEqual([]);
  });

  it('a sample: Grey with violet and teal has the expected contrasts', () => {
    const tokens = derivePalette('grey', '#8b5cf6', '#0d9488');
    const ratio = (key: string) => checkPalette(tokens).find((check) => check.key === key)!.ratio;
    // the violet seed is lightened just enough for its dark text (4.5:1) and stays a violet
    expect(ratio('FilledButtonText')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('FilledButtonText')).toBeLessThan(5.5);
    expect(hexToOklch(tokens.primary)[2]).toBeCloseTo(hexToOklch('#8b5cf6')[2], 0);
    // the selected states are teal (the secondary), the filled button violet (the primary)
    expect(Math.abs(hexToOklch(tokens['primary-container'])[2] - hexToOklch('#0d9488')[2])).toBeLessThan(3);
    expect(ratio('SelectedText')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the base surfaces and the alert colours of the base untouched', () => {
    const tokens = derivePalette('black', '#16a34a', '#db2777');
    for (const name of [
      'ground',
      'card',
      'tile',
      'text',
      'muted',
      'warn-container',
      'on-warn',
      'error-container',
      'on-error',
    ] as const) {
      expect(tokens[name]).toBe(PRESET_TOKENS.dark[name]);
    }
  });

  it('repairs a primary by its lightness only: the hue of the seed is kept', () => {
    // a dark navy on the dark base and a pale yellow-green on the light base both need a large lightness move
    for (const [base, seed] of [
      ['grey', '#1e3a8a'],
      ['light', '#d9f99d'],
      ['black', '#000080'],
    ] as const) {
      const primary = derivePalette(base, seed).primary;
      const [, chroma, hue] = hexToOklch(primary);
      expect(chroma).toBeGreaterThan(0.03);
      const hueDifference = Math.abs(hue - hexToOklch(seed)[2]);
      expect(Math.min(hueDifference, 360 - hueDifference)).toBeLessThan(3);
      expect(failures(derivePalette(base, seed))).toEqual([]);
    }
  });
});

describe('alert hues', () => {
  it('flags the seeds within 20 degrees of the warn amber or the error red', () => {
    expect(alertHueClash('#ea580c')).toBe('error'); // orange
    expect(alertHueClash('#dc2626')).toBe('error'); // red
    expect(alertHueClash('#f59e0b')).toBe('warn'); // amber
    expect(alertHueClash('#f2c14e')).toBe('warn'); // the warn colour itself
    expect(alertHueClash('#eab308')).toBe('warn'); // yellow
  });

  it('accepts the other hues and the greys', () => {
    for (const hex of [
      '#00a4ad',
      '#3b82f6',
      '#8b5cf6',
      '#db2777',
      '#16a34a',
      '#65a30d',
      '#64748b',
      '#ffffff',
      '#000000',
      '#a08070',
    ]) {
      expect(alertHueClash(hex), hex).toBeNull();
    }
  });

  it('hides Orange from the offered swatches (primary and secondary lists)', () => {
    expect(OFFERED_SWATCHES.map((swatch) => swatch.name)).toEqual([
      'FBW cyan',
      'Blue',
      'Indigo',
      'Violet',
      'Pink',
      'Teal',
      'Green',
      'Lime',
      'Slate',
    ]);
    expect(THEME_SWATCHES).toHaveLength(10);
  });

  it('keeps a stored custom theme whose primary or secondary is an alert hue (allowed since 2026-10-08)', () => {
    expect(parseThemeChoice('custom:grey:#ea580c:same')).toEqual({
      kind: 'custom',
      base: 'grey',
      primary: '#ea580c',
      secondary: null,
    });
    expect(parseThemeChoice('custom:light:#8b5cf6:#dc2626')?.kind).toBe('custom'); // red secondary
    // a value that is not valid still falls back to the old preset
    expect(resolveThemeChoice('custom:grey:#8b5cf6:#zzzzzz', 'dark')).toEqual({ kind: 'preset', preset: 'dark' });
    // a grey secondary is fine
    expect(parseThemeChoice('custom:grey:#8b5cf6:#64748b')).toEqual({
      kind: 'custom',
      base: 'grey',
      primary: '#8b5cf6',
      secondary: '#64748b',
    });
  });
});

describe('hex parsing', () => {
  it('reads #rrggbb and #rgb, with or without #, any case, spaces around', () => {
    expect(parseHexColour('#8B5CF6')).toBe('#8b5cf6');
    expect(parseHexColour('8b5cf6')).toBe('#8b5cf6');
    expect(parseHexColour('  #0d9488 ')).toBe('#0d9488');
    expect(parseHexColour('#abc')).toBe('#aabbcc');
    expect(parseHexColour('F0A')).toBe('#ff00aa');
  });

  it('refuses anything else', () => {
    for (const text of ['', '#', '#12345', '#1234567', '#ggg', 'red', '#12 345', 'rgb(1,2,3)', '##123456']) {
      expect(parseHexColour(text), text).toBeNull();
    }
  });
});

describe('the stored setting and its migration', () => {
  it('writes and reads back every kind of theme', () => {
    const choices: ThemeChoice[] = [
      { kind: 'preset', preset: 'blue' },
      { kind: 'preset', preset: 'light' },
      { kind: 'custom', base: 'black', primary: '#16a34a', secondary: null },
      { kind: 'custom', base: 'light', primary: '#6366f1', secondary: '#0d9488' },
    ];
    for (const choice of choices) {
      expect(parseThemeChoice(encodeThemeChoice(choice))).toEqual(choice);
    }
    expect(encodeThemeChoice(choices[3])).toBe('custom:light:#6366f1:#0d9488');
  });

  it('refuses values that are not a theme', () => {
    for (const value of [
      '',
      'custom',
      'purple',
      'custom:grey:#8b5cf6',
      'custom:white:#8b5cf6:same',
      'custom:grey:#8b5cf:same',
      'custom:grey:#8b5cf6:teal',
    ]) {
      expect(parseThemeChoice(value), value).toBeNull();
    }
  });

  it('falls back to the old EFB_UI_THEME preset while the new setting is empty or not valid', () => {
    expect(resolveThemeChoice('', 'dark')).toEqual({ kind: 'preset', preset: 'dark' });
    expect(resolveThemeChoice('nonsense', 'light')).toEqual({ kind: 'preset', preset: 'light' });
    expect(resolveThemeChoice(undefined, undefined)).toEqual({ kind: 'preset', preset: 'blue' });
    expect(resolveThemeChoice('custom:grey:#8b5cf6:same', 'dark')).toEqual({
      kind: 'custom',
      base: 'grey',
      primary: '#8b5cf6',
      secondary: null,
    });
  });

  it('migrates once: the old preset, then never again', () => {
    expect(themeSettingMigration('', 'dark')).toBe('dark');
    expect(themeSettingMigration('', 'light')).toBe('light');
    expect(themeSettingMigration('', '')).toBe('blue');
    expect(themeSettingMigration('dark', 'blue')).toBeNull();
    expect(themeSettingMigration('custom:black:#16a34a:same', 'dark')).toBeNull();
  });

  it('keeps the old setting on the preset of the base', () => {
    expect(legacyThemeOf({ kind: 'preset', preset: 'dark' })).toBe('dark');
    expect(legacyThemeOf({ kind: 'custom', base: 'grey', primary: '#8b5cf6', secondary: null })).toBe('blue');
    expect(legacyThemeOf({ kind: 'custom', base: 'black', primary: '#8b5cf6', secondary: null })).toBe('dark');
    expect(legacyThemeOf({ kind: 'custom', base: 'light', primary: '#8b5cf6', secondary: null })).toBe('light');
  });

  describe('migrateThemeSetting on the data store', () => {
    let stored: Record<string, string>;

    beforeEach(() => {
      stored = {};
      (window as any).NXDATASTORE_SUBJECT_MAP = undefined;
      (global as any).GetStoredData = (key: string) => stored[key] ?? '';
      (global as any).SetStoredData = (key: string, value: string) => {
        stored[key] = value;
      };
    });

    afterEach(() => {
      (global as any).GetStoredData = () => '';
      (global as any).SetStoredData = () => {};
    });

    it('writes the dark theme of an existing user to the new setting', () => {
      stored.A32NX_EFB_UI_THEME = '"dark"';
      migrateThemeSetting();
      expect(stored.A32NX_EFB_UI_PALETTE).toBe('"dark"');
    });

    it('reads an old theme stored as a legacy plain string', () => {
      stored.A32NX_EFB_UI_THEME = 'light';
      migrateThemeSetting();
      expect(stored.A32NX_EFB_UI_PALETTE).toBe('"light"');
    });

    it('gives a new user the blue theme', () => {
      migrateThemeSetting();
      expect(stored.A32NX_EFB_UI_PALETTE).toBe('"blue"');
    });

    it('leaves a custom theme alone', () => {
      stored.A32NX_EFB_UI_THEME = '"blue"';
      stored.A32NX_EFB_UI_PALETTE = '"custom:grey:#8b5cf6:#0d9488"';
      migrateThemeSetting();
      expect(stored.A32NX_EFB_UI_PALETTE).toBe('"custom:grey:#8b5cf6:#0d9488"');
    });
  });
});

describe('applyThemeChoice', () => {
  afterEach(() => {
    document.documentElement.className = '';
    document.getElementById(CUSTOM_THEME_STYLE_ID)?.remove();
  });

  it('shows a preset with its class alone (Theme.css values, no style element)', () => {
    document.documentElement.className = 'theme-blue animationsEnabled';
    applyThemeChoice({ kind: 'preset', preset: 'dark' });
    expect([...document.documentElement.classList].sort()).toEqual(['animationsEnabled', 'theme-dark']);
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)).toBeNull();
  });

  it('shows a custom theme with the class of its base and its variables, then removes them for a preset', () => {
    const choice: ThemeChoice = { kind: 'custom', base: 'black', primary: '#8b5cf6', secondary: '#0d9488' };
    applyThemeChoice(choice);
    expect([...document.documentElement.classList].sort()).toEqual(['theme-custom', 'theme-dark']);
    const css = document.getElementById(CUSTOM_THEME_STYLE_ID)!.textContent!;
    const tokens = themeTokens(choice);
    expect(css).toContain('html:root.theme-custom {');
    for (const name of M3_TOKEN_NAMES) {
      expect(css).toContain(`--m3-${name}: ${tokens[name]};`);
    }
    expect(css).toContain(`--color-highlight: ${tokens.primary};`);

    // a second custom theme reuses the same element
    applyThemeChoice({ ...choice, base: 'light' });
    expect(document.querySelectorAll(`#${CUSTOM_THEME_STYLE_ID}`)).toHaveLength(1);
    expect([...document.documentElement.classList].sort()).toEqual(['theme-custom', 'theme-light']);

    applyThemeChoice({ kind: 'preset', preset: 'blue' });
    expect([...document.documentElement.classList]).toEqual(['theme-blue']);
    expect(document.getElementById(CUSTOM_THEME_STYLE_ID)).toBeNull();
  });
});
