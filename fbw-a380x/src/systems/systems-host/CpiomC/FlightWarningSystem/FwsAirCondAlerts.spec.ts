// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  BULK_CARGO_DUCT_OVHT_PHASE_INHIBITION,
  CAB_PRESS_INHIBITED_BY_DOORS_PHASE_INHIBITION,
  CAB_PRESS_MAN_CTL_FAULT_PHASE_INHIBITION,
  CABIN_AIR_EXTRACT_VLV_FAULT_PHASE_INHIBITION,
  COND_MONITORING_PHASE_INHIBITION,
  isCabinSelectorInPursSel,
  isCabPressManCtlFault,
  isCabPressSensorsFault,
  isPackRegulDegraded,
  isPackRegulRedundancyLost,
  mixerPressRegulItemsToShow,
  packBayVentFaults,
  PACK_OVHT_PHASE_INHIBITION,
  PACK_REGUL_FAULT_PHASE_INHIBITION,
  PACK_VLV_FAULT_PHASE_INHIBITION,
  PackMonitoringFlags,
  packRegulFaultInfo,
  packRegulFaultItems,
  packValveFaults,
  readPackMonitoringFlags,
} from './FwsAirCondAlerts';

/** A discrete word with the given bits set */
function word(...bits: number[]) {
  return { bitValueOr: (bit: number, _defaultValue: boolean) => bits.includes(bit) };
}

function noFlags(): PackMonitoringFlags {
  return {
    valveFailedOpen: [false, false, false, false],
    valveFailedClosed: [false, false, false, false],
    overheat: [false, false],
    bypassMode: [false, false],
  };
}

/** The phases where an alert is active, from its inhibited phases */
function activePhases(inhibited: number[]): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((phase) => !inhibited.includes(phase));
}

describe('A380X FWS AIR PACK monitoring words', () => {
  it('reads the pack 1 valves and pack from the pack 1 word, the pack 2 ones from the pack 2 word', () => {
    // Pack 1 word: valve 1 failed open (15), pack 1 overheat (23); pack 2 word: valve 4 failed closed (22), bypass (26)
    const flags = readPackMonitoringFlags(word(15, 23, 22, 26), word(22, 26, 15, 23));

    expect(flags.valveFailedOpen).toEqual([true, false, false, false]);
    expect(flags.valveFailedClosed).toEqual([false, false, false, true]);
    expect(flags.overheat).toEqual([true, false]);
    expect(flags.bypassMode).toEqual([false, true]);
  });

  it('reads no fault from words without data', () => {
    expect(readPackMonitoringFlags(word(), word())).toEqual(noFlags());
  });
});

describe('A380X FWS AIR PACK 1(2) VLV 1(2) FAULT', () => {
  it('is true for one valve failed open', () => {
    const flags = noFlags();
    flags.valveFailedOpen[1] = true;
    expect(packValveFaults(flags, [false, false])).toEqual([false, true, false, false]);
  });

  it('is false for one valve failed closed alone (the other valve of the pack still flows)', () => {
    const flags = noFlags();
    flags.valveFailedClosed[0] = true;
    expect(packValveFaults(flags, [false, false])).toEqual([false, false, false, false]);
  });

  it('is true for a valve failed closed with a valve of the other pack failed closed', () => {
    const flags = noFlags();
    flags.valveFailedClosed[0] = true;
    flags.valveFailedClosed[3] = true;
    expect(packValveFaults(flags, [false, false])).toEqual([true, false, false, true]);
  });

  it('is true for a valve failed closed with the other pack failed', () => {
    const flags = noFlags();
    flags.valveFailedClosed[2] = true;
    expect(packValveFaults(flags, [true, false])).toEqual([false, false, true, false]);
    // The own pack failed does not count
    expect(packValveFaults(flags, [false, true])).toEqual([false, false, false, false]);
  });

  it('is active in flight phases 1, 2, 8 and 12', () => {
    expect(activePhases(PACK_VLV_FAULT_PHASE_INHIBITION)).toEqual([1, 2, 8, 12]);
  });
});

