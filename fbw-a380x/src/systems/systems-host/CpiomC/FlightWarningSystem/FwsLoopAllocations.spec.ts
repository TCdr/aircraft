// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EcamDeferredProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { cachedEntries, cachedEntriesOfBoth } from './FwsDictEntries';
import { createFws, FwsFixture, runFwsCycle } from './FwsSpecFixture';

/*
 * The flight warning loop runs 8 times a second over tables of more than a thousand alerts that never change after
 * the system is built. All cockpit views share one JavaScript heap, so every list it rebuilds on a cycle is garbage
 * that the whole cockpit pays for.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

const FUEL_CG_AT_FWD_LIMIT = '281800007';
const SECOND_FUEL_CAUTION = '281800008';
const THIRD_FUEL_CAUTION = '281800086';

function warmedUpFws(): FwsFixture {
  const fixture = createFws(new Set());
  // the first cycles activate the alerts that are active from the start
  for (let cycle = 0; cycle < 5; cycle++) {
    runFwsCycle(fixture.core);
  }
  return fixture;
}

/** The alerts of a hand-made table, each with a switch to turn it on and off; everything else stays out of the way */
function fwsWithAlerts(keysOf: string[] | ((core: FwsFixture['core']) => string[])) {
  const fixture = createFws(new Set());
  fixture.core.flightPhase.set(8);
  fixture.core.flightPhase.set = () => undefined;
  const keys = typeof keysOf === 'function' ? keysOf(fixture.core) : keysOf;
  const switches = new Map<string, Subject<boolean>>();
  const table: typeof fixture.core.ewdAbnormal = {};
  for (const key of keys) {
    const alertSwitch = Subject.create(true);
    switches.set(key, alertSwitch);
    table[key] = { ...fixture.core.ewdAbnormal[key], simVarIsActive: alertSwitch, flightPhaseInhib: [] };
  }
  fixture.core.ewdAbnormal = table;
  let time = 0;
  const cycle = () => {
    time += 10;
    fixture.simVars.set('E:SIMULATION TIME', time);
    runFwsCycle(fixture.core);
  };
  return { ...fixture, switches, cycle };
}

describe('FWS cycle allocations', () => {
  it('does not rebuild the entries of the fixed alert tables', () => {
    const { core } = warmedUpFws();
    const fixedTables: object[] = [
      core.ewdAbnormal,
      core.abnormalSensed.ewdDeferredProcs,
      core.abnormalNonSensed.ewdDeferredProcs,
      core.memos.ewdMemos,
      core.memos.ewdToLdgMemos,
      core.inopSys.inopSys,
      core.information.info,
      core.limitations.limitations,
    ];
    const entriesOf = vi.spyOn(Object, 'entries');
    runFwsCycle(core);

    const rebuilt = entriesOf.mock.calls.filter(([table]) => fixedTables.includes(table as object));
    // the loop builds the entries of these 8 tables on every cycle without the cache (10 calls, 8 of them distinct)
    expect(rebuilt).toHaveLength(0);
  });

  it('does not copy the failure lists for the alerts that are not in them', () => {
    const { core } = warmedUpFws();
    const filter = vi.spyOn(Array.prototype, 'filter');
    runFwsCycle(core);

    // without the check every inactive alert copied two lists: about two filter calls per alert of the table
    expect(Object.keys(core.ewdAbnormal).length).toBeGreaterThan(1000);
    expect(filter.mock.calls.length).toBeLessThan(150);
  });
});

