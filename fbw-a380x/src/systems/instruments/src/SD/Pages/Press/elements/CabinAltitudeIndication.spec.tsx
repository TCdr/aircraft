// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import CabAlt from './CabAlt';
import { cabinAltitudeNeedleClass } from './CabinAltitudeIndication';

/* The cabin altitude is abnormal (red) above 9 550 ft. */
describe('SD PRESS CAB ALT needle', () => {
  it('is normal at 50 ft and at 8 000 ft', () => {
    expect(cabinAltitudeNeedleClass(50)).toBe('GaugeIndicator');
    expect(cabinAltitudeNeedleClass(8000)).toBe('GaugeIndicator');
  });

  it('is red at 9 600 ft, as the digital value', () => {
    expect(cabinAltitudeNeedleClass(9600)).toBe('RedGaugeIndicator');
  });

  it('the needle is drawn with the rule, not the A320 delta P limits', () => {
    const needleClass = (cabinAltitudeFt: number) =>
      withRenderedSdElement(
        <CabAlt x={0} y={0} system={1} />,
        { 'L:A32NX_PRESS_MAN_CABIN_ALTITUDE': cabinAltitudeFt },
        (container) =>
          Array.from(container.querySelectorAll('[class*="GaugeIndicator"]'))
            .map((element) => element.getAttribute('class'))
            .join(' '),
      );
    expect(needleClass(8000)).toContain('GaugeIndicator SW4');
    expect(needleClass(8000)).not.toContain('RedGaugeIndicator');
    // 8 600 ft is above the A320 needle limit of 8.5 (thousand ft), still normal here
    expect(needleClass(8600)).not.toContain('RedGaugeIndicator');
    expect(needleClass(9600)).toContain('RedGaugeIndicator SW4');
  });
});
