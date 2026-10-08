// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The colour wheel of the custom theme dialog (Settings > flyPad, the pencil of the primary and secondary colours):
 * 12 OKLCH hues x 4 rings of fixed lightness and chroma, the wedges near the alert hues blocked, the SVG geometry of
 * the wedges and of their hit test, and the decisions of the dialog (what the pick changes, how it is shown).
 *
 * Pure functions (no DOM, no React): the dialog is Settings/Pages/ColourWheelDialog.tsx.
 */

import {
  alertHueClash,
  contrast,
  derivePalette,
  luminance,
  M3Tokens,
  oklchToHex,
  parseHexColour,
  ThemeBase,
} from './themePalette';

// ------------------------------------------------------------------------------------------- the colours

/** The 12 hues of the wheel (OKLCH degrees), clockwise from the top */
export const WHEEL_HUES: readonly number[] = [95, 125, 148, 178, 208, 238, 262, 290, 318, 350, 25, 55];

/**
 * The rings, rim to centre: OKLCH lightness and chroma cap (the chroma is then reduced to fit in sRGB by oklchToHex).
 * Vivid and Deep give the strong colours of the dark bases, Light and Pale the soft ones.
 */
export const WHEEL_RINGS: readonly { name: 'vivid' | 'deep' | 'light' | 'pale'; l: number; c: number }[] = [
  { name: 'vivid', l: 0.64, c: 0.2 },
  { name: 'deep', l: 0.5, c: 0.16 },
  { name: 'light', l: 0.8, c: 0.1 },
  { name: 'pale', l: 0.92, c: 0.045 },
];

/** One wedge of the wheel */
export interface WheelWedge {
  /** Ring index, 0 = the rim (vivid) to 3 = next to the centre (pale) */
  ring: number;
  /** Hue index, 0 = the top wedge, clockwise */
  index: number;
  /** #rrggbb, lower case */
  hex: string;
  /** Too close to the amber or red of the alerts (alertHueClash): shown hatched, cannot be picked */
  blocked: boolean;
}

/** The wedges of the wheel, ring by ring (rim first), each ring in hue order */
export function buildColourWheel(): WheelWedge[][] {
  return WHEEL_RINGS.map((ring, ringIndex) =>
    WHEEL_HUES.map((hue, index) => {
      const hex = oklchToHex([ring.l, ring.c, hue]);
      return { ring: ringIndex, index, hex, blocked: alertHueClash(hex) !== null };
    }),
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
  [152, 200],
  [118, 152],
  [86, 118],
  [58, 86],
];

/** The disc in the middle showing the picked colour */
export const CENTRE_RADIUS = 50;

/** The angular size of a wedge, in degrees */
const WEDGE_DEGREES = 360 / WHEEL_HUES.length;

/** The point at radius r and angle deg (0 = the right, clockwise as the screen y goes down), "x y" */
const polar = (r: number, deg: number): string => {
  const a = (deg * Math.PI) / 180;
  return `${(WHEEL_RADIUS + r * Math.cos(a)).toFixed(2)} ${(WHEEL_RADIUS + r * Math.sin(a)).toFixed(2)}`;
};

/** The start angle of wedge i: wedge 0 is centred on the top */
const wedgeStart = (index: number) => -90 - WEDGE_DEGREES / 2 + index * WEDGE_DEGREES;

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
  return { ring, index: Math.floor(degrees / WEDGE_DEGREES) % WHEEL_HUES.length };
}

/**
 * The hatching of a blocked wedge as plain line segments [x1, y1, x2, y2] ("/" stripes, `spacing` apart), kept
 * `inset` inside the wedge so that the gaps between the wedges stay clean. Design choice: computed lines rather than
 * an SVG <pattern> or <clipPath>, whose support by the sim browser (Coherent GT) is not proven.
 */
export function hatchSegments(index: number, r0: number, r1: number, spacing = 8, inset = 2): number[][] {
  const a0 = wedgeStart(index);
  const inside = (x: number, y: number) => {
    const dx = x - WHEEL_RADIUS;
    const dy = y - WHEEL_RADIUS;
    const r = Math.hypot(dx, dy);
    if (r < r0 + inset || r > r1 - inset) {
      return false;
    }
    const degrees = ((((Math.atan2(dy, dx) * 180) / Math.PI - a0) % 360) + 360) % 360;
    // the inset as an angle at this radius
    const margin = (inset / r) * (180 / Math.PI);
    return degrees >= margin && degrees <= WEDGE_DEGREES - margin;
  };

  const segments: number[][] = [];
  const step = 0.5;
  const lineSpacing = spacing * Math.SQRT2; // the lines x + y = c, `spacing` apart
  for (let c = 0; c <= 4 * WHEEL_RADIUS; c += lineSpacing) {
    // walk the line from its top-right end (x = c - y) down to its bottom-left one, keeping the runs inside the wedge
    let start: number[] | null = null;
    let last: number[] | null = null;
    for (let y = 0; y <= 2 * WHEEL_RADIUS; y += step) {
      const x = c - y;
      if (inside(x, y)) {
        if (start === null) {
          start = [x, y];
        }
        last = [x, y];
      } else if (start !== null && last !== null) {
        segments.push([start[0], start[1], last[0], last[1]]);
        start = null;
      }
    }
    if (start !== null && last !== null) {
      segments.push([start[0], start[1], last[0], last[1]]);
    }
  }
  return segments.filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) >= 1);
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
export type HexEntry = { kind: 'unchanged' } | { kind: 'invalid' } | { kind: 'alert' } | { kind: 'pick'; hex: string };

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
  if (alertHueClash(hex) !== null) {
    return { kind: 'alert' };
  }
  return { kind: 'pick', hex };
}
