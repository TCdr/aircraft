// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { engineLpValveIndication } from './EngineLpValveIndication';

describe('SD FUEL engine LP valve indication (FCOM DSC-28-20)', () => {
  it('is inline green when the valve is open as commanded', () => {
    expect(engineLpValveIndication(100, true)).toEqual({ inline: true, amber: false });
  });

  it('is inline amber when the valve is open although commanded closed', () => {
    expect(engineLpValveIndication(100, false)).toEqual({ inline: true, amber: true });
    expect(engineLpValveIndication(60, false)).toEqual({ inline: true, amber: true });
  });

  it('is crossline amber when the valve is closed, normally or abnormally', () => {
    expect(engineLpValveIndication(0, false)).toEqual({ inline: false, amber: true });
    expect(engineLpValveIndication(0, true)).toEqual({ inline: false, amber: true });
  });

  it('shows the valve open from half travel', () => {
    expect(engineLpValveIndication(49, true).inline).toBe(false);
    expect(engineLpValveIndication(50, true).inline).toBe(true);
  });
});
