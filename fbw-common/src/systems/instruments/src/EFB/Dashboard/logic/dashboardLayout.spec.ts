// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  checklistMarks,
  checklistRatingPhase,
  checklistRows,
  CountdownInput,
  dashboardCountdown,
  dashboardLayout,
  estimatedArrivalMs,
  serviceChip,
} from './dashboardLayout';
import { ServiceStatus } from './serviceStatus';

describe('dashboardLayout', () => {
  it('picks the gate frames by OFP', () => {
    expect(dashboardLayout('atGate', false)).toBe('gateNoOfp');
    expect(dashboardLayout('atGate', true)).toBe('gateOfp');
  });

  it('uses the flight frame for taxi and flight with an OFP, the live frame without one', () => {
    expect(dashboardLayout('taxiOut', true)).toBe('flight');
    expect(dashboardLayout('cruise', true)).toBe('flight');
    expect(dashboardLayout('taxiIn', true)).toBe('flight');
    expect(dashboardLayout('cruise', false)).toBe('noOfp');
    expect(dashboardLayout('taxiOut', false)).toBe('noOfp');
  });

  it('shows the arrival frame once arrived', () => {
    expect(dashboardLayout('arrived', true)).toBe('arrived');
  });
});

describe('dashboardCountdown', () => {
  const NOW = Date.UTC(2026, 9, 23, 12, 0);
  const input = (overrides: Partial<CountdownInput>): CountdownInput => ({
    phase: 'atGate',
    nowMs: NOW,
    stdMs: NOW + 24 * 60_000,
    etaMs: NOW + 90 * 60_000,
    taxiOut: { minutes: 12, planned: true },
    taxiIn: null,
    minutesToTod: { minutes: 18, planned: true },
    takeoffKnown: true,
    ...overrides,
  });

  it('counts down to off-blocks at the gate, never below zero', () => {
    expect(dashboardCountdown(input({}))).toEqual({ kind: 'offBlocks', minutes: 24, planned: false });
    expect(dashboardCountdown(input({ stdMs: NOW - 60_000 }))!.minutes).toBe(0);
    expect(dashboardCountdown(input({ stdMs: null }))).toBeNull();
  });

  it('hides the off-blocks countdown when the STD is more than an hour behind the sim clock', () => {
    // An OFP planned for 04:45Z in a sim flying at 17:42Z: its schedule says nothing about this flight
    expect(dashboardCountdown(input({ stdMs: NOW - 61 * 60_000 }))).toBeNull();
    expect(dashboardCountdown(input({ stdMs: NOW - 59 * 60_000 }))!.minutes).toBe(0);
  });

  it('shows the taxi time while taxiing, and none to the gate without a route', () => {
    expect(dashboardCountdown(input({ phase: 'taxiOut' }))).toEqual({ kind: 'runway', minutes: 12, planned: true });
    expect(dashboardCountdown(input({ phase: 'taxiIn', taxiIn: { minutes: 6, planned: false } }))).toEqual({
      kind: 'gate',
      minutes: 6,
      planned: false,
    });
    expect(dashboardCountdown(input({ phase: 'taxiIn' }))).toBeNull();
  });

  it('shows the T/D in cruise and the destination after it', () => {
    expect(dashboardCountdown(input({ phase: 'cruise' }))!.kind).toBe('tod');
    expect(dashboardCountdown(input({ phase: 'cruise', minutesToTod: null }))).toEqual({
      kind: 'destination',
      minutes: 90,
      planned: true,
    });
    expect(dashboardCountdown(input({ phase: 'descent', minutesToTod: { minutes: 0, planned: true } }))!.kind).toBe(
      'destination',
    );
  });

  it('keeps the T/D countdown in an early FMS descent phase, and the arrival once past the T/D', () => {
    expect(dashboardCountdown(input({ phase: 'descent', minutesToTod: { minutes: 24, planned: true } }))!.kind).toBe(
      'tod',
    );
    expect(dashboardCountdown(input({ phase: 'descent', minutesToTod: { minutes: 0, planned: true } }))!.kind).toBe(
      'destination',
    );
  });

  it('shows no airborne countdown when the flyPad did not see the takeoff', () => {
    // A flight loaded in the air: the scheduled arrival says nothing about this flight's progress
    expect(dashboardCountdown(input({ phase: 'cruise', minutesToTod: null, takeoffKnown: false }))).toBeNull();
    expect(dashboardCountdown(input({ phase: 'descent', minutesToTod: null, takeoffKnown: false }))).toBeNull();
  });

  it('shows nothing once arrived', () => {
    expect(dashboardCountdown(input({ phase: 'arrived' }))).toBeNull();
  });
});

describe('estimatedArrivalMs', () => {
  it('adds the planned flight time to the actual takeoff', () => {
    expect(estimatedArrivalMs(1000, 3600, 9999)).toBe(4600_000);
  });

  it('reads a trip time given as text as a number', () => {
    expect(estimatedArrivalMs(1000, '4740', 9999)).toBe(5740_000);
  });

  it('falls back to the scheduled arrival before takeoff', () => {
    expect(estimatedArrivalMs(null, 3600, 9999)).toBe(9999_000);
    expect(estimatedArrivalMs(null, 3600, 0)).toBeNull();
  });
});