describe('A380X FWS AIR PACK 1(2) OVHT and REGUL FAULT', () => {
  it('are active in flight phases 1, 2, 8, 11 and 12', () => {
    expect(activePhases(PACK_OVHT_PHASE_INHIBITION)).toEqual([1, 2, 8, 11, 12]);
    expect(activePhases(PACK_REGUL_FAULT_PHASE_INHIBITION)).toEqual([1, 2, 8, 11, 12]);
  });

  it('REGUL FAULT: IN BYPASS MODE and AVAIL ABOVE FL 290, PACK OFF only below FL 290 (AUTO RCL)', () => {
    expect(packRegulFaultItems(350, true)).toEqual({
      show: [true, true, false, false, false],
      checked: [false, false, false, false, false],
    });
    expect(packRegulFaultItems(280, true).show).toEqual([true, true, false, false, true]);
    expect(packRegulFaultItems(280, false).checked).toEqual([false, false, false, false, true]);
  });

  it('REGUL FAULT: STATUS INFO AVAIL ABOVE FL 290 and REGUL DEGRADED of the right pack', () => {
    const infos = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
      'utf-8',
    );
    expect(packRegulFaultInfo(1).map((id) => infos.match(new RegExp(`${id}: '\\\\x1b<3m(.*)'`))?.[1])).toEqual([
      'PACK 1 AVAIL ABOVE FL 290',
      'PACK 1 REGUL DEGRADED',
    ]);
    expect(packRegulFaultInfo(2).map((id) => infos.match(new RegExp(`${id}: '\\\\x1b<3m(.*)'`))?.[1])).toEqual([
      'PACK 2 AVAIL ABOVE FL 290',
      'PACK 2 REGUL DEGRADED',
    ]);
  });
});

/* The wiring is read from the source text, as ApuFaultAlerts.spec.ts does (EcamMessages import cycle). */
describe('A380X FWS COND TEMP CTL FAULT', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
  const infos = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
    'utf-8',
  );

  it('STATUS INFO ENG IDLE HI only when both pack controllers are failed', () => {
    const tempCtlFault = abnormalSensed.slice(abnormalSensed.indexOf('211800041: {'));
    const entry = tempCtlFault.slice(0, tempCtlFault.indexOf('},'));
    expect(entry).toContain("info: () => [this.fws.pack1And2CtlFault.get() ? '210200008' : null, '210200003'],");
    expect(infos).toContain("210200008: '\\x1b<3mENG IDLE HI',");
  });

  it('both pack controllers are failed when the two channels of FDAC 1 and of FDAC 2 are failed', () => {
    const update = fwsCore.slice(fwsCore.indexOf('this.pack1And2CtlFault.set('));
    expect(update.slice(0, update.indexOf(');'))).toMatch(
      /fdac1Channel1Failure\.get\(\) &&\s+this\.fdac1Channel2Failure\.get\(\) &&\s+this\.fdac2Channel1Failure\.get\(\) &&\s+this\.fdac2Channel2Failure\.get\(\)/,
    );
  });
});

describe('A380X FWS COND and CAB PRESS alerts of the cargo heater, extract valve and manual mode', () => {
  it('COND BULK CARGO DUCT OVHT is active in flight phases 1, 2, 8, 11 and 12', () => {
    expect(activePhases(BULK_CARGO_DUCT_OVHT_PHASE_INHIBITION)).toEqual([1, 2, 8, 11, 12]);
  });

  it('COND CABIN AIR EXTRACT VLV FAULT is active in flight phases 10, 11 and 12', () => {
    expect(activePhases(CABIN_AIR_EXTRACT_VLV_FAULT_PHASE_INHIBITION)).toEqual([10, 11, 12]);
  });

  it('CAB PRESS MAN CTL FAULT is active in flight phases 6, 7, 10, 11 and 12', () => {
    expect(activePhases(CAB_PRESS_MAN_CTL_FAULT_PHASE_INHIBITION)).toEqual([6, 7, 10, 11, 12]);
  });

  it('CAB PRESS MAN CTL FAULT: an operating outflow valve controller reports its manual control failed', () => {
    expect(isCabPressManCtlFault([false, false, false, false])).toBe(false);
    expect(isCabPressManCtlFault([false, true, false, false])).toBe(true);
  });

  it('CAB PRESS INHIBITED BY DOORS is active in flight phases 2, 3, 8 and 12', () => {
    expect(activePhases(CAB_PRESS_INHIBITED_BY_DOORS_PHASE_INHIBITION)).toEqual([2, 3, 8, 12]);
  });
});

