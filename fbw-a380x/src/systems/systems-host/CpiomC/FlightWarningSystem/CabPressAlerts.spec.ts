// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  areRamAirInletsOpen,
  diffPressHiItemsToShow,
  ExcessNegativeDiffPressMonitor,
  failedPoweredCpcsCount,
  isCabPressAutoCtlFault,
  isDiffPressHi,
  isLdgElevnFault,
  ldgElevnFaultItemsToShow,
  ramAirMemoIndex,
} from './CabPressAlerts';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
  EcamMemos,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

const fixture = createFws();
const { core } = fixture;
const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[id];

describe('CAB PRESS EXCESS NEGATIVE DIFF PRESS', () => {
  it('triggers with the CPCS bit (< -0.72 PSI) and ends only above -0.32 PSI', () => {
    const monitor = new ExcessNegativeDiffPressMonitor();
    expect(monitor.update(false, -0.5)).toBe(false);
    expect(monitor.update(true, -0.8)).toBe(true);
    // The CPCS bit drops at -0.72 PSI: the warning stays until -0.32 PSI
    expect(monitor.update(false, -0.6)).toBe(true);
    expect(monitor.update(false, -0.33)).toBe(true);
    expect(monitor.update(false, -0.3)).toBe(false);
    expect(monitor.update(false, -0.5)).toBe(false);
  });

  it('ends without a valid differential pressure once the CPCS bit is gone', () => {
    const monitor = new ExcessNegativeDiffPressMonitor();
    monitor.update(true, -0.8);
    expect(monitor.update(false, null)).toBe(false);
  });

  it('is a red master warning, active in flight phases 8 and 9', () => {
    const entry = alert('213800003');
    expect(entry.flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
    expect(entry.simVarIsActive).toBe(core.excessNegativeDiffPressure);
    expect(entry.failure).toBe(3);
    expect(EcamAbnormalProcedures['213800003'].title).toBe('\x1b<2m\x1b4mCAB PRESS\x1bm EXCESS NEGATIVE DIFF PRESS');
  });
});

describe('CAB PRESS DIFF PRESS HI', () => {
  it('needs the automatic mode', () => {
    expect(isDiffPressHi(true, false)).toBe(true);
    expect(isDiffPressHi(true, true)).toBe(false);
    expect(isDiffPressHi(false, false)).toBe(false);
  });

  it('shows the MAN mode lines with the manual system, EXPECT HI CAB RATE without', () => {
    expect(diffPressHiItemsToShow(true)).toEqual([true, true, false]);
    expect(diffPressHiItemsToShow(false)).toEqual([false, false, true]);
  });

  it('is wired, master caution, active in flight phase 8 only', () => {
    const entry = alert('213800007');
    expect(entry.flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(entry.simVarIsActive).toBe(core.diffPressHi);
    expect(entry.failure).toBe(2);
  });
});

describe('CAB PRESS DIFF PRESS LO', () => {
  it('is wired, master caution, active in flight phases 8 and 9', () => {
    const entry = alert('213800008');
    expect(entry.flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
    expect(entry.simVarIsActive).toBe(core.diffPressLo);
    expect(entry.failure).toBe(2);
  });
});

describe('CAB PRESS LDG ELEVN FAULT', () => {
  it('triggers when no FMS sends a normal landing elevation', () => {
    expect(isLdgElevnFault(false, false)).toBe(true);
    expect(isLdgElevnFault(true, false)).toBe(false);
    expect(isLdgElevnFault(false, true)).toBe(false);
  });

  it('shows the backup mode lines only without the manual system', () => {
    expect(ldgElevnFaultItemsToShow(true)).toEqual([false, false, false]);
    expect(ldgElevnFaultItemsToShow(false)).toEqual([true, true, true]);
  });

  it('has a message, is wired in phase 8 only and has the LDG ELEVN deferred procedure', () => {
    expect(EcamAbnormalProcedures['213800043'].title).toBe('\x1b<4m\x1b4mCAB PRESS\x1bm LDG ELEVN FAULT');
    const entry = alert('213800043');
    expect(entry.flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(entry.simVarIsActive).toBe(core.ldgElevnFault);
    expect(EcamDeferredProcedures['221700001'].fromAbnormalProcs).toEqual(['221800006', '213800007', '213800043']);
  });
});

describe('RAM AIR memo', () => {
  it('the inlets open with the pb ON below 1 PSI', () => {
    expect(areRamAirInletsOpen(true, 0.5)).toBe(true);
    expect(areRamAirInletsOpen(true, 3)).toBe(false);
    expect(areRamAirInletsOpen(false, 0)).toBe(false);
    expect(areRamAirInletsOpen(true, null)).toBe(true);
  });

  it('green on ground with no engine running, amber in all other cases', () => {
    expect(ramAirMemoIndex(true, false)).toBe(0);
    expect(ramAirMemoIndex(true, true)).toBe(1);
    expect(ramAirMemoIndex(false, false)).toBe(1);
  });

  it('is defined and wired', () => {
    expect(EcamMemos['210000002']).toBe('\x1b<3mRAM AIR');
    expect(EcamMemos['210000003']).toBe('\x1b<4mRAM AIR');
    const memo = core.memos.ewdMemos['210000002'];
    expect(memo.simVarIsActive).toBe(core.ramAirInletsOpen);
    expect(memo.codesToReturn).toEqual(['210000002', '210000003']);
  });
});

describe('CAB PRESS CTL REDUNDANCY LOST and AUTO CTL FAULT: CPCS applications of the CPIOM B', () => {
  const ALL_POWERED = [true, true, true, true];

  it('counts a failed CPCS application only while its CPIOM B is powered', () => {
    expect(failedPoweredCpcsCount([true, true, false, false], ALL_POWERED)).toBe(2);
    expect(failedPoweredCpcsCount([true, true, false, false], [true, false, true, true])).toBe(1);
  });

  it('raises no redundancy loss while the CPIOM B come back one after the other at an EXT PWR power-up', () => {
    // B1 and B4 (DC 1 and DC 2) not powered yet: their words read failure, they did not fail
    const unpoweredFailureWords = [true, false, false, true];
    expect(failedPoweredCpcsCount(unpoweredFailureWords, [false, true, true, false])).toBe(0);
  });

  it('has an AUTO CTL FAULT when all four powered CPCS applications or all four OCSM automatic partitions fail', () => {
    expect(isCabPressAutoCtlFault([true, true, true, true], ALL_POWERED, [false, false, false, false])).toBe(true);
    expect(isCabPressAutoCtlFault([false, false, false, false], ALL_POWERED, [true, true, true, true])).toBe(true);
    expect(isCabPressAutoCtlFault([true, true, true, false], ALL_POWERED, [false, false, false, false])).toBe(false);
  });

  it('has no AUTO CTL FAULT while the CPIOM B are not powered', () => {
    expect(
      isCabPressAutoCtlFault([true, true, true, true], [false, false, false, false], [false, false, false, false]),
    ).toBe(false);
    expect(
      isCabPressAutoCtlFault([true, true, true, true], [true, true, true, false], [false, false, false, false]),
    ).toBe(false);
  });
});