describe('checklistRows', () => {
  const lists = (...done: boolean[]) => done.map((markedCompleted, i) => ({ name: `CL${i}`, markedCompleted }));

  const marks = (nextIndex: number, ...done: boolean[]) =>
    done.map((d, i) => (d ? 'done' : i === nextIndex ? 'next' : 'later') as ReturnType<typeof checklistMarks>[number]);

  it('keeps the marks it is given', () => {
    expect(checklistRows(lists(true, false, false), marks(1, true, false, false), 5).map((r) => r.mark)).toEqual([
      'done',
      'next',
      'later',
    ]);
  });

  it('keeps one done checklist before the next one when the list is longer than the card', () => {
    const rows = checklistRows(
      lists(true, true, true, true, false, false, false, false),
      marks(4, true, true, true, true, false, false, false, false),
      4,
    );
    expect(rows.map((r) => r.index)).toEqual([3, 4, 5, 6]);
  });

  it('keeps the window inside the list at its end', () => {
    const rows = checklistRows(
      lists(true, true, true, true, true, true, false),
      marks(6, true, true, true, true, true, true, false),
      4,
    );
    expect(rows.map((r) => r.index)).toEqual([3, 4, 5, 6]);
  });

  it('follows the last done checklist when no next one is known', () => {
    const rows = checklistRows(
      lists(true, true, true, false, false, false, false),
      marks(-1, true, true, true, false, false, false, false),
      3,
    );
    expect(rows.map((r) => r.index)).toEqual([2, 3, 4]);
  });
});

describe('serviceChip', () => {
  const status = (overrides: Partial<ServiceStatus>): ServiceStatus => ({
    kind: 'notStarted',
    progress: null,
    minutesLeft: null,
    done: null,
    total: null,
    ...overrides,
  });

  it('shows "No plan" without an OFP unless the service runs', () => {
    expect(serviceChip(status({}), false).key).toBe('Dashboard.Service.NoPlan');
    expect(serviceChip(status({ kind: 'complete' }), false).key).toBe('Dashboard.Service.NoPlan');
    expect(serviceChip(status({ kind: 'refueling', minutesLeft: 3 }), false).key).toBe(
      'Dashboard.Service.RefuelingMinutes',
    );
  });

  it('shows the count of a boarding with its progress', () => {
    expect(serviceChip(status({ kind: 'boarding', done: 112, total: 168, progress: 0.6 }), true)).toEqual({
      tone: 'busy',
      key: 'Dashboard.Service.BoardingCount',
      replacements: [{ done: '112' }, { total: '168' }],
      progress: 0.6,
    });
  });

  it('is cyan when complete and grey when not started with an OFP', () => {
    expect(serviceChip(status({ kind: 'complete' }), true).tone).toBe('active');
    expect(serviceChip(status({}), true)).toMatchObject({ tone: 'idle', key: 'Dashboard.Service.NotStarted' });
  });
});

describe('checklistMarks', () => {
  // The A32NX checklist file: names and FWC flight phases
  const names = [
    'COCKPIT PREPARATION',
    'BEFORE START',
    'AFTER START',
    'TAXI',
    'LINE-UP',
    '<< DEPARTURE CHANGE >>',
    'APPROACH',
    'LANDING',
    'AFTER LANDING',
    'PARKING',
    'SECURING AIRCRAFT',
  ];
  const phases = [1, 1, 2, 2, 2, 2, 6, 7, 9, 10, 10];
  const lists = (doneCount: number) => names.map((name, i) => ({ name, markedCompleted: i < doneCount }));

  it('starts with the cockpit preparation at the gate', () => {
    expect(checklistMarks(lists(0), phases, 1).slice(0, 3)).toEqual(['next', 'later', 'later']);
  });

  it('in climb, marks the ground checklists not done as missed and moves on to the approach', () => {
    const marks = checklistMarks(lists(0), phases, 6);
    expect(marks.slice(0, 5)).toEqual(['missed', 'missed', 'missed', 'missed', 'missed']);
    expect(marks[5]).toBe('optional');
    expect(marks[6]).toBe('next');
    expect(marks[7]).toBe('later');
  });

  it('keeps the ones done as done', () => {
    const marks = checklistMarks(lists(5), phases, 6);
    expect(marks.slice(0, 5)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(marks[6]).toBe('next');
  });

  it('with engines started, misses the gate checklists and offers the after start one', () => {
    const marks = checklistMarks(lists(0), phases, 2);
    expect(marks.slice(0, 3)).toEqual(['missed', 'missed', 'next']);
  });

  it('with no flight phase yet, offers the first checklist', () => {
    expect(checklistMarks(lists(0), phases, 0)[0]).toBe('next');
  });
});

describe('checklistRatingPhase', () => {
  const phases = [1, 1, 2, 2, 2, 2, 6, 7, 9, 10, 10];

  it('follows the FWC phase during the flight', () => {
    expect(checklistRatingPhase(6, phases, false)).toBe(6);
  });

  it('rates the checklists at the last phase once arrived, though the FWC is back at its first phase', () => {
    expect(checklistRatingPhase(1, phases, true)).toBe(10);
  });
});
