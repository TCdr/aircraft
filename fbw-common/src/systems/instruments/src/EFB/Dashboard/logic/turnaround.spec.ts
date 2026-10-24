// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TurnaroundInput, turnaroundLateMinutes, turnaroundRows } from './turnaround';
import { payloadServiceStatus, ServiceStatus } from './serviceStatus';

const NOW = Date.UTC(2026, 9, 23, 12, 30);
const STD = NOW + 20 * 60_000;

const status = (kind: ServiceStatus['kind'], minutesLeft: number | null = null): ServiceStatus => ({
  kind,
  progress: null,
  minutesLeft,
  done: null,
  total: null,
});

const input = (overrides: Partial<TurnaroundInput>): TurnaroundInput => ({
  nowMs: NOW,
  stdMs: STD,
  fuel: status('notStarted'),
  payload: status('notStarted'),
  cargoKg: 0,
  cargoTargetKg: 0,
  gsxBaggageLoading: false,
  gsxBaggageDone: false,
  openDoorCount: 2,
  pushbackActive: false,
  ...overrides,
});

const stateOf = (rows: ReturnType<typeof turnaroundRows>, step: string) => rows.find((r) => r.step === step)!.state;

describe('turnaroundRows', () => {
  it('lists the steps in ramp order', () => {
    expect(turnaroundRows(input({})).map((r) => r.step)).toEqual([
      'refuel',
      'cargo',
      'boarding',
      'doorsClosed',
      'pushback',
    ]);
  });

  it('projects the end of a running step and marks it late after the STD', () => {
    const rows = turnaroundRows(input({ fuel: status('refueling', 5), payload: status('boarding', 30) }));
    expect(rows[0]).toEqual({ step: 'refuel', state: 'running', endMs: NOW + 5 * 60_000, late: false });
    expect(rows[2]).toMatchObject({ state: 'running', late: true });
  });

  it('completes the cargo at its target or when GSX finished the baggage', () => {
    expect(stateOf(turnaroundRows(input({ cargoKg: 2100, cargoTargetKg: 2105 })), 'cargo')).toBe('complete');
    expect(stateOf(turnaroundRows(input({ gsxBaggageDone: true })), 'cargo')).toBe('complete');
    expect(stateOf(turnaroundRows(input({ gsxBaggageLoading: true })), 'cargo')).toBe('running');
    expect(stateOf(turnaroundRows(input({ cargoTargetKg: 0 })), 'cargo')).toBe('notStarted');
  });

  it('closes the doors only after the boarding', () => {
    expect(stateOf(turnaroundRows(input({ openDoorCount: 0 })), 'doorsClosed')).toBe('notStarted');
    expect(stateOf(turnaroundRows(input({ openDoorCount: 0, payload: status('complete') })), 'doorsClosed')).toBe(
      'complete',
    );
  });

  it('closes the doors of an imported 0-passenger OFP', () => {
    const payload = payloadServiceStatus({
      gsxSync: false,
      gsxBoardingState: 1,
      gsxDeboardingState: 1,
      startedByUser: false,
      paxOnBoard: 0,
      paxTarget: 0,
      paxStart: 0,
      ordered: true,
    });
    expect(stateOf(turnaroundRows(input({ openDoorCount: 0, payload })), 'doorsClosed')).toBe('complete');
  });

  it('shows the pushback running while it is attached or called', () => {
    expect(stateOf(turnaroundRows(input({ pushbackActive: true })), 'pushback')).toBe('running');
  });
});

describe('turnaroundLateMinutes', () => {
  it('is the latest projected end against the STD', () => {
    const rows = turnaroundRows(input({ fuel: status('refueling', 5), payload: status('boarding', 26) }));
    expect(turnaroundLateMinutes(rows, STD)).toBe(6);
  });

  it('is null without a projection or a schedule', () => {
    expect(turnaroundLateMinutes(turnaroundRows(input({})), STD)).toBeNull();
    expect(turnaroundLateMinutes(turnaroundRows(input({ fuel: status('refueling', 5) })), null)).toBeNull();
  });
});
