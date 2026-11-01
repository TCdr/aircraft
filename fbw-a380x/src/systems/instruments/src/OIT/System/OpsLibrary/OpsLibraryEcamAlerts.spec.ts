// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ChecklistState } from '../../../MsfsAvionicsCommon/providers/FwsPublisher';
import { OpsLibraryEcamAlerts, ecamAlertColour } from './OpsLibraryEcamAlerts';

const TITLES: Record<string, string> = {
  A: '\x1b<4m\x1b4mELEC\x1bm AC BUS 1 FAULT',
  B: '\x1b<2m\x1b4mENG\x1bm 2 N1 OVER LIMIT',
  C: 'PLAIN TITLE',
};

const state = (id: string): ChecklistState => ({
  id,
  procedureActivated: true,
  itemsChecked: [false],
  itemsToShow: [true],
  itemsActive: [true],
});

const make = () => new OpsLibraryEcamAlerts((id) => TITLES[id] ?? id);

describe('ecamAlertColour', () => {
  it('takes red and amber from the EWD title codes, white otherwise', () => {
    expect(ecamAlertColour(TITLES.A)).toBe('amber');
    expect(ecamAlertColour(TITLES.B)).toBe('red');
    expect(ecamAlertColour(TITLES.C)).toBe('white');
  });
});

describe('OpsLibraryEcamAlerts', () => {
  it('lists an alert once when it appears, newest first, with a title without codes', () => {
    const alerts = make();
    alerts.update([state('A')], 1000, true);
    alerts.update([state('A'), state('B')], 2000, true);
    alerts.update([state('A'), state('B')], 3000, true);
    expect(alerts.visible().map((e) => [e.id, e.title, e.colour, e.time])).toEqual([
      ['B', 'ENG 2 N1 OVER LIMIT', 'red', 2000],
      ['A', 'ELEC AC BUS 1 FAULT', 'amber', 1000],
    ]);
  });

  it('lists an alert again when it comes back, and keeps the one that cleared', () => {
    const alerts = make();
    alerts.update([state('A')], 1000, true);
    alerts.update([], 2000, true);
    expect(alerts.visible().map((e) => e.active)).toEqual([false]);
    alerts.update([state('A')], 3000, true);
    expect(alerts.visible().map((e) => [e.time, e.active])).toEqual([
      [3000, true],
      [1000, false],
    ]);
  });

  it('keeps the last procedure state of an alert after it cleared', () => {
    const alerts = make();
    const checked = { ...state('A'), itemsChecked: [true] };
    alerts.update([state('A')], 1000, true);
    alerts.update([checked], 1500, true);
    alerts.update([], 2000, true);
    expect(alerts.lastState(alerts.visible()[0].occurrence)).toEqual(checked);
  });

  it('removes a row with the recycle bin and RESTORE ALL brings the rows back', () => {
    const alerts = make();
    alerts.update([state('A'), state('B')], 1000, true);
    alerts.hide(alerts.visible()[0].occurrence);
    expect(alerts.visible()).toHaveLength(1);
    expect(alerts.hasHidden()).toBe(true);
    alerts.restoreAll();
    expect(alerts.visible()).toHaveLength(2);
    expect(alerts.hasHidden()).toBe(false);
  });

  it('empties the list when the flight index changes, not at the first index', () => {
    const alerts = make();
    alerts.onFlightIndex(3);
    alerts.update([state('A')], 1000, true);
    alerts.onFlightIndex(3);
    expect(alerts.visible()).toHaveLength(1);
    alerts.onFlightIndex(4);
    expect(alerts.visible()).toHaveLength(0);
  });

  it('is frozen while the avionics data do not reach the laptop', () => {
    const alerts = make();
    alerts.update([state('A')], 1000, true);
    alerts.update([state('A'), state('B')], 2000, false);
    alerts.update([], 3000, false);
    expect(alerts.visible().map((e) => [e.id, e.active])).toEqual([['A', true]]);
  });

  it('a laptop start empties the list and forgets the active alerts', () => {
    const alerts = make();
    alerts.update([state('A')], 1000, true);
    alerts.reset();
    expect(alerts.visible()).toEqual([]);
    alerts.update([state('A')], 2000, true);
    expect(alerts.visible()).toHaveLength(1);
  });
});
