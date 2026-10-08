// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The flyPad theme palette: the three preset themes (Blue, Dark, Light, the exact values of Assets/Theme.css) and the
 * custom themes made of a base (the neutral surfaces and text of one preset: Grey, Black or Light) plus a primary and a
 * secondary seed colour. The custom accent tokens are derived in OKLCH (perceptual lightness, chroma, hue) and every
 * text and component pair is held to WCAG 2.1 AA (text 4.5:1, components 3:1) by moving only the lightness.
 *
 * The secondary colour goes through the existing *-container and tonal tokens (selected tabs, segmented buttons,
 * chips, the rail), so no component has to know about it. The warn and error tokens are never themed: alerts keep
 * their meaning, and a seed (primary or secondary) close to their hues is refused.
 *
 * Pure functions (no DOM) except applyThemeChoice at the end.
 */

// ------------------------------------------------------------------------------------------- tokens

/** The Material tokens of the flyPad (the m3-* colours of the Tailwind config, `--m3-<name>` in Assets/Theme.css) */
export const M3_TOKEN_NAMES = [
  'ground',
  'card',
  'card-low',
  'tile',
  'outline',
  'outline-strong',
  'text',
  'muted',
  'primary',
  'on-primary',
  'primary-container',
  'on-primary-container',
  'primary-light',
  'tonal',
  'warn-container',
  'on-warn',
  'error-container',
  'on-error',
] as const;

export type M3TokenName = (typeof M3_TOKEN_NAMES)[number];

/** One colour (#rrggbb, lower case) per token */
export type M3Tokens = Record<M3TokenName, string>;

export type ThemePreset = 'blue' | 'dark' | 'light';
export type ThemeBase = 'grey' | 'black' | 'light';

/** A theme: one of the presets, or a base with a primary seed and a secondary seed (null: the primary, one colour) */
export type ThemeChoice =
  | { kind: 'preset'; preset: ThemePreset }
  | { kind: 'custom'; base: ThemeBase; primary: string; secondary: string | null };

/** The neutral tokens of a base: the surfaces, outlines, text and the fixed alert containers of one preset */
type BaseTokens = Omit<
  M3Tokens,
  'primary' | 'on-primary' | 'primary-container' | 'on-primary-container' | 'primary-light' | 'tonal'
>;

const GREY_BASE: BaseTokens = {
  ground: '#101216',
  card: '#1b1e24',
  'card-low': '#16191e',
  tile: '#262a31',
  outline: '#44474e',
  'outline-strong': '#5c6069',
  text: '#e3e5ea',
  muted: '#9aa0a8',
  'warn-container': '#3a2d0e',
  'on-warn': '#f2c14e',
  'error-container': '#4a1d1d',
  'on-error': '#ffb4ab',
};

const BLACK_BASE: BaseTokens = {
  ground: '#0b0d11',
  card: '#161a21',
  'card-low': '#12151b',
  tile: '#222833',
  outline: '#3a4150',
  'outline-strong': '#525a6b',
  text: '#e3e5ea',
  muted: '#9aa0a8',
  'warn-container': '#3a2d0e',
  'on-warn': '#f2c14e',
  'error-container': '#4a1d1d',
  'on-error': '#ffb4ab',
};

const LIGHT_BASE: BaseTokens = {
  ground: '#e4e4e4',
  card: '#ffffff',
  'card-low': '#f4f5f7',
  tile: '#e6e8ec',
  outline: '#c5c8ce',
  'outline-strong': '#aeb2b9',
  text: '#1b1e24',
  muted: '#5f6670',
  'warn-container': '#fff0c2',
  'on-warn': '#7a5a00',
  'error-container': '#ffdad6',
  'on-error': '#93000a',
};

export const THEME_BASES: Record<ThemeBase, BaseTokens> = { grey: GREY_BASE, black: BLACK_BASE, light: LIGHT_BASE };

