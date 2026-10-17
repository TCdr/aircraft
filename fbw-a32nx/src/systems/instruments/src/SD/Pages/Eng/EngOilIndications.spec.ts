// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  oilFilterClogShown,
  oilPressureIsRed,
  oilPressurePulses,
  oilQuantityPulses,
  oilTemperatureAdvisorySeconds,
  oilTemperatureAdvisoryTimeExceeded,
  oilTemperatureClassName,
} from './EngOilIndications';

/* Oil quantity */
describe('SD ENGINE oil quantity', () => {
  it('pulses below 3.25 QT', () => {
    expect(oilQuantityPulses(false, 3.2)).toBe(true);
    expect(oilQuantityPulses(false, 3.3)).toBe(false);
  });

  it('keeps pulsing until the quantity is back at 4.75 QT', () => {
    expect(oilQuantityPulses(true, 4.5)).toBe(true);
    expect(oilQuantityPulses(true, 4.75)).toBe(false);
  });

  it('reads the FADEC oil quantity in quarts, which an oil leak empties, on a 0-22 QT scale with the 3 QT mark', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).toContain("useSimVar(`L:A32NX_ENGINE_OIL_QTY:${engineNumber}`, 'number', 100)");
    expect(page).not.toContain('ENG OIL QUANTITY');
    expect(page).toContain('getNeedleValue(engineOilQuantity, OIL_QTY_SCALE_MAX_QT)');
    expect(page).toContain('getNeedleValue(OIL_QTY_ADVISORY_QT, OIL_QTY_SCALE_MAX_QT)');
  });

  it('shows the same FADEC oil quantity on the CRUISE page', () => {
    const page = readFileSync(resolve(__dirname, '../Crz/Crz.tsx'), 'utf-8');
    expect(page).toContain("useSimVar('L:A32NX_ENGINE_OIL_QTY:1', 'number', 1000)");
    expect(page).toContain("useSimVar('L:A32NX_ENGINE_OIL_QTY:2', 'number', 1000)");
    expect(page).not.toContain('ENG OIL QUANTITY');
  });
});

/* Oil pressure */
describe('SD ENGINE oil pressure', () => {
  it('is red from 0 to 13 PSI, the ENG OIL LO PR threshold', () => {
    expect(oilPressureIsRed(0)).toBe(true);
    expect(oilPressureIsRed(12.9)).toBe(true);
    expect(oilPressureIsRed(13)).toBe(false);
  });

  it('pulses between 13 and 16 PSI with N2 above 75 %', () => {
    expect(oilPressurePulses(false, 15, 80)).toBe(true);
    expect(oilPressurePulses(false, 15, 70)).toBe(false);
    expect(oilPressurePulses(false, 17, 80)).toBe(false);
  });

  it('stops pulsing above 20 PSI', () => {
    expect(oilPressurePulses(true, 19, 80)).toBe(true);
    expect(oilPressurePulses(true, 21, 80)).toBe(false);
  });

  it('does not pulse in the red range (red instead)', () => {
    expect(oilPressurePulses(true, 10, 80)).toBe(false);
  });

  it('keeps the FBW upper advisory: pulses from 129 PSI until below 126 PSI', () => {
    expect(oilPressurePulses(false, 90, 100)).toBe(false);
    expect(oilPressurePulses(false, 129, 100)).toBe(true);
    expect(oilPressurePulses(true, 127, 100)).toBe(true);
    expect(oilPressurePulses(true, 125, 100)).toBe(false);
  });
});

/* Oil filter CLOG indication */
describe('SD ENGINE oil filter CLOG', () => {
  it('shows CLOG with a clogged filter on a running engine', () => {
    expect(oilFilterClogShown(true, 1)).toBe(true);
  });

  it('does not show CLOG on an engine that is not running, nor without the failure', () => {
    expect(oilFilterClogShown(true, 0)).toBe(false);
    expect(oilFilterClogShown(true, 4)).toBe(false);
    expect(oilFilterClogShown(false, 1)).toBe(false);
  });

  it('draws CLOG from the oil filter failure', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).toContain('useSimVar(`L:A32NX_ENGINE_${engineNumber}_OIL_FILTER_CLOGGED`');
    // the oil pressure the FADEC writes, which the FWC also reads
    expect(page).toContain("useSimVar(`GENERAL ENG OIL PRESSURE:${engineNumber}`, 'psi', 100)");
    expect(page).toMatch(/oilFilterClogShown\(!!oilFilterClogged, engineState\)[^]*CLOG/);
  });
});

/* Oil temperature: pulses green between 140 °C and 155 °C for less than 15 min;
   amber between 140 °C and 155 °C for more than 15 min, or above 155 °C. */
describe('SD ENGINE oil temperature', () => {
  /** Runs the advisory timer at a steady temperature for the given time, in 1 s updates as the SD does */
  const secondsAt = (temperature: number, seconds: number, startSeconds = 0): number => {
    let advisorySeconds = startSeconds;
    for (let i = 0; i < seconds; i++) {
      advisorySeconds = oilTemperatureAdvisorySeconds(advisorySeconds, temperature, 1);
    }
    return advisorySeconds;
  };

  it('is green in the normal range', () => {
    expect(oilTemperatureClassName(100, 100, oilTemperatureAdvisoryTimeExceeded(secondsAt(100, 3600)))).toBe(
      'FillGreen',
    );
  });

  it('pulses green between 140 and 155 °C for less than 15 min', () => {
    expect(oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 14 * 60)))).toBe(
      'FillPulse',
    );
  });

  it('turns amber after more than 15 min at a STEADY 145 °C', () => {
    expect(oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 15 * 60 + 1)))).toBe(
      'FillAmber',
    );
  });

  it('restarts the 15 min when the temperature goes back below 140 °C', () => {
    const afterDip = secondsAt(135, 1, secondsAt(145, 14 * 60));
    expect(afterDip).toBe(0);
    expect(
      oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 2 * 60, afterDip))),
    ).toBe('FillPulse');
  });

  it('is amber above 155 °C at once', () => {
    expect(oilTemperatureClassName(155, 156, oilTemperatureAdvisoryTimeExceeded(0))).toBe('FillAmber');
  });

  it('times the advisory on every SD update, not only when the temperature changes', () => {
    const page = readFileSync(resolve(__dirname, 'Eng.tsx'), 'utf-8');
    expect(page).toMatch(/useUpdate\([^]*oilTemperatureAdvisorySeconds\(/);
    expect(page).not.toContain('900_000');
  });
});
