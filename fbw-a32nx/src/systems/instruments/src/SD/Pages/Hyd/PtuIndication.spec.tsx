// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage } from '../../Common/SdPageSpecHarness';
import { HydPage } from './Hyd';
import { ptuSymbolColor } from './PtuIndication';

/* HYD page PTU symbol: amber with the PTU pb-sw OFF. */
describe('SD HYD PTU symbol colour', () => {
  it('is green with the PTU pb-sw at AUTO, also when the PTU is inhibited', () => {
    expect(ptuSymbolColor(true)).toBe('Green');
  });

  it('is amber with the PTU pb-sw OFF', () => {
    expect(ptuSymbolColor(false)).toBe('Amber');
  });
});

describe('SD HYD page PTU symbol', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  const ptuLineClasses = () =>
    ['ptu2', 'ptu3', 'ptu4'].map((id) => page.container.querySelector(`#${id}`)?.getAttribute('class'));

  it('is amber with the PTU pb-sw OFF, whatever the PTU control valve does', () => {
    page = renderSdPage(<HydPage />, { 'L:A32NX_OVHD_HYD_PTU_PB_IS_AUTO': 0, 'L:A32NX_HYD_PTU_VALVE_OPENED': 1 });

    expect(ptuLineClasses()).toEqual(['AmberLine', 'AmberLine', 'AmberLine']);
  });

  it('stays green with the PTU pb-sw at AUTO and the PTU control valve closed (inhibited)', () => {
    page = renderSdPage(<HydPage />, { 'L:A32NX_OVHD_HYD_PTU_PB_IS_AUTO': 1, 'L:A32NX_HYD_PTU_VALVE_OPENED': 0 });

    expect(ptuLineClasses()).toEqual(['GreenLine', 'GreenLine', 'GreenLine']);
  });
});