/** The tokens of the three presets, exactly as in Assets/Theme.css (the spec compares them with the file) */
export const PRESET_TOKENS: Record<ThemePreset, M3Tokens> = {
  blue: {
    ...GREY_BASE,
    primary: '#00a4ad',
    'on-primary': '#061a1b',
    'primary-container': '#0f3d3f',
    'on-primary-container': '#7fd9e0',
    'primary-light': '#b2f0f4',
    tonal: '#2b4a4d',
  },
  dark: {
    ...BLACK_BASE,
    primary: '#3b82f6',
    'on-primary': '#0b1b36',
    'primary-container': '#16284a',
    'on-primary-container': '#9cc0ff',
    'primary-light': '#cfe0ff',
    tonal: '#22395f',
  },
  light: {
    ...LIGHT_BASE,
    primary: '#1d6fe0',
    'on-primary': '#ffffff',
    'primary-container': '#d6e4ff',
    'on-primary-container': '#0b3f8f',
    'primary-light': '#0b3f8f',
    tonal: '#c4d8fb',
  },
};

/** The base of each preset, and the preset whose surfaces a base has (also the theme class of a custom theme) */
export const PRESET_BASE: Record<ThemePreset, ThemeBase> = { blue: 'grey', dark: 'black', light: 'light' };
export const BASE_PRESET: Record<ThemeBase, ThemePreset> = { grey: 'blue', black: 'dark', light: 'light' };

/** The primary seed of each preset: a custom theme started from a preset begins with it */
export const PRESET_SEED: Record<ThemePreset, string> = { blue: '#00a4ad', dark: '#3b82f6', light: '#1d6fe0' };

