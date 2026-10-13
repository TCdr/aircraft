// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CabinPressureAlerts,
  LDG_ELEV_FAULT_KEY,
  LDG_ELEV_FAULT_PHASE_INHIBITION,
  LandingElevationFaultInputs,
  RAM_AIR_ON_MEMO_CODE,
  cpc1And2FaultStatus,
  cpcFaultStatus,
  excessCabinAltitudeStatus,
  isLandingElevationFault,
  isRamAirOnMemoShown,
  safetyValveOpenStatus,
} from './AirConditioningAlerts';
import { ewdLines, ewdTexts, pseudoFwcItem, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

/* A320 FCOM DSC-21-10-50 l.8642: "RAM AIR ON : This memo appears in green, if the RAM AIR pb-sw is ON." */
describe('RAM AIR ON memo', () => {
  it('is shown with the RAM AIR pb-sw ON only', () => {
    expect(isRamAirOnMemoShown(true)).toBe(true);
    expect(isRamAirOnMemoShown(false)).toBe(false);
  });

  it('is a green memo', () => {
    expect(ewdTexts([RAM_AIR_ON_MEMO_CODE])).toEqual(['\x1b<3mRAM AIR ON']);
  });

  it('is in the PseudoFWC memos, on the RAM AIR pb-sw', () => {
    const memo = pseudoFwcItem('0000240');
    expect(memo).toContain('isRamAirOnMemoShown');
    expect(memo).toContain(`'${RAM_AIR_ON_MEMO_CODE}'`);
  });
});

/* FCOM PRO-ABN-CAB_PR l.73186-73187: "This alert triggers when the LDG ELEV selector is set to AUTO and the landing field
   elevation of the FMGS is not available." */
describe('CAB PR LDG ELEV FAULT', () => {
  const inputs: LandingElevationFaultInputs = {
    ldgElevSelectorAuto: true,
    cpcOperative: true,
    fmLandingElevationAvailable: false,
  };

  it('triggers with the selector at AUTO and no FMGS landing elevation', () => {
    expect(isLandingElevationFault(inputs)).toBe(true);
  });

  it('does not trigger with an FMGS landing elevation or a manual landing elevation', () => {
    expect(isLandingElevationFault({ ...inputs, fmLandingElevationAvailable: true })).toBe(false);
    expect(isLandingElevationFault({ ...inputs, ldgElevSelectorAuto: false })).toBe(false);
  });

  it('gives way to CAB PR SYS 1+2 FAULT', () => {
    expect(isLandingElevationFault({ ...inputs, cpcOperative: false })).toBe(false);
  });

  it('shows LDG ELEV ADJUST, is a caution on the PRESS page, shown in phases 1, 2 and 6 only (FCOM PDF p.4475)', () => {
    const alerts = new CabinPressureAlerts();
    alerts.update(inputs);
    const item = alerts.ewdFailures[LDG_ELEV_FAULT_KEY];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['CAB PR LDG ELEV FAULT', ' -LDG ELEV........ADJUST']);
    expect(item.failure).toBe(2);
    expect(LDG_ELEV_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8, 9, 10]);
  });

  it('is in the PseudoFWC alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.cabinPressureAlerts.ewdFailures');
    expect(fwc).toContain('this.cabinPressureAlerts.update(');
  });
});

/* FCOM PRO-ABN-CAB_PR STATUS: EXCESS CAB ALT l.73131-73132, SAFETY VALVE OPEN l.73330-73346, SYS 1(2) FAULT
   l.73379-73383, SYS 1+2 FAULT l.73443-73459. */
describe('CAB PR STATUS', () => {
  it('EXCESS CAB ALT: MAX FL 100/MEA-MORA', () => {
    expect(statusLines(excessCabinAltitudeStatus()).left).toEqual(['MAX FL.....100/MEA-MORA']);
  });

  it('SYS 1(2) FAULT: INOP SYS CAB PR 1(2)', () => {
    expect(statusLines(cpcFaultStatus(1)).right).toEqual(['INOP SYS', 'CAB PR 1']);
    expect(statusLines(cpcFaultStatus(2)).right).toEqual(['INOP SYS', 'CAB PR 2']);
  });

  const schedule = [
    'MAN CAB PR CTL',
    'TGT V/S: CLIMB 500 FT/MN',
    'TGT V/S: DESC 300 FT/MN',
    'A/C FL     CAB ALT TGT',
    ' 390           8000',
    ' 350           7000',
    ' 300           5500',
    ' 250           3000',
    '<200              0',
    'DURING FINAL APPR:',
  ];

  it('SYS 1+2 FAULT: MAN CAB PR CTL, the target V/S and cabin altitudes, V/S CTL FULL UP; INOP SYS CAB PR 1+2', () => {
    const page = statusLines(cpc1And2FaultStatus());
    expect(page.left).toEqual([...schedule, 'V/S CTL.........FULL UP']);
    expect(page.right).toEqual(['INOP SYS', 'CAB PR 1+2']);
  });

  it('SAFETY VALVE OPEN: the same with MAN V/S CTL FULL UP, no INOP SYS', () => {
    const page = statusLines(safetyValveOpenStatus());
    expect(page.left).toEqual([...schedule, 'MAN V/S CTL.....FULL UP']);
    expect(page.right).toEqual([]);
  });

  it('MAN CAB PR CTL is an amber underlined title (2019 FCOM PDF page 2105), the targets blue', () => {
    const status = cpc1And2FaultStatus();
    const left = formatStatusPage(status.left, status.inopSys).left.split('\r');
    expect(left[0]).toBe('\x1b<4m\x1b4mMAN CAB PR CTL\x1bm');
    expect(left[1]).toBe('\x1b<5mTGT V/S: CLIMB 500 FT/MN');
  });

  it.each([
    ['2131221', 'excessCabinAltitudeStatus()'],
    ['2131222', 'cpcFaultStatus(1)'],
    ['2131223', 'cpcFaultStatus(2)'],
    ['2131224', 'cpc1And2FaultStatus()'],
    ['2131233', 'safetyValveOpenStatus()'],
  ])('PseudoFWC gives %s its STATUS', (key, status) => {
    expect(pseudoFwcItem(key)).toContain(`...alertStatus(() => ${status})`);
  });
});
