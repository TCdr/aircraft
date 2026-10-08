// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  oilFilterCloggedShown,
  oilPressureGaugeValue,
  oilPressureIsRed,
  oilQuantityPulses,
  oilTemperatureClass,
} from './OilIndications';

/* A380 FCOM DSC-70-90 OIL QUANTITY, a380_fcom.txt l.113334-113349 */
describe('SD ENGINE oil quantity', () => {
  it('pulses below the 1.2 qt oil advisory limit', () => {
    expect(oilQuantityPulses(1.1, 20)).toBe(true);
    expect(oilQuantityPulses(1.2, 20)).toBe(false);
    expect(oilQuantityPulses(15, 20)).toBe(false);
  });

  it('does not pulse at takeoff or go-around (TOGA) or with the reversers selected', () => {
    expect(oilQuantityPulses(0.8, 45)).toBe(false);
    expect(oilQuantityPulses(0.8, -10)).toBe(false);
  });

  it('draws the first white dash at the 1.2 qt advisory limit and pulses the needle and the value', () => {
    const gauge = readFileSync(resolve(__dirname, 'elements/OilQuantityGauge.tsx'), 'utf-8');
    expect(gauge).toContain('value={OIL_QTY_ADVISORY_QT}');
    expect(gauge).not.toContain('value={3.7}');
    expect(gauge).toContain("${pulse ? 'LinePulse' : ''}");
    const column = readFileSync(resolve(__dirname, 'elements/EngineColumn.tsx'), 'utf-8');
    expect(column).toContain('pulse={oilQuantityPulse}');
    expect(column).toMatch(
      /DecimalValues x=\{x\} y=\{y \+ 206\} value=\{oilQuantity\} active=\{fadecPowered\} pulse=\{oilQuantityPulse\}/,
    );
  });
});

/* A380 FCOM DSC-70-90 OIL TEMPERATURE, l.113357-113373 */
describe('SD ENGINE oil temperature', () => {
  it('is green up to 163 °C, pulses green above 163 °C and is amber above 177 °C', () => {
    expect(oilTemperatureClass(100)).toBe('Green');
    expect(oilTemperatureClass(163)).toBe('Green');
    expect(oilTemperatureClass(170)).toBe('FillPulse');
    expect(oilTemperatureClass(177)).toBe('FillPulse');
    expect(oilTemperatureClass(178)).toBe('Amber');
  });
});

/* A380 FCOM DSC-70-90 OIL PRESSURE, l.113376-113390 */
describe('SD ENGINE oil pressure', () => {
  it('uses the non linear scale: 0-100 PSI on the first half, 100-440 PSI on the second half', () => {
    expect(oilPressureGaugeValue(0)).toBe(0);
    expect(oilPressureGaugeValue(50)).toBe(125);
    expect(oilPressureGaugeValue(100)).toBe(250);
    expect(oilPressureGaugeValue(270)).toBe(375);
    expect(oilPressureGaugeValue(440)).toBe(500);
    expect(oilPressureGaugeValue(600)).toBe(500);
    expect(oilPressureGaugeValue(-5)).toBe(0);
  });

  it('is red at or below 25 PSI', () => {
    expect(oilPressureIsRed(25)).toBe(true);
    expect(oilPressureIsRed(26)).toBe(false);
  });

  it('shows CLOGGED with a clogged oil filter on a running engine', () => {
    expect(oilFilterCloggedShown(true, 1)).toBe(true);
    expect(oilFilterCloggedShown(true, 0)).toBe(false);
    expect(oilFilterCloggedShown(false, 1)).toBe(false);
    const gauge = readFileSync(resolve(__dirname, 'elements/OilPressureGauge.tsx'), 'utf-8');
    expect(gauge).toContain('useSimVar(`L:A32NX_ENGINE_${engine}_OIL_FILTER_CLOGGED`');
    expect(gauge).toMatch(/oilFilterCloggedShown\(!!oilFilterClogged, engineState\)[^]*CLOGGED/);
    expect(gauge).toContain('const needleValue = oilPressureGaugeValue(engineOilPressure);');
    // the oil pressure the FADEC writes, which the FWS also reads
    expect(gauge).toContain("useSimVar(`GENERAL ENG OIL PRESSURE:${engine}`, 'psi', 100)");
  });
});
