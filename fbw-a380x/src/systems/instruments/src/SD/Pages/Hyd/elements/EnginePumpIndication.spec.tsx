// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import { Engine } from './Engine';
import { enginePumpIndication, EnginePumpLine } from './EnginePumpIndication';

describe('SD HYD engine pump symbol', () => {
  it('on, pressure normal: green with the vertical line', () => {
    expect(enginePumpIndication(true, true, false)).toEqual({
      colour: 'Green',
      line: EnginePumpLine.Vertical,
      lowPressure: false,
    });
  });

  it('depressurized (pb-sw OFF, no pressure): amber horizontal line', () => {
    expect(enginePumpIndication(false, false, false)).toEqual({
      colour: 'Amber',
      line: EnginePumpLine.Horizontal,
      lowPressure: false,
    });
  });

  it('abnormally pressurized (pb-sw OFF, pressure): amber with the vertical line', () => {
    expect(enginePumpIndication(true, false, false)).toEqual({
      colour: 'Amber',
      line: EnginePumpLine.Vertical,
      lowPressure: false,
    });
  });

  it('on, pressure below normal: amber LO', () => {
    expect(enginePumpIndication(false, true, false)).toEqual({
      colour: 'Amber',
      line: EnginePumpLine.None,
      lowPressure: true,
    });
  });

  it('disconnected: amber horizontal line, whatever the pressure and the pb-sw', () => {
    expect(enginePumpIndication(true, true, true).line).toBe(EnginePumpLine.Horizontal);
    expect(enginePumpIndication(true, false, true).line).toBe(EnginePumpLine.Horizontal);
  });

  it('the HYD page draws the pumps from this rule', () => {
    /** @returns the colour and the lines of the pump A symbol of engine 1 */
    const pumpASymbol = (pressureSwitch: number, pbAuto: number, disconnected: number) =>
      withRenderedSdElement(
        <Engine x={0} y={0} engineNumber={1} />,
        {
          'L:A32NX_HYD_GREEN_PUMP_1_SECTION_PRESSURE_SWITCH': pressureSwitch,
          'L:A32NX_OVHD_HYD_ENG_1A_PUMP_PB_IS_AUTO': pbAuto,
          'L:A32NX_HYD_ENG_1AB_PUMP_DISC': disconnected,
        },
        (container) => {
          const pump = container.querySelector('g[transform="translate(28 67)"]');
          return {
            colour: pump?.querySelector('rect')?.getAttribute('class')?.split(' ')[0],
            lines: Array.from(pump?.querySelectorAll('line') ?? []).map((line) =>
              line.getAttribute('x1') === line.getAttribute('x2') ? 'vertical' : 'horizontal',
            ),
            lowPressure: Array.from(pump?.querySelectorAll('text') ?? []).some((text) => text.textContent === 'LO'),
          };
        },
      );

    expect(pumpASymbol(1, 1, 0)).toEqual({ colour: 'Green', lines: ['vertical'], lowPressure: false });
    expect(pumpASymbol(0, 0, 0)).toEqual({ colour: 'Amber', lines: ['horizontal'], lowPressure: false });
    expect(pumpASymbol(1, 0, 0)).toEqual({ colour: 'Amber', lines: ['vertical'], lowPressure: false });
    expect(pumpASymbol(0, 1, 0)).toEqual({ colour: 'Amber', lines: [], lowPressure: true });
    expect(pumpASymbol(1, 1, 1).lines).toEqual(['horizontal']);
  });
});
