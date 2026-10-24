// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ServiceStatus } from './serviceStatus';

export type TurnaroundStep = 'refuel' | 'cargo' | 'boarding' | 'doorsClosed' | 'pushback';

export type TurnaroundStepState = 'notStarted' | 'running' | 'complete';

export interface TurnaroundRow {
  step: TurnaroundStep;
  state: TurnaroundStepState;
  /** Projected end, Unix ms; only for a running step whose time left is known */
  endMs: number | null;
  /** The projected end is after the scheduled departure */
  late: boolean;
}

export interface TurnaroundInput {
  nowMs: number;
  stdMs: number | null;
  fuel: ServiceStatus;
  payload: ServiceStatus;
  cargoKg: number;
  cargoTargetKg: number;
  /** GSX loads the baggage itself while it boards */
  gsxBaggageLoading: boolean;
  gsxBaggageDone: boolean;
  openDoorCount: number;
  /** Pushback tug attached or GSX pushback requested or running */
  pushbackActive: boolean;
}

const MS_PER_MINUTE = 60_000;
/** Below this the cargo is where it should be; the loading steps are coarser than one kilogram */
const CARGO_TOLERANCE_KG = 10;

const serviceState = (status: ServiceStatus): TurnaroundStepState => {
  if (status.kind === 'complete') {
    return 'complete';
  }
  return status.kind === 'notStarted' ? 'notStarted' : 'running';
};

const cargoState = (i: TurnaroundInput): TurnaroundStepState => {
  if (i.gsxBaggageLoading) {
    return 'running';
  }
  if (i.gsxBaggageDone || (i.cargoTargetKg > 0 && Math.abs(i.cargoTargetKg - i.cargoKg) < CARGO_TOLERANCE_KG)) {
    return 'complete';
  }
  // The flyPad loads the cargo together with the passengers
  return i.payload.kind === 'boarding' ? 'running' : 'notStarted';
};

/** The steps of the turnaround to the off-blocks time, in their order on the ramp */
export const turnaroundRows = (i: TurnaroundInput): TurnaroundRow[] => {
  const row = (step: TurnaroundStep, state: TurnaroundStepState, minutesLeft: number | null): TurnaroundRow => {
    const endMs = state === 'running' && minutesLeft !== null ? i.nowMs + minutesLeft * MS_PER_MINUTE : null;
    return { step, state, endMs, late: endMs !== null && i.stdMs !== null && endMs > i.stdMs };
  };
  const boardingDone = serviceState(i.payload) === 'complete';
  return [
    row('refuel', serviceState(i.fuel), i.fuel.minutesLeft),
    row('cargo', cargoState(i), i.payload.minutesLeft),
    row('boarding', serviceState(i.payload), i.payload.minutesLeft),
    row('doorsClosed', boardingDone && i.openDoorCount === 0 ? 'complete' : 'notStarted', null),
    row('pushback', i.pushbackActive ? 'running' : 'notStarted', null),
  ];
};

/**
 * Minutes from the scheduled departure to the latest projected end of a running step: positive when late, null
 * without a schedule or a projection
 */
export const turnaroundLateMinutes = (rows: readonly TurnaroundRow[], stdMs: number | null): number | null => {
  if (stdMs === null) {
    return null;
  }
  let latest: number | null = null;
  rows.forEach((row) => {
    if (row.endMs !== null && (latest === null || row.endMs > latest)) {
      latest = row.endMs;
    }
  });
  return latest === null ? null : (latest - stdMs) / MS_PER_MINUTE;
};
