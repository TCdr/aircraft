// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import BleedApu from './BleedApu';
import { isApuBleedValveAbnormal } from './BleedApuIndication';

describe('SD BLEED APU bleed valve', () => {
  it('green when the valve agrees with its command', () => {
    // APU AVAIL, APU BLEED ON: open
    expect(isApuBleedValveAbnormal(true, true, true)).toBe(false);
    // APU not AVAIL yet: closed
    expect(isApuBleedValveAbnormal(false, true, false)).toBe(false);
  });

  it('amber "abnormally open, and the APU BLEED pb-sw is ON"', () => {
    expect(isApuBleedValveAbnormal(true, true, false)).toBe(true);
  });

  it('amber "abnormally closed, and the APU BLEED pb-sw is ON"', () => {
    expect(isApuBleedValveAbnormal(false, true, true)).toBe(true);
  });

  it('never amber with the APU BLEED pb-sw OFF', () => {
    expect(isApuBleedValveAbnormal(false, false, true)).toBe(false);
    expect(isApuBleedValveAbnormal(true, false, false)).toBe(false);
  });

  it('the APU bleed valve symbol is drawn amber when abnormal and green otherwise', () => {
    const apuBleedValveCircleClass = (valveOpen: number, apuAvailable: number) =>
      withRenderedSdElement(
        <BleedApu />,
        {
          'L:A32NX_APU_BLEED_AIR_VALVE_OPEN': valveOpen,
          'L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON': 1,
          'L:A32NX_OVHD_APU_BLEED_PB_IS_ON': 1,
          'L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE': apuAvailable,
        },
        (container) => {
          // the first circle is the APU isolation valve (always green), the second the APU bleed valve
          const circles = container.querySelectorAll('circle');
          expect(circles).toHaveLength(2);
          return circles[1].getAttribute('class');
        },
      );

    expect(apuBleedValveCircleClass(1, 1)).toBe('Green SW2 NoFill');
    expect(apuBleedValveCircleClass(0, 1)).toBe('Amber SW2 NoFill');
    expect(apuBleedValveCircleClass(1, 0)).toBe('Amber SW2 NoFill');
  });
});
