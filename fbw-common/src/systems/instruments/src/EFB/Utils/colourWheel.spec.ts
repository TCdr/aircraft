// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  buildColourWheel,
  CENTRE_RADIUS,
  COLOUR_WHEEL,
  CustomColours,
  findWedge,
  initialPick,
  nearAlertColours,
  pickChange,
  pickTokens,
  primaryAdjustment,
  readHexEntry,
  shownColour,
  SLOT_CHECKS,
  tint,
  wedgeAt,
  wedgePath,
  WHEEL_COLOURS,
} from './colourWheel';
import { checkPalette, derivePalette, oklchToHex, parseThemeChoice } from './themePalette';

// the painter's wheel the user chose (2026-10-08): 12 pure colours clockwise from yellow right of the top, 5 rings
// from the pure colour at the rim to a pale tint next to the centre
const YELLOW = 0;
const GREEN = 2;
const BLUE = 4;
const RED = 8;
const PURE = 0;
const BRIGHT = 1;
const SOFT = 2;
const LIGHT = 3;
const PALE = 4;

describe('colour wheel colours', () => {
  it('has 5 rings of 12 wedges, each its rim colour mixed with 0, 20, 40, 60 or 80 % white', () => {
    const wheel = buildColourWheel();
    expect(wheel).toHaveLength(5);
    wheel.forEach((ring, r) => {
      expect(ring).toHaveLength(12);
      ring.forEach((wedge, i) => {
        expect(wedge.ring).toBe(r);
        expect(wedge.index).toBe(i);
        expect(wedge.hex).toBe(tint(WHEEL_COLOURS[i], [0, 0.2, 0.4, 0.6, 0.8][r]));
      });
    });
  });

  it("gives the pure colours of the painter's wheel on the rim, red and yellow included", () => {
    expect(COLOUR_WHEEL[PURE][YELLOW].hex).toBe('#ffe100');
    expect(COLOUR_WHEEL[PURE][GREEN].hex).toBe('#1fdd1f');
    expect(COLOUR_WHEEL[PURE][BLUE].hex).toBe('#3344ff');
    expect(COLOUR_WHEEL[PURE][RED].hex).toBe('#ff1a00');
  });

  it('mixes a colour with white', () => {
    expect(tint('#ff1a00', 0)).toBe('#ff1a00');
    expect(tint('#ff1a00', 0.5)).toBe('#ff8d80');
    expect(tint('#000000', 1)).toBe('#ffffff');
  });

  it('offers every wedge, and notes the ones near the alert amber and red', () => {
    expect(nearAlertColours(COLOUR_WHEEL[PURE][RED].hex)).toBe(true);
    expect(nearAlertColours(COLOUR_WHEEL[PURE][11].hex)).toBe(true); // amber
    expect(nearAlertColours(COLOUR_WHEEL[PURE][BLUE].hex)).toBe(false);
    // a red or yellow theme is kept when stored (it was refused before 2026-10-08)
    expect(parseThemeChoice('custom:grey:#ff1a00:#ffe100')).toEqual({
      kind: 'custom',
      base: 'grey',
      primary: '#ff1a00',
      secondary: '#ffe100',
    });
  });

  it('finds the wedge of a colour, or none for a colour off the wheel', () => {
    expect(findWedge('#3344ff')).toMatchObject({ ring: PURE, index: BLUE });
    expect(findWedge(COLOUR_WHEEL[LIGHT][7].hex)).toMatchObject({ ring: LIGHT, index: 7 });
    expect(findWedge('#3b82f6')).toBeNull();
  });
});

