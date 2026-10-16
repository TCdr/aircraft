// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { crewOxygenIndication, doorPageCabinVsClass, isCabinVsShown, isDoorNotLocked } from './DoorOxyIndications';

const page = () => readFileSync(resolve(__dirname, 'Door.tsx'), 'utf-8');

/* A320 FCOM DSC-52-20 DOOR/OXY SD page (a320_fcom.txt l.61436-61440) */
describe('SD DOOR/OXY doors', () => {
  it('is green only when the door is fully closed, amber as soon as it opens (not locked)', () => {
    expect(isDoorNotLocked(0)).toBe(false);
    expect(isDoorNotLocked(5)).toBe(true);
    expect(isDoorNotLocked(100)).toBe(true);
  });

  it('shows every door of the sim: cabin doors, emergency exits and both cargo doors', () => {
    const source = page();
    for (const point of [0, 1, 2, 3, 6, 7]) {
      expect(source).toContain(`'INTERACTIVE POINT OPEN:${point}'`);
    }
    expect(source).toContain('L:A32NX_FWD_DOOR_CARGO_LOCKED');
    expect(source).toContain('L:A32NX_AFT_DOOR_CARGO_LOCKED');
    expect(source).toContain('EMER EXIT');
  });
});

/* A320 FCOM DSC-35-20-20 crew oxygen pressure (a320_fcom.txt l.56814-56818) */
describe('SD DOOR/OXY crew oxygen pressure', () => {
  it('is green at 600 PSI and above', () => {
    expect(crewOxygenIndication(1850, false).valueClass).toBe('Value');
    expect(crewOxygenIndication(600, false).valueClass).toBe('Value');
  });

  it('pulses green below 600 PSI', () => {
    expect(crewOxygenIndication(550, false).valueClass).toBe('ValuePulse');
    expect(crewOxygenIndication(300, false).valueClass).toBe('ValuePulse');
  });

  it('is amber below 300 PSI', () => {
    expect(crewOxygenIndication(250, false).valueClass).toBe('ValueAmber');
  });

  it('is still green between 600 and 1000 PSI (the old page turned it amber below 1000 PSI)', () => {
    expect(crewOxygenIndication(950, true).valueClass).toBe('Value');
  });

  it('has an amber half frame on ground below 1000 PSI only', () => {
    expect(crewOxygenIndication(950, true).halfFrame).toBe(true);
    expect(crewOxygenIndication(1000, true).halfFrame).toBe(false);
    expect(crewOxygenIndication(950, false).halfFrame).toBe(false);
  });
});

/* A320 FCOM DSC-21-20-40 ECAM DOOR/OXY page cabin V/S (a320_fcom.txt l.9180-9186) */
describe('SD DOOR/OXY cabin V/S', () => {
  it('appears in flight phases 5, 6 and 7 only', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((phase) => isCabinVsShown(phase))).toEqual([5, 6, 7]);
  });

  it('is green, pulsing green when pulsing, amber beyond +-2000 ft/min', () => {
    expect(doorPageCabinVsClass(500, false)).toBe('Value');
    expect(doorPageCabinVsClass(1800, true)).toBe('ValuePulse');
    expect(doorPageCabinVsClass(2000, true)).toBe('ValuePulse');
    expect(doorPageCabinVsClass(2050, true)).toBe('ValueAmber');
    expect(doorPageCabinVsClass(-2050, false)).toBe('ValueAmber');
  });

  it('is drawn on the page with the CAB PRESS pulse rule', () => {
    const source = page();
    expect(source).toContain('L:A32NX_FWC_FLIGHT_PHASE');
    expect(source).toContain('cabinVsPulses(');
    expect(source).toContain('FT/MIN');
  });
});
