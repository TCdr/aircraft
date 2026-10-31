// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { withRenderedEngineColumn } from './EngineColumnSpecSupport';
import {
  oilFilterCloggedShown,
  oilPressureGaugeValue,
  oilPressureIsRed,
  oilQuantityPulses,
  oilTemperatureClass,
} from './OilIndications';
import { AutoThrustMode } from '@shared/autopilot';

describe('SD ENGINE oil quantity', () => {
  it('pulses below the 1.2 qt oil advisory limit', () => {
    expect(oilQuantityPulses(1.1, 20, AutoThrustMode.SPEED)).toBe(true);
    expect(oilQuantityPulses(1.2, 20, AutoThrustMode.SPEED)).toBe(false);
    expect(oilQuantityPulses(15, 20, AutoThrustMode.SPEED)).toBe(false);
  });

  it('does not pulse at takeoff or go-around (TOGA) or with the reversers selected', () => {
    expect(oilQuantityPulses(0.8, 45, AutoThrustMode.NONE)).toBe(false);
    expect(oilQuantityPulses(0.8, -10, AutoThrustMode.NONE)).toBe(false);
  });

  it('does not pulse at a FLEX or derated takeoff, a soft go-around or in alpha floor', () => {
    expect(oilQuantityPulses(0.8, 35, AutoThrustMode.MAN_FLEX)).toBe(false);
    expect(oilQuantityPulses(0.8, 35, AutoThrustMode.MAN_DTO)).toBe(false);
    expect(oilQuantityPulses(0.8, 25, AutoThrustMode.MAN_GA_SOFT)).toBe(false);
    expect(oilQuantityPulses(0.8, 20, AutoThrustMode.A_FLOOR)).toBe(false);
    expect(oilQuantityPulses(0.8, 20, AutoThrustMode.TOGA_LK)).toBe(false);
    expect(oilQuantityPulses(0.8, 35, AutoThrustMode.MAN_MCT)).toBe(true);
  });

  it('draws the first white dash at the 1.2 qt advisory limit and pulses the needle and the value', () => {
    const gaugeAngles = (oilQuantity: number) =>
      withRenderedEngineColumn({ 'L:A32NX_ENGINE_OIL_QTY:1': oilQuantity }, (container) => {
        const lines = Array.from(container.querySelectorAll('g#OilQuantityGauge-1 line'));
        // the gauge is centred 206 below the origin of the column
        const angleOf = (line: Element) =>
          Math.atan2(Number(line.getAttribute('y2')) - 206, Number(line.getAttribute('x2')));
        const needle = lines.find((line) => line.getAttribute('class')?.includes('GaugeIndicator'));
        return {
          needleAngle: needle ? angleOf(needle) : NaN,
          needlePulses: needle?.getAttribute('class')?.includes('LinePulse'),
          dashAngles: lines.filter((line) => line.getAttribute('class')?.startsWith('White')).map(angleOf),
          valuePulses: Array.from(container.querySelectorAll('tspan')).some((tspan) =>
            tspan.getAttribute('class')?.includes('FillPulse'),
          ),
        };
      });

    // a dash at the needle position of 1.2 qt, none at 3.7 qt
    const atAdvisoryLimit = gaugeAngles(1.2);
    expect(atAdvisoryLimit.dashAngles.some((angle) => Math.abs(angle - atAdvisoryLimit.needleAngle) < 1e-6)).toBe(true);
    const at3Point7Qt = gaugeAngles(3.7);
    expect(at3Point7Qt.dashAngles.some((angle) => Math.abs(angle - at3Point7Qt.needleAngle) < 1e-6)).toBe(false);

    expect(gaugeAngles(1.1)).toMatchObject({ needlePulses: true, valuePulses: true });
    expect(gaugeAngles(1.3)).toMatchObject({ needlePulses: false, valuePulses: false });
  });
});

describe('SD ENGINE oil temperature', () => {
  it('is green up to 163 °C, pulses green above 163 °C and is amber above 177 °C', () => {
    expect(oilTemperatureClass(100)).toBe('Green');
    expect(oilTemperatureClass(163)).toBe('Green');
    expect(oilTemperatureClass(170)).toBe('FillPulse');
    expect(oilTemperatureClass(177)).toBe('FillPulse');
    expect(oilTemperatureClass(178)).toBe('Amber');
  });
});

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
  });

  it('draws the oil pressure gauge from the pressure the FADEC writes, on the non linear scale', () => {
    const gauge = (pressurePsi: number, simVars: Record<string, number> = {}) =>
      withRenderedEngineColumn({ 'GENERAL ENG OIL PRESSURE:1': pressurePsi, ...simVars }, (container) => {
        const texts = Array.from(container.querySelectorAll('g#OilPressureGauge-1 text'));
        const needle = Array.from(container.querySelectorAll('g#OilPressureGauge-1 line')).find((line) =>
          line.getAttribute('class')?.includes('GaugeIndicator'),
        );
        const value = texts.find((text) => text.getAttribute('class')?.includes('EndAlign F29'));
        return {
          needleX2: Number(needle?.getAttribute('x2')),
          needleClass: needle?.getAttribute('class'),
          valueClass: value?.getAttribute('class'),
          value: value?.textContent,
          clogged: texts.some((text) => text.textContent === 'CLOGGED'),
        };
      });

    // 100 PSI is the middle of the scale: the needle is vertical
    const atMiddle = gauge(100);
    expect(atMiddle.needleX2).toBeCloseTo(0, 6);
    expect(atMiddle.value).toBe('100');
    expect(gauge(20).valueClass).toContain('Red');
    expect(gauge(20).needleClass).toContain('RedGaugeIndicator');
    expect(gauge(100, { 'L:A32NX_ENGINE_1_OIL_FILTER_CLOGGED': 1, 'L:A32NX_ENGINE_STATE:1': 1 }).clogged).toBe(true);
    expect(gauge(100, { 'L:A32NX_ENGINE_1_OIL_FILTER_CLOGGED': 1, 'L:A32NX_ENGINE_STATE:1': 0 }).clogged).toBe(false);
  });
});
