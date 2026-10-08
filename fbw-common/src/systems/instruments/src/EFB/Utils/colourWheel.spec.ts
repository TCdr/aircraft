// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  buildColourWheel,
  CENTRE_RADIUS,
  COLOUR_WHEEL,
  CustomColours,
  findWedge,
  hatchSegments,
  initialPick,
  pickChange,
  pickTokens,
  primaryAdjustment,
  readHexEntry,
  RING_RADII,
  shownColour,
  SLOT_CHECKS,
  wedgeAt,
  wedgePath,
  WHEEL_RADIUS,
} from './colourWheel';
import { alertHueClash, checkPalette, derivePalette, oklchToHex } from './themePalette';

// the approved design: 12 hues clockwise from the top, 4 rings rim to centre
const HUES = [95, 125, 148, 178, 208, 238, 262, 290, 318, 350, 25, 55];
const RINGS: [number, number][] = [
  [0.64, 0.2],
  [0.5, 0.16],
  [0.8, 0.1],
  [0.92, 0.045],
];
const YELLOW = 0;
const TEAL = 3;
const BLUE = 6;
const RED = 10;
const VIVID = 0;
const DEEP = 1;
const LIGHT = 2;
const PALE = 3;

describe('colour wheel colours', () => {
  it('has 4 rings of 12 wedges, each the OKLCH colour of its ring and hue (sRGB clamped)', () => {
    const wheel = buildColourWheel();
    expect(wheel).toHaveLength(4);
    wheel.forEach((ring, r) => {
      expect(ring).toHaveLength(12);
      ring.forEach((wedge, i) => {
        expect(wedge.ring).toBe(r);
        expect(wedge.index).toBe(i);
        expect(wedge.hex).toBe(oklchToHex([RINGS[r][0], RINGS[r][1], HUES[i]]));
      });
    });
  });

  it('gives the colours of the approved mockups', () => {
    expect(COLOUR_WHEEL[VIVID][BLUE].hex).toBe('#4785ff');
    expect(COLOUR_WHEEL[VIVID][TEAL].hex).toBe('#00a38c');
    expect(COLOUR_WHEEL[PALE][YELLOW].hex).toBe('#eee5c3');
  });

  it('blocks exactly the wedges whose colour clashes with the alert hues', () => {
    for (const ring of COLOUR_WHEEL) {
      for (const wedge of ring) {
        expect(wedge.blocked).toBe(alertHueClash(wedge.hex) !== null);
      }
    }
    const blocked = COLOUR_WHEEL.map((ring) => ring.filter((w) => w.blocked).map((w) => w.index));
    // yellow and red on the vivid, deep and light rings; the pale ones are greys for the rule, so allowed
    expect(blocked).toEqual([[YELLOW, RED], [YELLOW, RED], [YELLOW, RED], []]);
  });

  it('finds the wedge of a colour, or none for a colour off the wheel', () => {
    expect(findWedge('#4785ff')).toMatchObject({ ring: VIVID, index: BLUE });
    expect(findWedge(COLOUR_WHEEL[LIGHT][7].hex)).toMatchObject({ ring: LIGHT, index: 7 });
    expect(findWedge('#3b82f6')).toBeNull();
  });
});

describe('colour wheel geometry', () => {
  it('draws wedge 0 centred on the top: its outer arc starts 15 degrees left of the top', () => {
    const d = wedgePath(0, 152, 200);
    const a = (-105 * Math.PI) / 180;
    expect(
      d.startsWith(`M ${(200 + 200 * Math.cos(a)).toFixed(2)} ${(200 + 200 * Math.sin(a)).toFixed(2)} A 200 200`),
    ).toBe(true);
    expect(d.match(/A /g)).toHaveLength(2);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('hit-tests a point to its ring and hue, clockwise from the top', () => {
    expect(wedgeAt(200, 25)).toEqual({ ring: VIVID, index: 0 }); // top, on the rim
    expect(wedgeAt(375, 200)).toEqual({ ring: VIVID, index: 3 }); // right
    expect(wedgeAt(200, 375)).toEqual({ ring: VIVID, index: 6 }); // bottom
    expect(wedgeAt(25, 200)).toEqual({ ring: VIVID, index: 9 }); // left
    expect(wedgeAt(200, 200 - 135)).toEqual({ ring: DEEP, index: 0 });
    expect(wedgeAt(200, 200 - 100)).toEqual({ ring: LIGHT, index: 0 });
    expect(wedgeAt(200, 200 - 70)).toEqual({ ring: PALE, index: 0 });
    // just either side of the boundary between wedge 0 and wedge 1 (15 degrees right of the top)
    const at = (deg: number) => [
      200 + 175 * Math.cos((deg * Math.PI) / 180),
      200 + 175 * Math.sin((deg * Math.PI) / 180),
    ];
    expect(wedgeAt(at(-76)[0], at(-76)[1])).toEqual({ ring: VIVID, index: 0 });
    expect(wedgeAt(at(-74)[0], at(-74)[1])).toEqual({ ring: VIVID, index: 1 });
    // wedge 11 is the last one before the top
    expect(wedgeAt(at(-106)[0], at(-106)[1])).toEqual({ ring: VIVID, index: 11 });
  });

  it('finds no wedge in the centre disc or outside the wheel', () => {
    expect(wedgeAt(200, 200)).toBeNull();
    expect(wedgeAt(200, 200 - CENTRE_RADIUS)).toBeNull();
    expect(wedgeAt(5, 5)).toBeNull();
    expect(wedgeAt(200, -10)).toBeNull();
  });

  it('hatches a wedge with parallel "/" lines kept inside it', () => {
    const [r0, r1] = RING_RADII[VIVID];
    const segments = hatchSegments(RED, r0, r1);
    expect(segments.length).toBeGreaterThan(3);
    for (const [x1, y1, x2, y2] of segments) {
      expect(Math.abs(x1 + y1 - (x2 + y2))).toBeLessThan(1e-6);
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ]) {
        expect(wedgeAt(x, y)).toEqual({ ring: VIVID, index: RED });
        expect(Math.hypot(x - WHEEL_RADIUS, y - WHEEL_RADIUS)).toBeGreaterThanOrEqual(r0);
      }
    }
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
    expect(usedOn('grey', COLOUR_WHEEL[DEEP][2].hex)?.ratio).toBe('2.9');
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

  it('refuses a code that is not a colour, and the alert hues', () => {
    expect(readHexEntry('#12345', '#3b82f6')).toEqual({ kind: 'invalid' });
    expect(readHexEntry('#ff5449', '#3b82f6')).toEqual({ kind: 'alert' });
  });

  it('changes nothing when the field leaves the focus with the colour it shows, or empty (keeps Same)', () => {
    expect(readHexEntry('#3B82F6', '#3b82f6')).toEqual({ kind: 'unchanged' });
    expect(readHexEntry('  ', '#3b82f6')).toEqual({ kind: 'unchanged' });
  });
});
