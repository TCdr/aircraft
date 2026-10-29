// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { createTechLogbook } from '../../OIT/System/TechLogbook';
import { writeLogbookEntry } from './a380xTechLogbook';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('@flybywiresim/fbw-sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@flybywiresim/fbw-sdk');
  return {
    ...actual,
    NXDataStore: {
      getLegacy: (key: string, defaultValue: string) => store.get(key) ?? defaultValue,
      setLegacy: (key: string, value: string) => store.set(key, value),
    },
  };
});

const LOGBOOK_KEY = 'OIS_TECH_LOGBOOK';

const detail: FailureDetail = {
  whatItIs: 'x',
  impact: [],
  alertIds: ['211800032', '211800048'],
  effects: [],
  logbook: { required: true, reason: 'x' },
  clearing: 'x',
};

const failure = { name: 'Hot air valve 1', ata: 21 };
const procedure = ['\x1b<4mCOND HOT AIR 1 FAULT\x1bm', '- HOT AIR 1 : OFF'];

describe('writeLogbookEntry', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('SimVar', { GetSimVarValue: () => 'F-TEST' });
  });

  it('adds a temporary item with the failure, the chapter, the first alert and the procedure text', () => {
    store.set(LOGBOOK_KEY, JSON.stringify({ ...createTechLogbook(), control: 'on-board' }));

    expect(writeLogbookEntry(failure, detail, procedure)).toEqual({ written: true });

    const item = JSON.parse(store.get(LOGBOOK_KEY) as string).items[0];
    expect(item).toMatchObject({
      title: 'Hot air valve 1',
      ata: '21',
      state: 'temporary',
      ecamAlertId: '211800032',
      pilotComment: 'COND HOT AIR 1 FAULT / - HOT AIR 1 : OFF',
    });
  });

  it('refuses while the ground station controls the logbook', () => {
    store.set(LOGBOOK_KEY, JSON.stringify({ ...createTechLogbook(), control: 'on-ground' }));
    const before = store.get(LOGBOOK_KEY);

    const result = writeLogbookEntry(failure, detail, procedure);

    expect(result).toEqual({ written: false, reason: 'The OIS logbook is not in on-board control' });
    expect(store.get(LOGBOOK_KEY)).toBe(before);
  });

  it('refuses when there is no logbook yet', () => {
    const result = writeLogbookEntry(failure, detail, procedure);

    expect(result.written).toBe(false);
    expect(store.has(LOGBOOK_KEY)).toBe(false);
  });
});
