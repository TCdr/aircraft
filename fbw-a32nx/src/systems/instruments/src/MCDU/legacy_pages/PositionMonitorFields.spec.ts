// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  irsModeText,
  NO_POSITION_TEXT,
  PositionMonitorReading,
  positionMonitorLines,
  positionUpdateAtLines,
} from './PositionMonitorFields';

const fm = { lat: 45.5, long: -73.75 };
/** 0.6 NM north of the FM position */
const ir2 = { lat: 45.51, long: -73.75 };

const reading: PositionMonitorReading = {
  fm1: fm,
  fm2: { lat: 45.5001, long: -73.75 },
  modeText: '3 IRS/GPS',
  gpirs: { lat: 45.5, long: -73.7501 },
  radio: null,
  mixIrs: fm,
  irPositions: [fm, ir2, null],
  irModes: ['NAV', 'NAV', 'ALIGN'],
  onSide: 1,
};

describe('MCDU POSITION MONITOR page', () => {
  it('shows FMGC 1 and 2 with their navigation mode, the GPIRS and the MIX IRS positions', () => {
    const lines = positionMonitorLines(reading);
    expect(lines[1][0]).toBe('{small}FMS1{end}');
    expect(lines[1][1]).toMatch(/^45°30.*N\/0?73°45.*W\[color\]green$/);
    expect(lines[2][0]).toContain('3 IRS/GPS');
    expect(lines[3][0]).toBe('{small}FMS2{end}');
    expect(lines[5][0]).toBe('{small}GPIRS{end}');
    expect(lines[7][0]).toBe('{small}MIX IRS{end}');
  });

  it('shows the radio position when there is no GPIRS position', () => {
    const lines = positionMonitorLines({ ...reading, gpirs: null, radio: fm, modeText: '3 IRS/DME/DME' });
    expect(lines[5][0]).toBe('{small}RADIO{end}');
    expect(lines[5][1]).toContain('green');
    expect(lines[2][0]).toContain('3 IRS/DME/DME');
    const noSensor = positionMonitorLines({ ...reading, gpirs: null, radio: null });
    expect(noSensor[5][1]).toBe(`${NO_POSITION_TEXT}[color]white`);
  });

  it('shows each IRS mode with its deviation from the onside FMGC position (cells: IRS1 left, IRS3 right, IRS2 centre)', () => {
    const lines = positionMonitorLines(reading);
    expect(lines[9][0]).toBe('{small}NAV 0.0{end}[color]green');
    expect(lines[9][1]).toBe('{small}ALIGN{end}[color]green');
    expect(lines[9][2]).toBe('{small}NAV 0.6{end}[color]green');
  });

  it('dashes the FM positions without an inertial position', () => {
    const lines = positionMonitorLines({ ...reading, fm1: null, fm2: null, modeText: '' });
    expect(lines[1][1]).toBe(`${NO_POSITION_TEXT}[color]white`);
    expect(lines[2][0]).toBe('');
    expect(lines[9][0]).toBe('{small}NAV{end}[color]green');
  });

  it('maps the IRS states to INVAL, ALIGN, NAV or ATT', () => {
    expect(irsModeText('NAV')).toBe('NAV');
    expect(irsModeText('ATT')).toBe('ATT');
    expect(irsModeText('ALIGN TTN 5')).toBe('ALIGN');
    expect(irsModeText('INVAL')).toBe('INVAL');
    expect(irsModeText('')).toBe('INVAL');
  });
});

describe('MCDU PROG page POSITION UPDATE AT', () => {
  it('is hidden in GPS PRIMARY', () => {
    expect(positionUpdateAtLines(true, null)).toEqual([[''], ['']]);
  });

  it('shows the entry field, then CONFIRM UPDATE AT with the position and the ident with an asterisk', () => {
    const [label, data] = positionUpdateAtLines(false, null);
    expect(label[0]).toContain('POSITION UPDATE AT');
    expect(data[0]).toContain('[color]cyan');
    const [confirmLabel, confirmData] = positionUpdateAtLines(false, {
      ident: 'TOU',
      location: { lat: 43.5, long: 1.5 },
    });
    expect(confirmLabel[0]).toContain('CONFIRM UPDATE AT');
    expect(confirmData[0]).toContain('43°30');
    expect(confirmData[1]).toBe('{amber}TOU*{end}');
  });
});
