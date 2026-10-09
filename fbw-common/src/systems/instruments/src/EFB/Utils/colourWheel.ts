// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The colour wheel of the custom theme dialog (Settings > flyPad, the pencil of the primary and secondary colours):
 * 12 pure hues x 5 rings from the pure colour at the rim to pale tints next to the centre (the classic painter's wheel
 * the user chose, red and yellow included), the SVG geometry of the wedges and of their hit test, and the decisions of
 * the dialog (what the pick changes, how it is shown).
 *
 * Pure functions (no DOM, no React): the dialog is Settings/Pages/ColourWheelDialog.tsx.
 */

import { alertHueClash, contrast, derivePalette, luminance, M3Tokens, parseHexColour, ThemeBase } from './themePalette';

// ------------------------------------------------------------------------------------------- the colours

/**
 * The 12 pure colours of the rim, clockwise from the top (wedge 0 starts at 12 o'clock): yellow, yellow-green, green,
 * sky blue, blue, violet, magenta, crimson, red, red-orange, orange and amber. Design choice: the colours of the
 * painter's wheel the user supplied (2026-10-08), full strength sRGB rather than equal-lightness OKLCH hues.
 */
export const WHEEL_COLOURS: readonly string[] = [
  '#ffe100',
  '#6cf000',
  '#1fdd1f',
  '#55d8ff',
  '#3344ff',
  '#8800ff',
  '#ff00ee',
  '#ff0066',
  '#ff1a00',
  '#ff5522',
  '#ff8a22',
  '#ffa500',
];

/**
 * The rings, rim to centre: the share of white mixed into the rim colour (0 = the pure colour, 0.8 = a pale tint).
 */
export const WHEEL_RINGS: readonly { name: 'pure' | 'bright' | 'soft' | 'light' | 'pale'; white: number }[] = [
  { name: 'pure', white: 0 },
  { name: 'bright', white: 0.2 },
  { name: 'soft', white: 0.4 },
  { name: 'light', white: 0.6 },
  { name: 'pale', white: 0.8 },
];

