// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, SimVarValues, visibleTexts } from '../../Common/SdPageSpecHarness';
import { ElecPage } from './Elec';
import {
  idgLegendAmber,
  idgStatusLegend,
  idgTemperatureClass,
  idgTemperatureRise,
  idgTemperatureState,
} from './IdgIndications';

/* IDG oil outlet temperature */
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

/* IDG legend and DISC/LO PR */
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

  // Fixture check: the class the page gives a flashing temperature has to exist in the stylesheet
  it('has the Pulse style the flashing IDG temperature uses', () => {
    expect(readFileSync(resolve(__dirname, 'Elec.scss'), 'utf-8')).toContain('&.Pulse');
  });
});

describe('SD ELEC page IDG indications', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  /** Both IDGs connected and cool; the test changes the values of IDG 1 */
  const idgSimVars = (idg1: SimVarValues): SimVarValues => ({
    'L:A32NX_ELEC_ENG_GEN_1_IDG_IS_CONNECTED': 1,
    'L:A32NX_ELEC_ENG_GEN_2_IDG_IS_CONNECTED': 1,
    'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE': 90,
    'L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_OUTLET_TEMPERATURE': 90,
    'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_INLET_TEMPERATURE': 80,
    'L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_INLET_TEMPERATURE': 80,
    ...idg1,
  });

  const amberIdgLegends = () => visibleTexts(page, 'IDG').filter((text) => text.classList.contains('Amber'));

  it('shows LO PR and an amber IDG legend from the GCU low pressure signal', () => {
    page = renderSdPage(<ElecPage />, idgSimVars({ 'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_LOW_PRESSURE': 1 }));

    expect(visibleTexts(page, 'LO PR')).toHaveLength(1);
    expect(visibleTexts(page, 'DISC')).toHaveLength(0);
    expect(amberIdgLegends()).toHaveLength(1);
  });

  it('shows DISC and an amber IDG legend for a disconnected IDG', () => {
    page = renderSdPage(<ElecPage />, idgSimVars({ 'L:A32NX_ELEC_ENG_GEN_1_IDG_IS_CONNECTED': 0 }));

    expect(visibleTexts(page, 'DISC')).toHaveLength(1);
    expect(amberIdgLegends()).toHaveLength(1);
  });

  it('shows no status and a white IDG legend when everything is normal', () => {
    page = renderSdPage(<ElecPage />, idgSimVars({}));

    expect(visibleTexts(page, 'LO PR')).toHaveLength(0);
    expect(visibleTexts(page, 'DISC')).toHaveLength(0);
    expect(amberIdgLegends()).toHaveLength(0);
  });

  it('turns the IDG legend amber above 180 °C', () => {
    page = renderSdPage(<ElecPage />, idgSimVars({ 'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE': 185 }));

    expect(amberIdgLegends()).toHaveLength(1);
    expect(visibleTexts(page, '185')[0].classList.contains('Amber')).toBe(true);
  });

  it('flashes the outlet temperature between 147 and 180 °C', () => {
    page = renderSdPage(<ElecPage />, idgSimVars({ 'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE': 160 }));

    expect(visibleTexts(page, '160')[0].classList.contains('Pulse')).toBe(true);
    expect(amberIdgLegends()).toHaveLength(0);
  });
});

/* IDG oil RISE */
describe('SD ELEC IDG RISE', () => {
  it('is the outlet minus the inlet temperature, in whole degrees', () => {
    expect(idgTemperatureRise(75.4, 55.2)).toBe(20);
    expect(idgTemperatureRise(63.6, 55.1)).toBe(9);
    expect(idgTemperatureRise(15, 15)).toBe(0);
  });
});

describe('SD ELEC page IDG RISE', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  it('draws the RISE in green from the IDG outlet and inlet temperatures', () => {
    page = renderSdPage(<ElecPage />, {
      'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE': 100,
      'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_INLET_TEMPERATURE': 53,
      'L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_OUTLET_TEMPERATURE': 70,
      'L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_INLET_TEMPERATURE': 61,
    });

    const rise1 = visibleTexts(page, '47');
    const rise2 = visibleTexts(page, '9');
    expect(rise1).toHaveLength(1);
    expect(rise1[0].classList.contains('Green')).toBe(true);
    expect(rise2).toHaveLength(1);
    expect(rise2[0].classList.contains('Green')).toBe(true);
  });
});
