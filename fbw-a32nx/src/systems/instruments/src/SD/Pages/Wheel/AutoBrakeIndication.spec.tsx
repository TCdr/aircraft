// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import { autoBrakeIndicationClass } from './AutoBrakeIndication';
import { WheelPage } from './Wheel';

/* AUTO BRK: green when armed, amber only on a system failure. */
describe('SD WHEEL AUTO BRK legend', () => {
  it('is green when armed without a failure', () => {
    expect(autoBrakeIndicationClass(false)).toBe('Green');
  });

  it('is amber on an auto brake failure', () => {
    expect(autoBrakeIndicationClass(true)).toBe('Amber');
  });
});

describe('SD WHEEL page AUTO BRK legend', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  const autoBrakeLegend = () => visibleTexts(page, 'AUTO BRK')[0];

  it('does not turn amber because an engine is off (single-engine taxi)', () => {
    page = renderSdPage(<WheelPage />, {
      'L:A32NX_AUTOBRAKES_ARMED_MODE': 2,
      'ENG COMBUSTION:1': 0,
      'ENG COMBUSTION:2': 1,
    });

    expect(autoBrakeLegend().classList.contains('Green')).toBe(true);
    expect(autoBrakeLegend().classList.contains('Amber')).toBe(false);
  });

  it('turns amber from the BSCU autobrake fault with the autobrake armed', () => {
    page = renderSdPage(<WheelPage />, { 'L:A32NX_AUTOBRAKES_ARMED_MODE': 2, 'L:A32NX_BRAKES_AUTO_BRK_FAULT': 1 });

    expect(autoBrakeLegend().classList.contains('Amber')).toBe(true);
  });

  it('keeps the amber legend once the failed autobrake has disarmed', () => {
    page = renderSdPage(<WheelPage />, { 'L:A32NX_AUTOBRAKES_ARMED_MODE': 0, 'L:A32NX_BRAKES_AUTO_BRK_FAULT': 1 });

    expect(autoBrakeLegend().classList.contains('Amber')).toBe(true);
  });

  it('shows no legend when disarmed without a fault', () => {
    page = renderSdPage(<WheelPage />, { 'L:A32NX_AUTOBRAKES_ARMED_MODE': 0 });

    expect(visibleTexts(page, 'AUTO BRK')).toHaveLength(0);
  });
});
