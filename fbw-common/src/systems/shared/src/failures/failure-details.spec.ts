// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AlertProcedure,
  allAlertIds,
  FailureDetail,
  FailureDetailTable,
  failuresWithoutDetail,
  logbookProcedures,
  orderByEwd,
  resolveFailureDetail,
} from './failure-details';
import { FailureDefinition } from './failures-orchestrator';

const detailFor = (whatItIs: string, alertIds: string[] = []): FailureDetail => ({
  whatItIs,
  impact: [],
  alertIds,
  effects: [],
  logbook: { required: true, reason: '' },
  clearing: '',
});

const procedure = (alertId: string, ewdOrder?: number): AlertProcedure => ({
  alertId,
  title: [],
  lines: [],
  ewdOrder,
});

describe('resolveFailureDetail', () => {
  const familyTable = (entries: Record<number, FailureDetail> = {}): FailureDetailTable => ({
    entries,
    families: [{ ids: [21027, 21028], detail: (n) => detailFor(`Pack ${n}`) }],
  });

  it('numbers family members from 1 by their position', () => {
    expect(resolveFailureDetail(familyTable(), 21028)?.whatItIs).toBe('Pack 2');
  });

  it('prefers an entry over a family', () => {
    expect(resolveFailureDetail(familyTable({ 21028: detailFor('Own') }), 21028)?.whatItIs).toBe('Own');
  });

  it('returns undefined for an unknown id', () => {
    expect(resolveFailureDetail(familyTable(), 99999)).toBeUndefined();
  });
});

describe('failuresWithoutDetail', () => {
  const definitions: FailureDefinition[] = [
    [21, 21000, 'a'],
    [21, 21001, 'b'],
    [22, 22000, 'c'],
  ];
  const table: FailureDetailTable = { entries: { 21000: detailFor('a') }, families: [] };

  it('lists failures of the done chapters that have no detail', () => {
    expect(failuresWithoutDetail(table, definitions, [21])).toEqual([21001]);
  });

  it('lists nothing when no chapter is done', () => {
    expect(failuresWithoutDetail(table, definitions, [])).toEqual([]);
  });
});

describe('allAlertIds', () => {
  it('collects the alert ids of every family member', () => {
    const table: FailureDetailTable = {
      entries: {},
      families: [{ ids: [1, 2], detail: (n) => detailFor('x', [`216121${n}`]) }],
    };
    const definitions: FailureDefinition[] = [
      [21, 1, 'a'],
      [21, 2, 'b'],
    ];
    expect(allAlertIds(table, definitions)).toEqual(['2161211', '2161212']);
  });
});

describe('allAlertIds de-duplication', () => {
  it('lists an alert shared by several failures once', () => {
    const table: FailureDetailTable = {
      entries: { 1: detailFor('a', ['2161211']), 2: detailFor('b', ['2161211', '2161212']) },
      families: [],
    };
    const definitions: FailureDefinition[] = [
      [21, 1, 'a'],
      [21, 2, 'b'],
    ];
    expect(allAlertIds(table, definitions)).toEqual(['2161211', '2161212']);
  });
});

describe('orderByEwd', () => {
  it('leaves its input untouched', () => {
    const input = [procedure('A'), procedure('B', 1), procedure('C', 0)];
    orderByEwd(input);
    expect(input.map((p) => p.alertId)).toEqual(['A', 'B', 'C']);
  });

  it('puts presented alerts first in EWD order, then the others in entry order', () => {
    const ordered = orderByEwd([procedure('A'), procedure('B', 1), procedure('C', 0)]);
    expect(ordered.map((p) => p.alertId)).toEqual(['C', 'B', 'A']);
  });
});

describe('logbookProcedures', () => {
  it('keeps only the presented alerts, in EWD order', () => {
    const result = logbookProcedures([procedure('a'), procedure('b', 2), procedure('c', 1)]);
    expect(result.map((p) => p.alertId)).toEqual(['c', 'b']);
  });

  it('falls back to the first alert when none is presented', () => {
    const result = logbookProcedures([procedure('a'), procedure('b')]);
    expect(result.map((p) => p.alertId)).toEqual(['a']);
  });

  it('returns nothing for no alerts', () => {
    expect(logbookProcedures([])).toEqual([]);
  });
});
