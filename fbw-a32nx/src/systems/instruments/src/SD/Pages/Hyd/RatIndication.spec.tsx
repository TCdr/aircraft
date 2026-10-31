// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import { HydPage } from './Hyd';
import { ratIndication } from './RatIndication';

/* RAT of the HYD page */
describe('SD HYD RAT', () => {
  it('is white and stowed when the strut is in', () => {
    expect(ratIndication(0, false)).toEqual({ notStowed: false, legendAmber: false });
  });

  it('is green when the RAT is not stowed', () => {
    expect(ratIndication(1, false)).toEqual({ notStowed: true, legendAmber: false });
  });

  it('turns its legend amber while the stowing pressure is applied', () => {
    expect(ratIndication(0.5, true)).toEqual({ notStowed: true, legendAmber: true });
  });
});

describe('SD HYD page RAT', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  const ratLegend = () => visibleTexts(page, 'RAT')[0];
  const ratLine = () => ratLegend().nextElementSibling;

  it('is drawn white with no green line while stowed', () => {
    page = renderSdPage(<HydPage />, { 'L:A32NX_RAT_STOW_POSITION': 0 });

    expect(ratLegend().classList.contains('Amber')).toBe(false);
    expect(ratLine()?.classList.contains('Hide')).toBe(true);
  });

  it('shows the green line when the strut is out', () => {
    page = renderSdPage(<HydPage />, { 'L:A32NX_RAT_STOW_POSITION': 1 });

    expect(ratLegend().classList.contains('Amber')).toBe(false);
    expect(ratLine()?.classList.contains('Hide')).toBe(false);
  });

  it('turns the legend amber from the stowing signal', () => {
    page = renderSdPage(<HydPage />, { 'L:A32NX_RAT_STOW_POSITION': 0.5, 'L:A32NX_RAT_STOWING': 1 });

    expect(ratLegend().classList.contains('Amber')).toBe(true);
    expect(ratLine()?.classList.contains('Hide')).toBe(false);
  });
});
