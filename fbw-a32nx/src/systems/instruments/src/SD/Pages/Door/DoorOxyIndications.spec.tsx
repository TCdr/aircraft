// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { SensedDoor, doorProximitySensorFaultVar } from '@shared/DoorProximitySensors';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, SimVarValues, visibleTexts } from '../../Common/SdPageSpecHarness';
import { DoorPage } from './Door';
import {
  crewOxygenCircuitIndication,
  crewOxygenIndication,
  doorPageCabinVsClass,
  isCabinVsShown,
  isDoorNotLocked,
} from './DoorOxyIndications';

/** All doors closed and locked, the crew oxygen bottle full: nothing to show except the bottle pressure */
const QUIET_PAGE: SimVarValues = {
  'L:A32NX_FWD_DOOR_CARGO_LOCKED': 1,
  'L:A32NX_AFT_DOOR_CARGO_LOCKED': 1,
  'L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE': 1850,
};

let page: RenderedSdPage;
afterEach(() => page?.unmount());

/** The legends of the doors that are not locked, in the order of the page */
const doorLegends = () =>
  Array.from(page.container.querySelectorAll('text.Warning')).map((legend) => legend.textContent);

/* Doors of the DOOR/OXY page */
describe('SD DOOR/OXY doors', () => {
  it('is green only when the door is fully closed, amber as soon as it opens (not locked)', () => {
    expect(isDoorNotLocked(0)).toBe(false);
    expect(isDoorNotLocked(5)).toBe(true);
    expect(isDoorNotLocked(100)).toBe(true);
  });

  // the simvar of each door and the value that means open: the sim door position in percent, the cargo lock at 0
  const openDoors: [string, number, string, string][] = [
    ['INTERACTIVE POINT OPEN:0', 50, 'left forward cabin door', 'CABIN'],
    ['INTERACTIVE POINT OPEN:1', 50, 'right forward cabin door', 'CABIN'],
    ['INTERACTIVE POINT OPEN:2', 50, 'left aft cabin door', 'CABIN'],
    ['INTERACTIVE POINT OPEN:3', 50, 'right aft cabin door', 'CABIN'],
    ['INTERACTIVE POINT OPEN:6', 50, 'left emergency exits', 'EMER EXIT'],
    ['INTERACTIVE POINT OPEN:7', 50, 'right emergency exits', 'EMER EXIT'],
    ['L:A32NX_FWD_DOOR_CARGO_LOCKED', 0, 'forward cargo door (unlocked)', 'CARGO'],
    ['L:A32NX_AFT_DOOR_CARGO_LOCKED', 0, 'aft cargo door (unlocked)', 'CARGO'],
  ];

  it('shows no amber legend with every door closed and locked', () => {
    page = renderSdPage(<DoorPage />, QUIET_PAGE);

    expect(doorLegends()).toEqual([]);
  });

  it.each(openDoors)('shows an amber legend when %s is %d: the %s', (variable, openValue, _door, legend) => {
    page = renderSdPage(<DoorPage />, { ...QUIET_PAGE, [variable]: openValue });

    expect(doorLegends()).toEqual([legend]);
  });

  // A door its proximity sensors do not detect closed is not closed, the same rule as the DOOR cautions
  it('is amber when its proximity sensor is failed, the door closed (flyPad ATA 52 failure)', () => {
    expect(isDoorNotLocked(0, true)).toBe(true);
    expect(isDoorNotLocked(0, false)).toBe(false);
  });

  const sensedDoors: [SensedDoor, string][] = [
    ['L_FWD_CABIN', 'CABIN'],
    ['R_FWD_CABIN', 'CABIN'],
    ['L_AFT_CABIN', 'CABIN'],
    ['R_AFT_CABIN', 'CABIN'],
    ['L_EMER_EXIT', 'EMER EXIT'],
    ['R_EMER_EXIT', 'EMER EXIT'],
    ['FWD_CARGO', 'CARGO'],
    ['AFT_CARGO', 'CARGO'],
  ];

  it.each(sensedDoors)('shows the closed %s door amber with its proximity sensor failed', (door, legend) => {
    page = renderSdPage(<DoorPage />, { ...QUIET_PAGE, [doorProximitySensorFaultVar(door)]: 1 });

    expect(doorLegends()).toEqual([legend]);
  });
});

