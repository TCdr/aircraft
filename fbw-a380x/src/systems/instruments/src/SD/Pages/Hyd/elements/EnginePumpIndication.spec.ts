// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { enginePumpIndication, EnginePumpLine } from './EnginePumpIndication';

/* A380 FCOM DSC-29-20 ENGINE PUMPS (a380_fcom.txt l.61470-61492) */
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

  it('abnormally pressurized (pb-sw OFF, pressure): amber with the vertical line (l.61475)', () => {
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
    const element = readFileSync(resolve(__dirname, 'Engine.tsx'), 'utf8');
    expect(element).toContain('enginePumpIndication(!lowPressure, pbAuto, disconnected)');
  });
});