/** A colour mixed with white: share 0 keeps it, share 1 gives white (#rrggbb, lower case) */
export function tint(hex: string, white: number): string {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    return Math.round(value + (255 - value) * white)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** One wedge of the wheel */
export interface WheelWedge {
  /** Ring index, 0 = the rim (pure colour) to 4 = next to the centre (pale) */
  ring: number;
  /** Hue index, 0 = the wedge right of 12 o'clock, clockwise */
  index: number;
  /** #rrggbb, lower case */
  hex: string;
}

/** The wedges of the wheel, ring by ring (rim first), each ring in hue order */
export function buildColourWheel(): WheelWedge[][] {
  return WHEEL_RINGS.map((ring, ringIndex) =>
    WHEEL_COLOURS.map((colour, index) => ({ ring: ringIndex, index, hex: tint(colour, ring.white) })),
  );
}

export const COLOUR_WHEEL: WheelWedge[][] = buildColourWheel();

/** The wedge of a colour (exact match), or null when the colour is not on the wheel (a swatch or a typed hex code) */
export function findWedge(hex: string, wheel: WheelWedge[][] = COLOUR_WHEEL): WheelWedge | null {
  for (const ring of wheel) {
    for (const wedge of ring) {
      if (wedge.hex === hex) {
        return wedge;
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------- the geometry

/** The wheel is drawn in a 400 x 400 box (viewBox units), centred on (200, 200) */
export const WHEEL_RADIUS = 200;

/** The inner and outer radius of each ring, rim first */
export const RING_RADII: readonly [number, number][] = [
  [164, 200],
  [130, 164],
  [98, 130],
  [70, 98],
  [50, 70],
];

/** The disc in the middle showing the picked colour */
export const CENTRE_RADIUS = 42;

/** The angular size of a wedge, in degrees */
const WEDGE_DEGREES = 360 / WHEEL_COLOURS.length;

/** The point at radius r and angle deg (0 = the right, clockwise as the screen y goes down), "x y" */
const polar = (r: number, deg: number): string => {
  const a = (deg * Math.PI) / 180;
  return `${(WHEEL_RADIUS + r * Math.cos(a)).toFixed(2)} ${(WHEEL_RADIUS + r * Math.sin(a)).toFixed(2)}`;
};

/** The start angle of wedge i: wedge 0 starts at the top (12 o'clock), as on the painter's wheel */
const wedgeStart = (index: number) => -90 + index * WEDGE_DEGREES;

/** The SVG path of an annular sector: wedge `index` between the radii r0 (inner) and r1 (outer) */
export function wedgePath(index: number, r0: number, r1: number): string {
  const a0 = wedgeStart(index);
  const a1 = a0 + WEDGE_DEGREES;
  return `M ${polar(r1, a0)} A ${r1} ${r1} 0 0 1 ${polar(r1, a1)} L ${polar(r0, a1)} A ${r0} ${r0} 0 0 0 ${polar(r0, a0)} Z`;
}

/** The ring and hue index of the point (x, y) in viewBox units, or null outside the rings (the centre disc, the corners) */
export function wedgeAt(x: number, y: number): { ring: number; index: number } | null {
  const dx = x - WHEEL_RADIUS;
  const dy = y - WHEEL_RADIUS;
  const r = Math.hypot(dx, dy);
  const ring = RING_RADII.findIndex(([r0, r1]) => r >= r0 && r <= r1);
  if (ring < 0) {
    return null;
  }
  // the angle from the start of wedge 0, clockwise, 0..360
  const degrees = ((((Math.atan2(dy, dx) * 180) / Math.PI - wedgeStart(0)) % 360) + 360) % 360;
  return { ring, index: Math.floor(degrees / WEDGE_DEGREES) % WHEEL_COLOURS.length };
}

// ------------------------------------------------------------------------------------------- the dialog

/** The colour slot a dialog edits */
export type ColourSlot = 'primary' | 'secondary';

/** The colours of a custom theme the dialog starts from */
export interface CustomColours {
  base: ThemeBase;
  primary: string;
  /** null: the same as the primary */
  secondary: string | null;
}

/** What the dialog is showing: the picked colour and, for the secondary, whether Same is selected */
export interface WheelPick {
  hex: string;
  /** Secondary only: Same is selected (the secondary follows the primary, the wheel is dimmed) */
  same: boolean;
}

/** The pick the dialog opens with: the slot's current colour (Same when the secondary follows the primary) */
export function initialPick(slot: ColourSlot, colours: CustomColours): WheelPick {
  if (slot === 'primary') {
    return { hex: colours.primary, same: false };
  }
  return { hex: colours.secondary ?? colours.primary, same: colours.secondary === null };
}

/** The colour a pick shows (swatch, hex field, centre disc): the primary while Same is selected */
export function shownColour(pick: WheelPick, colours: CustomColours): string {
  return pick.same ? colours.primary : pick.hex;
}

/** The change Apply makes to the theme: only the slot of the dialog */
export function pickChange(slot: ColourSlot, pick: WheelPick): { primary: string } | { secondary: string | null } {
  if (slot === 'primary') {
    return { primary: pick.hex };
  }
  return { secondary: pick.same ? null : pick.hex };
}

/** The tokens the theme would have with the pick applied (the preview and the contrast rows of the dialog) */
export function pickTokens(slot: ColourSlot, pick: WheelPick, colours: CustomColours): M3Tokens {
  const change = pickChange(slot, pick);
  const next = { ...colours, ...change };
  return derivePalette(next.base, next.primary, next.secondary);
}

/** The contrast checks shown for a slot (the keys of CONTRAST_CHECKS): the pairs the slot's colour drives */
export const SLOT_CHECKS: Record<ColourSlot, readonly string[]> = {
  primary: ['FilledButtonText', 'PrimaryOnCard', 'PrimaryOnPage'],
  secondary: ['SelectedText', 'AccentOnCard'],
};

/** Why and how a picked primary is changed on the base (derivePalette's contrast repair), for the dialog's banner */
export interface PrimaryAdjustment {
  /** The primary the flyPad uses on the base, #rrggbb */
  used: string;
  /**
   * The translation key (Settings.flyPad.ThemePalette.*) of the banner: too light or too dark against a card or the
   * page, or (both surfaces pass) no button text reaching 4.5:1
   */
  reason:
    | 'AdjustedTooLightCard'
    | 'AdjustedTooLightPage'
    | 'AdjustedTooDarkCard'
    | 'AdjustedTooDarkPage'
    | 'AdjustedText';
  /** The failing ratio of the picked colour on that surface, rounded down to 0.1 (an honest "2.9:1", never "3.0:1") */
  ratio: string;
}

/**
 * Whether the picked primary is used as it is on the base: null when it is, else the colour the flyPad uses instead
 * and why. The secondary has no such display: its lightness is always set by the base (the dialog says so).
 */
export function primaryAdjustment(pick: string, tokens: M3Tokens): PrimaryAdjustment | null {
  if (tokens.primary === pick) {
    return null;
  }
  const onCard = contrast(pick, tokens.card);
  const onPage = contrast(pick, tokens.ground);
  const worst = Math.min(onCard, onPage);
  const ratio = (Math.floor(worst * 10) / 10).toFixed(1);
  if (worst >= 3) {
    return { used: tokens.primary, reason: 'AdjustedText', ratio };
  }
  // darkened by the repair: the pick was too light; the surface it fails on is the one with the lower ratio
  const tooLight = luminance(tokens.primary) < luminance(pick);
  const onCardWorst = onCard <= onPage;
  const reasons: Record<string, PrimaryAdjustment['reason']> = {
    lightCard: 'AdjustedTooLightCard',
    lightPage: 'AdjustedTooLightPage',
    darkCard: 'AdjustedTooDarkCard',
    darkPage: 'AdjustedTooDarkPage',
  };
  return {
    used: tokens.primary,
    reason: reasons[`${tooLight ? 'light' : 'dark'}${onCardWorst ? 'Card' : 'Page'}`],
    ratio,
  };
}

/** The outcome of a hex code typed in the dialog */
export type HexEntry = { kind: 'unchanged' } | { kind: 'invalid' } | { kind: 'pick'; hex: string };

/**
 * Reads the hex field of the dialog (applied with Enter or when the field loses the focus). The field leaving the
 * focus with the colour it shows (or empty) changes nothing: it must not turn Same off.
 */
export function readHexEntry(text: string, shown: string): HexEntry {
  if (text.trim() === '') {
    return { kind: 'unchanged' };
  }
  const hex = parseHexColour(text);
  if (hex === null) {
    return { kind: 'invalid' };
  }
  if (hex === shown) {
    return { kind: 'unchanged' };
  }
  return { kind: 'pick', hex };
}

/**
 * Whether a colour is close to the amber or red of the alerts (alertHueClash): the dialog then says that buttons and
 * switches in it may look like warnings. Design choice (user, 2026-10-08): a note, no longer a block.
 */
export function nearAlertColours(hex: string): boolean {
  return alertHueClash(hex) !== null;
}