/*
 * The wiring in FwsAbnormalSensed, read from the source text (importing the EcamMessages tables in a test fails on a
 * circular import, see FwsAbnormalSensedItems.spec.ts).
 */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start, id).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('A380X FwsAbnormalSensed wiring of the AIR PACK, COND and CAB PRESS alerts', () => {
  it.each([
    ['211800013', 'PACK_OVHT_PHASE_INHIBITION', 'packOvht[0]'],
    ['211800014', 'PACK_OVHT_PHASE_INHIBITION', 'packOvht[1]'],
    ['211800015', 'PACK_REGUL_FAULT_PHASE_INHIBITION', 'packRegulFault[0]'],
    ['211800016', 'PACK_REGUL_FAULT_PHASE_INHIBITION', 'packRegulFault[1]'],
    ['211800017', 'PACK_VLV_FAULT_PHASE_INHIBITION', 'packVlvFault[0]'],
    ['211800018', 'PACK_VLV_FAULT_PHASE_INHIBITION', 'packVlvFault[1]'],
    ['211800019', 'PACK_VLV_FAULT_PHASE_INHIBITION', 'packVlvFault[2]'],
    ['211800020', 'PACK_VLV_FAULT_PHASE_INHIBITION', 'packVlvFault[3]'],
    ['211800024', 'BULK_CARGO_DUCT_OVHT_PHASE_INHIBITION', 'bulkCargoDuctOvht'],
    ['213800010', 'CAB_PRESS_MAN_CTL_FAULT_PHASE_INHIBITION', 'cabPressManCtlFault'],
    ['213800018', 'CABIN_AIR_EXTRACT_VLV_FAULT_PHASE_INHIBITION', 'cabinAirExtractVlvFault'],
  ])('%s uses the phase inhibition %s and the FWS condition %s', (id, inhibition, condition) => {
    const block = alertBlock(id);
    expect(block).toContain(`flightPhaseInhib: ${inhibition},`);
    expect(block).toContain(`simVarIsActive: this.fws.${condition},`);
  });

  it('INHIBITED BY DOORS uses the phase inhibition (no longer inhibited in phase 12)', () => {
    expect(alertBlock('213800009')).toContain('flightPhaseInhib: CAB_PRESS_INHIBITED_BY_DOORS_PHASE_INHIBITION,');
  });

  it('the indication levels follow the aircraft: VLV FAULT and EXTRACT VLV FAULT without master caution', () => {
    for (const id of ['211800017', '211800018', '211800019', '211800020', '213800018']) {
      expect(alertBlock(id)).toContain('failure: 1,');
    }
    for (const id of ['211800013', '211800014', '211800015', '211800016', '211800024', '213800010']) {
      expect(alertBlock(id)).toContain('failure: 2,');
    }
  });

  it('DIFF PRESS HI and LDG ELEVN FAULT show the manual mode lines only with the manual mode available', () => {
    expect(alertBlock('213800007')).toContain('diffPressHiItemsToShow(!this.fws.cabPressManCtlFault.get())');
    expect(alertBlock('213800043')).toContain('ldgElevnFaultItemsToShow(!this.fws.cabPressManCtlFault.get())');
  });
});

