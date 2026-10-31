// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The harness has to come first: it creates the root element the instrument framework looks for when it loads
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import React from 'react';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { ApuPage } from './Apu';
import { apuBleedValveDisplay, isApuLowOilLevelShown, isApuPageAvailVisible } from './ApuIndications';

/* SD APU page: AVAIL, APU bleed valve and LOW OIL LEVEL */
describe('SD APU page', () => {
  it('shows AVAIL from APU N above 95 %, before the 99.5 % of the AVAIL light', () => {
    expect(isApuPageAvailVisible(true, 96)).toBe(true);
    expect(isApuPageAvailVisible(true, 100)).toBe(true);
  });

  it('shows no AVAIL at or below 95 % or without a valid APU N', () => {
    expect(isApuPageAvailVisible(true, 95)).toBe(false);
    expect(isApuPageAvailVisible(true, 60)).toBe(false);
    expect(isApuPageAvailVisible(false, 100)).toBe(false);
  });

  it('shows an amber XX valve when the ECB sends no valve status', () => {
    expect(apuBleedValveDisplay(false, false, false)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, false, true)).toBe('xx-amber');
    expect(apuBleedValveDisplay(false, true, true)).toBe('xx-amber');
  });

  it('shows the valve in line green when open, crossline green when closed', () => {
    expect(apuBleedValveDisplay(true, true, true)).toBe('inline-green');
    expect(apuBleedValveDisplay(true, false, false)).toBe('crossline-green');
  });

  it('shows the valve crossline amber when closed with the APU BLEED pb ON', () => {
    expect(apuBleedValveDisplay(true, false, true)).toBe('crossline-amber');
  });

  it('shows LOW OIL LEVEL when the ECB detects a low oil level', () => {
    expect(isApuLowOilLevelShown(true, true)).toBe(true);
    expect(isApuLowOilLevelShown(true, false)).toBe(false);
    // ECB off: no data, no advisory
    expect(isApuLowOilLevelShown(false, true)).toBe(false);
  });
});

describe('SD APU page LOW OIL LEVEL', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  it('is drawn pulsing from the ECB word', () => {
    page = renderSdPage(<ApuPage />, {
      'L:A32NX_APU_LOW_OIL_LEVEL': Arinc429Word.getRawWord(1, Arinc429SignStatusMatrix.NormalOperation),
    });

    const legend = visibleTexts(page, 'LOW OIL LEVEL');
    expect(legend).toHaveLength(1);
    expect(legend[0].classList.contains('FillPulse')).toBe(true);
  });

  it('is not drawn without the low oil level or with the ECB word invalid', () => {
    page = renderSdPage(<ApuPage />, {
      'L:A32NX_APU_LOW_OIL_LEVEL': Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NormalOperation),
    });
    expect(visibleTexts(page, 'LOW OIL LEVEL')).toHaveLength(0);
    page.unmount();

    page = renderSdPage(<ApuPage />, {
      'L:A32NX_APU_LOW_OIL_LEVEL': Arinc429Word.getRawWord(1, Arinc429SignStatusMatrix.NoComputedData),
    });
    expect(visibleTexts(page, 'LOW OIL LEVEL')).toHaveLength(0);
  });
});