describe('colour wheel geometry', () => {
  it("draws wedge 0 right of the top: its outer arc starts at 12 o'clock", () => {
    const d = wedgePath(0, 164, 200);
    expect(d.startsWith(`M ${(200).toFixed(2)} ${(0).toFixed(2)} A 200 200`)).toBe(true);
    expect(d.match(/A /g)).toHaveLength(2);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('hit-tests a point to its ring and hue, clockwise from the top', () => {
    const at = (deg: number, r: number) => [
      200 + r * Math.cos((deg * Math.PI) / 180),
      200 + r * Math.sin((deg * Math.PI) / 180),
    ];
    expect(wedgeAt(...(at(-89, 180) as [number, number]))).toEqual({ ring: PURE, index: 0 }); // just right of the top
    expect(wedgeAt(...(at(-91, 180) as [number, number]))).toEqual({ ring: PURE, index: 11 }); // just left of the top
    expect(wedgeAt(...(at(1, 180) as [number, number]))).toEqual({ ring: PURE, index: 3 }); // just below 3 o'clock
    expect(wedgeAt(...(at(91, 180) as [number, number]))).toEqual({ ring: PURE, index: 6 }); // just left of 6 o'clock
    expect(wedgeAt(...(at(-85, 147) as [number, number]))).toEqual({ ring: BRIGHT, index: 0 });
    expect(wedgeAt(...(at(-85, 114) as [number, number]))).toEqual({ ring: SOFT, index: 0 });
    expect(wedgeAt(...(at(-85, 84) as [number, number]))).toEqual({ ring: LIGHT, index: 0 });
    expect(wedgeAt(...(at(-85, 60) as [number, number]))).toEqual({ ring: PALE, index: 0 });
  });

  it('finds no wedge in the centre disc or outside the wheel', () => {
    expect(wedgeAt(200, 200)).toBeNull();
    expect(wedgeAt(200, 200 - CENTRE_RADIUS)).toBeNull();
    expect(wedgeAt(5, 5)).toBeNull();
    expect(wedgeAt(200, -10)).toBeNull();
  });
});

describe('colour wheel dialog', () => {
  const colours: CustomColours = { base: 'black', primary: '#3b82f6', secondary: '#8b5cf6' };
  const oneColour: CustomColours = { base: 'black', primary: '#3b82f6', secondary: null };

  it('opens on the slot colour, with Same when the secondary follows the primary', () => {
    expect(initialPick('primary', colours)).toEqual({ hex: '#3b82f6', same: false });
    expect(initialPick('secondary', colours)).toEqual({ hex: '#8b5cf6', same: false });
    expect(initialPick('secondary', oneColour)).toEqual({ hex: '#3b82f6', same: true });
  });

  it('shows the primary while Same is selected', () => {
    expect(shownColour({ hex: '#00a38c', same: true }, colours)).toBe('#3b82f6');
    expect(shownColour({ hex: '#00a38c', same: false }, colours)).toBe('#00a38c');
  });

  it('changes only the slot of the dialog on Apply; Same stores null', () => {
    expect(pickChange('primary', { hex: '#4785ff', same: false })).toEqual({ primary: '#4785ff' });
    expect(pickChange('secondary', { hex: '#00a38c', same: false })).toEqual({ secondary: '#00a38c' });
    expect(pickChange('secondary', { hex: '#00a38c', same: true })).toEqual({ secondary: null });
  });

  it('previews the theme as it would be after Apply', () => {
    expect(pickTokens('primary', { hex: '#4785ff', same: false }, colours)).toEqual(
      derivePalette('black', '#4785ff', '#8b5cf6'),
    );
    expect(pickTokens('secondary', { hex: '#00a38c', same: false }, colours)).toEqual(
      derivePalette('black', '#3b82f6', '#00a38c'),
    );
    expect(pickTokens('secondary', { hex: '#00a38c', same: true }, colours)).toEqual(
      derivePalette('black', '#3b82f6', null),
    );
  });

  it('shows the contrast rows of the pairs each slot drives', () => {
    const keys = checkPalette(derivePalette('black', '#3b82f6')).map((c) => c.key);
    for (const key of [...SLOT_CHECKS.primary, ...SLOT_CHECKS.secondary]) {
      expect(keys).toContain(key);
    }
    expect(SLOT_CHECKS.primary).toEqual(['FilledButtonText', 'PrimaryOnCard', 'PrimaryOnPage']);
    expect(SLOT_CHECKS.secondary).toEqual(['SelectedText', 'AccentOnCard']);
  });
});

describe('colour wheel "used on the base" display', () => {
  const usedOn = (base: 'grey' | 'black' | 'light', pick: string) =>
    primaryAdjustment(pick, derivePalette(base, pick, null));

  it('shows nothing when the pick is used as it is', () => {
    expect(usedOn('black', '#4785ff')).toBeNull();
    expect(usedOn('grey', '#00a4ad')).toBeNull();
  });

  it('names the shade used for a pale yellow on the Light base (the approved board 2)', () => {
    // 1.3:1 on the card, 1.0:1 on the page: the page is the surface it fails worst on
    expect(usedOn('light', '#eee5c3')).toEqual({ used: '#898061', reason: 'AdjustedTooLightPage', ratio: '1.0' });
  });

  it('tells too light from too dark, and the card from the page', () => {
    expect(usedOn('light', '#4785ff')).toEqual({ used: '#326fe7', reason: 'AdjustedTooLightPage', ratio: '2.7' });
    expect(usedOn('grey', '#2c5dbd')).toEqual({ used: '#4b7fe2', reason: 'AdjustedTooDarkCard', ratio: '2.7' });
    // 2.98:1 on the card is shown as 2.9, not as a passing-looking 3.0
    expect(usedOn('grey', oklchToHex([0.5, 0.16, 148]))?.ratio).toBe('2.9');
  });

  it('gives the button text as the reason when both surfaces pass', () => {
    expect(usedOn('grey', '#3b6ac5')).toEqual({ used: '#4f80dd', reason: 'AdjustedText', ratio: '3.2' });
  });
});

describe('colour wheel hex field', () => {
  it('picks a typed colour in any hex form', () => {
    expect(readHexEntry('#00A38C', '#3b82f6')).toEqual({ kind: 'pick', hex: '#00a38c' });
    expect(readHexEntry(' 0af ', '#3b82f6')).toEqual({ kind: 'pick', hex: '#00aaff' });
  });

  it('refuses a code that is not a colour; accepts the alert hues (the dialog notes them)', () => {
    expect(readHexEntry('#12345', '#3b82f6')).toEqual({ kind: 'invalid' });
    expect(readHexEntry('#ff5449', '#3b82f6')).toEqual({ kind: 'pick', hex: '#ff5449' });
  });

  it('changes nothing when the field leaves the focus with the colour it shows, or empty (keeps Same)', () => {
    expect(readHexEntry('#3B82F6', '#3b82f6')).toEqual({ kind: 'unchanged' });
    expect(readHexEntry('  ', '#3b82f6')).toEqual({ kind: 'unchanged' });
  });
});
