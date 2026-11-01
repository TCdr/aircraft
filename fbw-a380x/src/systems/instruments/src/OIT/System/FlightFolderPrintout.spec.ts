// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isPrintoutDocument, printoutLayout } from './FlightFolderPrintout';

describe('FLT FOLDER printouts', () => {
  it('are the stored performance pages and the back-up OFP only', () => {
    expect(isPrintoutDocument('performance/LDPA_1')).toBe(true);
    expect(isPrintoutDocument('ofp/ofp')).toBe(true);
    expect(isPrintoutDocument('weather/metar')).toBe(false);
    expect(isPrintoutDocument('ops-plans/flight-plan')).toBe(false);
    expect(isPrintoutDocument(null)).toBe(false);
  });

  it('use the largest font when the longest line fits', () => {
    expect(printoutLayout('WIND (180/10)HD7\nOAT 5 °C', 880)).toEqual({ fontSizePx: 18, wrap: false });
  });

  it('shrink the font until the longest line fits the width', () => {
    const layout = printoutLayout(`${'X'.repeat(100)}\nshort`, 880);
    expect(layout.wrap).toBe(false);
    expect(layout.fontSizePx).toBe(14);
    expect(100 * layout.fontSizePx * 0.6).toBeLessThanOrEqual(880);
  });

  it('wrap the lines when even the smallest font does not fit them', () => {
    expect(printoutLayout('X'.repeat(200), 880)).toEqual({ fontSizePx: 12, wrap: true });
  });

  it('cope with an empty text', () => {
    expect(printoutLayout('', 880)).toEqual({ fontSizePx: 18, wrap: false });
  });
});
