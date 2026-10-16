// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  idgLegendAmber,
  idgStatusLegend,
  idgTemperatureClass,
  idgTemperatureRise,
  idgTemperatureState,
} from './IdgIndications';

/* A320 FCOM DSC-24-20 SD ELEC page (C) oil outlet temperature, a320_fcom.txt l.37623-37625 */
describe('SD ELEC IDG oil outlet temperature', () => {
  it('is green up to 147 °C', () => {
    expect(idgTemperatureState(90)).toBe('normal');
    expect(idgTemperatureState(147)).toBe('normal');
    expect(idgTemperatureClass(90)).toBe('Green');
  });

  it('flashes between 147 °C and 180 °C', () => {
    expect(idgTemperatureState(148)).toBe('advisory');
    expect(idgTemperatureState(180)).toBe('advisory');
    expect(idgTemperatureClass(160)).toBe('Green Pulse');
  });

  it('is amber above 180 °C', () => {
    expect(idgTemperatureState(181)).toBe('overheat');
    expect(idgTemperatureClass(190)).toBe('Amber');
  });
});

/* (A) IDG legend, l.37610-37614; (B) DISC/LO PR, l.37618-37621 */
describe('SD ELEC IDG legends', () => {
  it('the IDG legend is amber when disconnected, on low oil pressure or above 180 °C', () => {
    expect(idgLegendAmber(true, 90, false)).toBe(false);
    expect(idgLegendAmber(false, 20, false)).toBe(true);
    expect(idgLegendAmber(true, 90, true)).toBe(true);
    expect(idgLegendAmber(true, 185, false)).toBe(true);
    expect(idgLegendAmber(true, 160, false)).toBe(false);
  });

  it('shows DISC when disconnected, else LO PR on low oil pressure', () => {
    expect(idgStatusLegend(true, false)).toBeNull();
    expect(idgStatusLegend(true, true)).toBe('LO PR');
    expect(idgStatusLegend(false, true)).toBe('DISC');
    expect(idgStatusLegend(false, false)).toBe('DISC');
  });

  it('the page uses them with the GCU low pressure signal', () => {
    const page = readFileSync(resolve(__dirname, 'Elec.tsx'), 'utf-8');
    expect(page).toContain('L:A32NX_ELEC_ENG_GEN_${number}_IDG_OIL_LOW_PRESSURE');
    expect(page).toContain('idgLegendAmber(!!connected, temperature, !!lowPressure)');
    expect(page).toContain('idgTemperatureClass(temperature)');
    expect(page).toContain('idgStatusLegend(!!connected, !!lowPressure)');
    expect(readFileSync(resolve(__dirname, 'Elec.scss'), 'utf-8')).toContain('&.Pulse');
  });
});

/* A320 FCOM DSC-24-20 SD ELEC page (13) RISE indication, a320_fcom.txt l.37650-37652 */
describe('SD ELEC IDG RISE', () => {
  it('is the outlet minus the inlet temperature, in whole degrees', () => {
    expect(idgTemperatureRise(75.4, 55.2)).toBe(20);
    expect(idgTemperatureRise(63.6, 55.1)).toBe(9);
    expect(idgTemperatureRise(15, 15)).toBe(0);
  });

  it('is drawn in green from the IDG inlet and outlet temperatures', () => {
    const page = readFileSync(resolve(__dirname, 'Elec.tsx'), 'utf-8');
    expect(page).toContain('L:A32NX_ELEC_ENG_GEN_${number}_IDG_OIL_INLET_TEMPERATURE');
    expect(page).toContain('idgTemperatureRise(temperature, inletTemperature)');
  });
});