describe('A380X AIR PACK REGUL, PACK BAY VENT, MIXER PRESS, PURSER TEMP SEL and CAB PRESS SENSORS conditions', () => {
  it('REGUL REDUNDANCY LOST needs a failed regulation component on each pack', () => {
    expect(isPackRegulRedundancyLost([true, false])).toBe(false);
    expect(isPackRegulRedundancyLost([false, true])).toBe(false);
    expect(isPackRegulRedundancyLost([true, true])).toBe(true);
  });

  it('PACK REGUL DEGRADED needs one failed pack and a failed regulation component on the other', () => {
    expect(isPackRegulDegraded([true, false], [false, true])).toBe(true);
    expect(isPackRegulDegraded([false, true], [true, false])).toBe(true);
    expect(isPackRegulDegraded([true, false], [false, false])).toBe(false);
    expect(isPackRegulDegraded([false, false], [true, true])).toBe(false);
    expect(isPackRegulDegraded([true, true], [true, true])).toBe(false);
  });

  it('PACK BAY VENT FAULT is a ground alert for one bay or for both', () => {
    expect(packBayVentFaults([true, false], true)).toEqual({ bay1: true, bay2: false, both: false });
    expect(packBayVentFaults([false, true], true)).toEqual({ bay1: false, bay2: true, both: false });
    expect(packBayVentFaults([true, true], true)).toEqual({ bay1: false, bay2: false, both: true });
    expect(packBayVentFaults([true, true], false)).toEqual({ bay1: false, bay2: false, both: false });
  });

  it('MIXER PRESS LO is shown only in flight phase 1', () => {
    expect(mixerPressRegulItemsToShow(true, false, 1)).toEqual([true, false]);
    expect(mixerPressRegulItemsToShow(false, true, 1)).toEqual([false, true]);
    expect(mixerPressRegulItemsToShow(false, true, 2)).toEqual([false, false]);
  });

  it('the CABIN selector is at PURS SEL beyond the ends of its 0-300 range (as the ACS model)', () => {
    expect(isCabinSelectorInPursSel(200)).toBe(false);
    expect(isCabinSelectorInPursSel(50)).toBe(false);
    expect(isCabinSelectorInPursSel(-50)).toBe(true);
    expect(isCabinSelectorInPursSel(0)).toBe(true);
    expect(isCabinSelectorInPursSel(350)).toBe(false);
    expect(isCabinSelectorInPursSel(360)).toBe(true);
  });

  it('CAB PRESS SENSORS FAULT with one or two sensors left, not with three or none', () => {
    expect(isCabPressSensorsFault([false, false, false, false])).toBe(false);
    expect(isCabPressSensorsFault([true, false, false, false])).toBe(false);
    expect(isCabPressSensorsFault([true, true, false, false])).toBe(true);
    expect(isCabPressSensorsFault([true, true, true, false])).toBe(true);
    expect(isCabPressSensorsFault([true, true, true, true])).toBe(false);
  });

  it('these alerts are active in flight phases 1, 2, 8, 11 and 12', () => {
    expect(activePhases(COND_MONITORING_PHASE_INHIBITION)).toEqual([1, 2, 8, 11, 12]);
  });
});

describe('A380X FwsAbnormalSensed wiring of the pack regulation, bay ventilation and cabin monitoring alerts', () => {
  it.each([
    ['211800022', 'packRegulRedundancyLost'],
    ['211800036', 'purserTempSelFault'],
    ['211800037', 'ramAirFault[0]'],
    ['211800038', 'ramAirFault[1]'],
    ['211800045', 'packRegulDegraded'],
    ['212800025', 'packBayVentFault.bay1'],
    ['212800026', 'packBayVentFault.bay2'],
    ['212800027', 'packBayVentFault.both'],
    ['213800016', 'cabPressSensorsFault'],
  ])('%s uses COND_MONITORING_PHASE_INHIBITION and the FWS condition %s', (id, condition) => {
    const block = alertBlock(id);
    expect(block).toContain('flightPhaseInhib: COND_MONITORING_PHASE_INHIBITION,');
    expect(block).toContain(`simVarIsActive: this.fws.${condition},`);
  });

  it('MIXER PRESS REGUL FAULT shows its HI and LO lines from the mixer pressure conditions', () => {
    const block = alertBlock('211800034');
    expect(block).toContain('mixerPressRegulItemsToShow(');
    expect(block).toContain('this.fws.mixerPressHigh');
    expect(block).toContain('this.fws.mixerPressLow');
  });
});