/** The proposed swatch colours (OFFERED_SWATCHES leaves out the ones too close to the alert hues) */
export const THEME_SWATCHES: readonly { name: string; hex: string }[] = [
  { name: 'FBW cyan', hex: '#00a4ad' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Lime', hex: '#65a30d' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Slate', hex: '#64748b' },
];

// ------------------------------------------------------------------------------------------- hex colours

/**
 * Reads a hex colour typed by the user: #rrggbb or #rgb, with or without the #, any case, spaces around ignored.
 * @returns the colour as #rrggbb in lower case, or null when it is not a hex colour
 */
export function parseHexColour(input: string): string | null {
  const text = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(text)) {
    return `#${text}`;
  }
  if (/^[0-9a-f]{3}$/.test(text)) {
    return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`;
  }
  return null;
}

/** #rrggbb -> red, green, blue in 0..1 (gamma-encoded sRGB) */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** red, green, blue in 0..1 -> #rrggbb, clamped */
function rgbToHex(rgb: number[]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// ------------------------------------------------------------------------------------------- colour maths

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Linear sRGB -> OKLab (Bjorn Ottosson's matrices) */
function linearRgbToOklab([r, g, b]: number[]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> linear sRGB (may be outside 0..1 for colours outside the sRGB gamut) */
function oklabToLinearRgb([L, a, b]: number[]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** #rrggbb -> OKLCH [lightness 0..1, chroma, hue in degrees 0..360] */
export function hexToOklch(hex: string): [number, number, number] {
  const [L, a, b] = linearRgbToOklab(hexToRgb(hex).map(srgbToLinear));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

/** OKLCH -> #rrggbb; the chroma is reduced until the colour fits in sRGB (lightness and hue kept) */
export function oklchToHex([L, C, h]: [number, number, number]): string {
  const hueRad = (h * Math.PI) / 180;
  const toLinear = (chroma: number) => oklabToLinearRgb([L, chroma * Math.cos(hueRad), chroma * Math.sin(hueRad)]);
  const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let chroma = C;
  if (!inGamut(toLinear(chroma))) {
    // bisection on the chroma: the largest one in the gamut, to 1e-9
    let low = 0;
    let high = C;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (inGamut(toLinear(mid))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    chroma = low;
  }
  return rgbToHex(toLinear(chroma).map(linearToSrgb));
}

/** WCAG 2.1 relative luminance of a colour */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio of two colours, 1 to 21 */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves the OKLCH lightness of a colour (hue and chroma kept) by the smallest step, up or down, until it reaches the
 * minimum ratio against every background; the colour itself when it already does.
 */
function ensureContrastAll(fg: string, pairs: [string, number][]): string {
  const passes = (hex: string) => pairs.every(([bg, min]) => contrast(hex, bg) >= min);
  if (passes(fg)) {
    return fg;
  }
  const [L, C, h] = hexToOklch(fg);
  for (let step = 1; step <= 100; step++) {
    for (const direction of [1, -1]) {
      const lightness = L + direction * step * 0.01;
      if (lightness >= 0 && lightness <= 1) {
        const candidate = oklchToHex([lightness, C, h]);
        if (passes(candidate)) {
          return candidate;
        }
      }
    }
  }
  return fg; // nothing passes: checkPalette reports it
}

// ------------------------------------------------------------------------------------------- derivation

/** A tone target: OKLCH lightness (null: the seed's own), share of the seed chroma, chroma cap, seed used */
interface ToneRule {
  l: number | null;
  c: number;
  cMax?: number;
  from?: 'secondary';
}

type AccentToken = 'primary' | 'on-primary' | 'primary-light' | 'primary-container' | 'on-primary-container' | 'tonal';

/**
 * The accent tones of each base, measured on today's presets so that a base with its preset's seed gives that preset
 * back (within 0.005 OKLab): Grey from Blue (#00a4ad), Black from Dark (#3b82f6), Light from Light (#1d6fe0).
 */
const TONES: Record<ThemeBase, Record<AccentToken, ToneRule>> = {
  grey: {
    primary: { l: null, c: 1 },
    'on-primary': { l: 0.2, c: 0.23, cMax: 0.04 },
    'primary-light': { l: 0.915, c: 0.56, cMax: 0.065 },
    'primary-container': { l: 0.331, c: 0.43, cMax: 0.07, from: 'secondary' },
    'on-primary-container': { l: 0.832, c: 0.78, cMax: 0.1, from: 'secondary' },
    tonal: { l: 0.386, c: 0.33, cMax: 0.075, from: 'secondary' },
  },
  black: {
    primary: { l: null, c: 1 },
    'on-primary': { l: 0.225, c: 0.3, cMax: 0.06 },
    'primary-light': { l: 0.904, c: 0.25, cMax: 0.065 },
    'primary-container': { l: 0.281, c: 0.36, cMax: 0.07, from: 'secondary' },
    'on-primary-container': { l: 0.805, c: 0.52, cMax: 0.1, from: 'secondary' },
    tonal: { l: 0.346, c: 0.39, cMax: 0.075, from: 'secondary' },
  },
  light: {
    primary: { l: null, c: 1 },
    'on-primary': { l: 1, c: 0 },
    'primary-light': { l: 0.388, c: 0.76, cMax: 0.15 },
    'primary-container': { l: 0.917, c: 0.21, cMax: 0.045, from: 'secondary' },
    'on-primary-container': { l: 0.388, c: 0.76, cMax: 0.15, from: 'secondary' },
    tonal: { l: 0.879, c: 0.28, cMax: 0.06, from: 'secondary' },
  },
};

/** The near-black used for text on a light primary when the tinted one does not pass */
const NEAR_BLACK = '#0b0d11';

/** The text colour on a filled primary: the tinted target if it passes 4.5:1, else white or near-black */
function bestOnColour(background: string, preferred: string): string {
  if (contrast(preferred, background) >= 4.5) {
    return preferred;
  }
  return contrast('#ffffff', background) >= contrast(NEAR_BLACK, background) ? '#ffffff' : NEAR_BLACK;
}

/**
 * The primary after the contrast repair: 3:1 against the card and the page (a component, WCAG 1.4.11) and a 4.5:1
 * text on it. Design choice: the base's own text polarity on the primary is tried first (dark text on a lighter
 * primary for the dark bases, white text on a darker primary for the light base, as in the presets), up to 0.2 of
 * lightness; then the smallest lightness step either way with any text colour.
 */
function repairPrimary(primary: string, card: string, ground: string, preferredOn: string): string {
  const isComponentOk = (p: string) => contrast(p, card) >= 3 && contrast(p, ground) >= 3;
  const [L, C, h] = hexToOklch(primary);

  const preferredDirection = luminance(preferredOn) > 0.5 ? -1 : 1;
  for (let step = 0; step <= 20; step++) {
    const lightness = L + preferredDirection * step * 0.01;
    if (lightness < 0 || lightness > 1) {
      break;
    }
    const candidate = oklchToHex([lightness, C, h]);
    if (isComponentOk(candidate) && contrast(preferredOn, candidate) >= 4.5) {
      return candidate;
    }
  }

  for (let step = 1; step <= 100; step++) {
    for (const direction of [1, -1]) {
      const lightness = L + direction * step * 0.01;
      if (lightness >= 0 && lightness <= 1) {
        const candidate = oklchToHex([lightness, C, h]);
        if (isComponentOk(candidate) && contrast(bestOnColour(candidate, preferredOn), candidate) >= 4.5) {
          return candidate;
        }
      }
    }
  }
  return primary;
}

/**
 * Derives the tokens of a custom theme. The primary seed drives the buttons, switches, progress bars and chart lines;
 * the secondary seed (null: the primary) the selected states through the *-container and tonal tokens.
 * @param base the neutral surfaces and text
 * @param primary the primary seed, #rrggbb
 * @param secondary the secondary seed, #rrggbb, or null for the primary
 * @returns every m3 token, all 11 contrast checks passing
 */
export function derivePalette(base: ThemeBase, primary: string, secondary: string | null = null): M3Tokens {
  const seeds = { primary: hexToOklch(primary), secondary: hexToOklch(secondary ?? primary) };
  const tones = TONES[base];
  const accents = {} as Record<AccentToken, string>;
  for (const name of Object.keys(tones) as AccentToken[]) {
    const rule = tones[name];
    const [L, C, h] = seeds[rule.from ?? 'primary'];
    const chroma = Math.min(C * rule.c, rule.cMax ?? Infinity);
    accents[name] = oklchToHex([rule.l ?? L, chroma, h]);
  }
  const tokens: M3Tokens = { ...THEME_BASES[base], ...accents };

  // contrast repair, in dependency order: 1) the primary (against the surfaces, with room for its text), 2) its text
  tokens.primary = repairPrimary(tokens.primary, tokens.card, tokens.ground, tokens['on-primary']);
  tokens['on-primary'] = bestOnColour(tokens.primary, tokens['on-primary']);
  // 3) the accent text on the selected containers and on the cards
  tokens['on-primary-container'] = ensureContrastAll(tokens['on-primary-container'], [
    [tokens['primary-container'], 4.5],
    [tokens.card, 4.5],
  ]);
  return tokens;
}

/** The pairs held to WCAG 2.1 AA (1.4.3 text 4.5:1, 1.4.11 components 3:1), with the translation key of each */
export const CONTRAST_CHECKS: readonly {
  fg: M3TokenName;
  bg: M3TokenName;
  min: number;
  key: string;
  fixed?: boolean;
}[] = [
  { fg: 'text', bg: 'ground', min: 4.5, key: 'TextOnPage' },
  { fg: 'text', bg: 'card', min: 4.5, key: 'TextOnCard' },
  { fg: 'muted', bg: 'card', min: 4.5, key: 'LabelsOnCard' },
  { fg: 'muted', bg: 'tile', min: 4.5, key: 'LabelsOnTile' },
  { fg: 'on-primary', bg: 'primary', min: 4.5, key: 'FilledButtonText' },
  { fg: 'on-primary-container', bg: 'primary-container', min: 4.5, key: 'SelectedText' },
  { fg: 'on-primary-container', bg: 'card', min: 4.5, key: 'AccentOnCard' },
  { fg: 'primary', bg: 'card', min: 3, key: 'PrimaryOnCard' },
  { fg: 'primary', bg: 'ground', min: 3, key: 'PrimaryOnPage' },
  { fg: 'on-warn', bg: 'warn-container', min: 4.5, key: 'WarnBanner', fixed: true },
  { fg: 'on-error', bg: 'error-container', min: 4.5, key: 'ErrorBanner', fixed: true },
];

export interface ContrastResult {
  fg: M3TokenName;
  bg: M3TokenName;
  min: number;
  key: string;
  fixed: boolean;
  ratio: number;
  pass: boolean;
}

/** The 11 contrast checks of a token set */
export function checkPalette(tokens: M3Tokens): ContrastResult[] {
  return CONTRAST_CHECKS.map((check) => {
    const ratio = contrast(tokens[check.fg], tokens[check.bg]);
    return { ...check, fixed: !!check.fixed, ratio, pass: ratio >= check.min };
  });
}

// ------------------------------------------------------------------------------------------- alert hues

/** The fixed alert colours whose hues a seed must stay away from: the warn amber and the error red */
const WARN_HUE = hexToOklch('#f2c14e')[2];
const ERROR_HUE = hexToOklch('#ff5449')[2];

/** Hue distance (degrees) under which a seed reads as an alert colour */
export const ALERT_HUE_DISTANCE = 20;

/** Chroma under which a seed is a grey, whatever its hue */
const GREY_CHROMA = 0.06;

/**
 * Whether a seed colour could be read as an alert: a hue within 20 degrees of the warn amber or of the error red (and
 * enough chroma to show a hue at all).
 * @returns 'warn', 'error' or null
 */
export function alertHueClash(hex: string): 'warn' | 'error' | null {
  const [, C, h] = hexToOklch(hex);
  if (C < GREY_CHROMA) {
    return null;
  }
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  if (distance(h, WARN_HUE) < ALERT_HUE_DISTANCE) {
    return 'warn';
  }
  if (distance(h, ERROR_HUE) < ALERT_HUE_DISTANCE) {
    return 'error';
  }
  return null;
}

/** The swatches offered for both seeds: the ones that cannot be read as an alert colour */
export const OFFERED_SWATCHES = THEME_SWATCHES.filter((swatch) => alertHueClash(swatch.hex) === null);

// ------------------------------------------------------------------------------------------- the stored setting

/**
 * The setting EFB_UI_PALETTE: 'blue', 'dark', 'light', or 'custom:<base>:<primary>:<secondary or same>', e.g.
 * 'custom:grey:#8b5cf6:#0d9488'. '' until it is first written: the old EFB_UI_THEME is then migrated.
 */
export function encodeThemeChoice(choice: ThemeChoice): string {
  if (choice.kind === 'preset') {
    return choice.preset;
  }
  return `custom:${choice.base}:${choice.primary}:${choice.secondary ?? 'same'}`;
}

const isPreset = (value: string): value is ThemePreset => value === 'blue' || value === 'dark' || value === 'light';
const isBase = (value: string): value is ThemeBase => value === 'grey' || value === 'black' || value === 'light';

/**
 * Reads a stored EFB_UI_PALETTE value.
 * @returns the theme, or null when the value is empty or not valid (unknown base, bad hex, an alert-hue seed)
 */
export function parseThemeChoice(value: string | undefined | null): ThemeChoice | null {
  if (!value) {
    return null;
  }
  if (isPreset(value)) {
    return { kind: 'preset', preset: value };
  }
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'custom' || !isBase(parts[1])) {
    return null;
  }
  const primary = parseHexColour(parts[2]);
  const secondary = parts[3] === 'same' ? null : parseHexColour(parts[3]);
  if (primary === null || alertHueClash(primary) !== null) {
    return null;
  }
  if (parts[3] !== 'same' && (secondary === null || alertHueClash(secondary) !== null)) {
    return null;
  }
  return { kind: 'custom', base: parts[1], primary, secondary };
}

/**
 * The theme to show: the stored EFB_UI_PALETTE, or, when it is empty or not valid, the old EFB_UI_THEME preset
 * (blue when that one is not valid either). This is the migration: an existing user keeps exactly their theme.
 */
export function resolveThemeChoice(
  palette: string | undefined | null,
  legacyTheme: string | undefined | null,
): ThemeChoice {
  const stored = parseThemeChoice(palette);
  if (stored !== null) {
    return stored;
  }
  return { kind: 'preset', preset: legacyTheme && isPreset(legacyTheme) ? legacyTheme : 'blue' };
}

/**
 * The one-time migration of the old setting: the EFB_UI_PALETTE value to write when it is empty or not valid (the old
 * EFB_UI_THEME preset), or null when it already holds a theme.
 */
export function themeSettingMigration(
  palette: string | undefined | null,
  legacyTheme: string | undefined | null,
): string | null {
  if (parseThemeChoice(palette) !== null) {
    return null;
  }
  return encodeThemeChoice(resolveThemeChoice(null, legacyTheme));
}

/** The value written to the old EFB_UI_THEME with a theme: the preset itself, or the preset of the custom base */
export function legacyThemeOf(choice: ThemeChoice): ThemePreset {
  return choice.kind === 'preset' ? choice.preset : BASE_PRESET[choice.base];
}

// ------------------------------------------------------------------------------------------- using a theme

/** The tokens of a theme: the literal preset values, or the derived ones of a custom theme */
export function themeTokens(choice: ThemeChoice): M3Tokens {
  if (choice.kind === 'preset') {
    return PRESET_TOKENS[choice.preset];
  }
  return derivePalette(choice.base, choice.primary, choice.secondary);
}

/** The colours of the payload CG chart (a canvas cannot use the CSS variables) */
export interface ChartColours {
  /** ZFW line and point (m3-text) */
  zfw: string;
  /** GW/TOW line and point (m3-primary) */
  tow: string;
  /** MLDW line and point (m3-on-warn) */
  ldw: string;
  /** The weight lines and the main CG lines (m3-outline) */
  grid: string;
  /** The other CG lines (m3-tile) */
  gridMinor: string;
  /** The ring around the points: the card under the chart (m3-card) */
  ring: string;
}

export function chartColours(tokens: M3Tokens): ChartColours {
  return {
    zfw: tokens.text,
    tow: tokens.primary,
    ldw: tokens['on-warn'],
    grid: tokens.outline,
    gridMinor: tokens.tile,
    ring: tokens.card,
  };
}

/**
 * The seat map colours of the payload pages [outline, selected, filled]: the presets keep their values; a custom theme
 * has the outline of its base and its primary for the selected seats.
 */
export function seatColours(choice: ThemeChoice): [string, string, string] {
  const filled = '#84CC16';
  if (choice.kind === 'preset') {
    return {
      blue: ['#fff', '#00C9E4', filled],
      dark: ['#fff', '#3B82F6', filled],
      light: ['#000000', '#3B82F6', filled],
    }[choice.preset] as [string, string, string];
  }
  return [choice.base === 'light' ? '#000000' : '#fff', themeTokens(choice).primary, filled];
}

/** The id of the style element holding the variables of a custom theme */
export const CUSTOM_THEME_STYLE_ID = 'efb-custom-theme';

/**
 * The CSS of a custom theme: every m3 token and the legacy highlight colour, on `html:root.theme-custom` (more
 * specific than the `:root.theme-<preset>` rules of Theme.css, so it wins whatever the order of the style sheets).
 * The other legacy --color-* values come from the theme class of the base.
 */
export function customThemeCss(tokens: M3Tokens): string {
  const lines = M3_TOKEN_NAMES.map((name) => `  --m3-${name}: ${tokens[name]};`);
  lines.push(`  --color-highlight: ${tokens.primary};`);
  return `html:root.theme-custom {\n${lines.join('\n')}\n}\n`;
}

/**
 * Shows a theme: the theme class on the root element (a custom theme: its base's preset class + theme-custom) and the
 * style element of the custom variables (removed for a preset, which uses Theme.css alone). A style element is used
 * rather than style.setProperty of custom properties, which the sim's renderer does not reliably support.
 */
export function applyThemeChoice(choice: ThemeChoice, doc: Document = document): void {
  const root = doc.documentElement;
  const stale: string[] = [];
  root.classList.forEach((className) => {
    if (className.startsWith('theme-')) {
      stale.push(className);
    }
  });
  stale.forEach((className) => root.classList.remove(className));
  root.classList.add(`theme-${legacyThemeOf(choice)}`);

  let style = doc.getElementById(CUSTOM_THEME_STYLE_ID);
  if (choice.kind === 'preset') {
    style?.parentNode?.removeChild(style);
    return;
  }
  if (style === null) {
    style = doc.createElement('style');
    style.id = CUSTOM_THEME_STYLE_ID;
    (doc.head ?? root).appendChild(style);
  }
  style.textContent = customThemeCss(themeTokens(choice));
  root.classList.add('theme-custom');
}