/* Crew oxygen pressure */
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

  it('is still green between 600 and 1000 PSI (not amber below 1000 PSI)', () => {
    expect(crewOxygenIndication(950, true).valueClass).toBe('Value');
  });

  it('has an amber half frame on ground below 1000 PSI only', () => {
    expect(crewOxygenIndication(950, true).halfFrame).toBe(true);
    expect(crewOxygenIndication(1000, true).halfFrame).toBe(false);
    expect(crewOxygenIndication(950, false).halfFrame).toBe(false);
  });
});

/* Cabin V/S of the DOOR/OXY page */
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

  it('is drawn on the page in flight phase 6 and pulses from the CAB PRESS rule', () => {
    page = renderSdPage(<DoorPage />, {
      ...QUIET_PAGE,
      'L:A32NX_FWC_FLIGHT_PHASE': 6,
      'L:A32NX_PRESS_MAN_CABIN_VS': 1800,
    });

    expect(visibleTexts(page, 'FT/MIN')).toHaveLength(1);
    const value = page.container.querySelector('#cabin-vs-value');
    expect(value?.textContent).toBe('1800');
    expect(value?.classList.contains('ValuePulse')).toBe(true);
  });

  it('is not drawn in flight phase 2', () => {
    page = renderSdPage(<DoorPage />, {
      ...QUIET_PAGE,
      'L:A32NX_FWC_FLIGHT_PHASE': 2,
      'L:A32NX_PRESS_MAN_CABIN_VS': 1800,
    });

    expect(page.container.querySelector('#cabin-vs')).toBeNull();
  });
});

/* REGUL LO PR and CKPT OXY */
describe('SD DOOR/OXY REGUL LO PR and CKPT OXY', () => {
  it('shows no REGUL LO PR and a white CKPT OXY with the CREW SUPPLY ON and a normal bottle', () => {
    expect(crewOxygenCircuitIndication(1850, false)).toEqual({ regulatorLowPressure: false, ckptOxyAmber: false });
  });

  it('shows REGUL LO PR and an amber CKPT OXY with the CREW SUPPLY pb-sw OFF (no low-pressure circuit pressure)', () => {
    expect(crewOxygenCircuitIndication(1850, true)).toEqual({ regulatorLowPressure: true, ckptOxyAmber: true });
  });

  it('turns CKPT OXY amber below 300 PSI with the CREW SUPPLY ON, REGUL LO PR staying off', () => {
    expect(crewOxygenCircuitIndication(250, false)).toEqual({ regulatorLowPressure: false, ckptOxyAmber: true });
    expect(crewOxygenCircuitIndication(300, false).ckptOxyAmber).toBe(false);
  });

  it('shows REGUL LO PR when the bottle is below the 50 PSI of the low-pressure circuit', () => {
    expect(crewOxygenCircuitIndication(0, false)).toEqual({ regulatorLowPressure: true, ckptOxyAmber: true });
    expect(crewOxygenCircuitIndication(50, false).regulatorLowPressure).toBe(false);
  });

  it('draws no REGUL LO PR and a white CKPT OXY on the page with a full bottle', () => {
    page = renderSdPage(<DoorPage />, QUIET_PAGE);

    expect(page.container.querySelector('#regul_lo_pr')).toBeNull();
    expect(page.container.querySelector('#oxy')?.classList.contains('OxyWarn')).toBe(false);
  });

  it('draws REGUL LO PR and an amber CKPT OXY with the CREW SUPPLY pb-sw OFF', () => {
    page = renderSdPage(<DoorPage />, { ...QUIET_PAGE, 'L:PUSH_OVHD_OXYGEN_CREW': 1 });

    expect(page.container.querySelector('#regul_lo_pr')?.textContent).toBe('REGUL LO PR');
    expect(page.container.querySelector('#oxy')?.classList.contains('OxyWarn')).toBe(true);
  });

  it('colours CKPT OXY amber below 300 PSI without REGUL LO PR', () => {
    page = renderSdPage(<DoorPage />, { ...QUIET_PAGE, 'L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE': 250 });

    expect(page.container.querySelector('#regul_lo_pr')).toBeNull();
    expect(page.container.querySelector('#oxy')?.classList.contains('OxyWarn')).toBe(true);
  });
});