describe('FWS alert lists', () => {
  it('drops an alert that became inactive from the failure list and the recall list', () => {
    const { core, switches, cycle } = fwsWithAlerts([FUEL_CG_AT_FWD_LIMIT, SECOND_FUEL_CAUTION]);
    cycle();
    cycle();
    core.recallFailures.push(FUEL_CG_AT_FWD_LIMIT);
    expect(core.presentedFailures).toContain(FUEL_CG_AT_FWD_LIMIT);
    expect(core.presentedFailures).toContain(SECOND_FUEL_CAUTION);

    switches.get(FUEL_CG_AT_FWD_LIMIT)!.set(false);
    cycle();

    expect(core.presentedFailures).not.toContain(FUEL_CG_AT_FWD_LIMIT);
    expect(core.recallFailures).not.toContain(FUEL_CG_AT_FWD_LIMIT);
    expect(core.presentedFailures).toContain(SECOND_FUEL_CAUTION);
  });

  it('removes every copy of an inactive alert from the failure list, and keeps the others in order', () => {
    const { core, switches, cycle } = fwsWithAlerts([FUEL_CG_AT_FWD_LIMIT, SECOND_FUEL_CAUTION, THIRD_FUEL_CAUTION]);
    cycle();
    cycle();
    switches.get(SECOND_FUEL_CAUTION)!.set(false);
    core.presentedFailures.push(SECOND_FUEL_CAUTION, SECOND_FUEL_CAUTION);
    const before = core.presentedFailures.filter((key) => key !== SECOND_FUEL_CAUTION);

    cycle();

    expect(core.presentedFailures).toEqual(before);
  });

  it('keeps an alert that is still active in the recall list', () => {
    const { core, cycle } = fwsWithAlerts([FUEL_CG_AT_FWD_LIMIT]);
    cycle();
    core.recallFailures.push(FUEL_CG_AT_FWD_LIMIT);
    core.presentedFailures.length = 0;

    cycle();

    expect(core.recallFailures).toEqual([FUEL_CG_AT_FWD_LIMIT]);
  });

  it('presents several active alerts in the order of the table walk', () => {
    const { core, cycle } = fwsWithAlerts([
      '320900005',
      THIRD_FUEL_CAUTION,
      '211800001',
      '290800035',
      '260900097',
      FUEL_CG_AT_FWD_LIMIT,
      '213800038',
      '320800007',
    ]);
    cycle();
    cycle();
    cycle();

    // the order of the code that built the entries on every cycle; a table of eight alerts, one of them not shown
    expect(core.presentedFailures).toEqual([
      '260900097',
      '320900005',
      '281800007',
      '281800086',
      '320800007',
      '211800001',
      '213800038',
    ]);
  });

  it('activates a deferred procedure with its alert', () => {
    let deferredKey = '';
    const { core, cycle } = fwsWithAlerts((fws) => {
      for (const table of [fws.abnormalSensed.ewdDeferredProcs, fws.abnormalNonSensed.ewdDeferredProcs]) {
        for (const [deferred, item] of Object.entries(table)) {
          const alert = EcamDeferredProcedures[deferred].fromAbnormalProcs.find((key) => fws.ewdAbnormal[key]);
          if (deferredKey === '' && alert !== undefined && item.simVarIsActive.get()) {
            deferredKey = deferred;
            return [alert];
          }
        }
      }
      return [];
    });
    expect(deferredKey).not.toBe('');

    cycle();
    cycle();

    expect(core.activeDeferredProceduresList.get().has(deferredKey)).toBe(true);
  });
});

describe('cached entries', () => {
  it('returns the same array for the same table and another one for another table', () => {
    const table = { a: 1, b: 2 };
    expect(cachedEntries(table)).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(cachedEntries(table)).toBe(cachedEntries(table));
    expect(cachedEntries({ a: 1, b: 2 })).not.toBe(cachedEntries(table));
  });

  it('lists the first table before the second, not by key as the merged table would', () => {
    const first = { 20: 'x' };
    const second = { 10: 'y' };
    expect(cachedEntriesOfBoth(first, second)).toEqual([
      ['20', 'x'],
      ['10', 'y'],
    ]);
    expect(Object.entries(Object.assign({}, first, second)).map(([key]) => key)).toEqual(['10', '20']);
    expect(cachedEntriesOfBoth(first, second)).toBe(cachedEntriesOfBoth(first, second));
    expect(cachedEntriesOfBoth(first, { 10: 'y' })).not.toBe(cachedEntriesOfBoth(first, second));
  });
});
