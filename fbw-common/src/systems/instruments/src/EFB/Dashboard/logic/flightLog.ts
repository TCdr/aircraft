// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DashboardPhase } from './dashboardPhase';

export interface FlightLogEvent {
  unixSeconds: number;
  fobKg: number;
  grossWeightKg: number;
}

/** The actual times and weights of the flight of one OFP */
export interface FlightLog {
  ofpKey: string;
  offBlocks?: FlightLogEvent;
  takeoff?: FlightLogEvent;
  touchdown?: FlightLogEvent;
  onBlocks?: FlightLogEvent;
}

export interface FlightLogSample {
  phase: DashboardPhase;
  onGround: boolean;
}

export interface FlightLogInput extends FlightLogSample {
  ofpKey: string;
  event: FlightLogEvent;
}

/**
 * Records the block and flight events on the transitions between two samples. A new OFP starts a new log, so the
 * events of the last flight never mix with the next one.
 */
export const updateFlightLog = (log: FlightLog | null, previous: FlightLogSample, now: FlightLogInput): FlightLog => {
  const next: FlightLog = log && log.ofpKey === now.ofpKey ? { ...log } : { ofpKey: now.ofpKey };
  if (previous.phase === 'atGate' && now.phase !== 'atGate' && now.phase !== 'arrived') {
    next.offBlocks = now.event;
  }
  if (previous.onGround && !now.onGround) {
    next.takeoff = now.event;
  }
  if (!previous.onGround && now.onGround) {
    next.touchdown = now.event;
  }
  if (previous.phase !== 'arrived' && now.phase === 'arrived') {
    next.onBlocks = now.event;
  }
  return next;
};

export const parseFlightLog = (text: string): FlightLog | null => {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.ofpKey === 'string' ? (parsed as FlightLog) : null;
  } catch (_) {
    return null;
  }
};

export interface FlightPlanFigures {
  /** Scheduled block time, minutes */
  blockMinutes: number | null;
  /** Planned time from takeoff to landing, minutes */
  flightMinutes: number | null;
  tripFuelKg: number | null;
  landingWeightKg: number | null;
}

export interface FlightSummary {
  blockMinutes: number | null;
  flightMinutes: number | null;
  fuelUsedKg: number | null;
  landingWeightKg: number | null;
  /** Fuel burned from takeoff to touchdown minus the planned trip fuel, the figure the advice compares */
  fuelUsedDeltaKg: number | null;
}

const minutesBetween = (from: FlightLogEvent | undefined, to: FlightLogEvent | undefined): number | null =>
  from && to && to.unixSeconds >= from.unixSeconds ? (to.unixSeconds - from.unixSeconds) / 60 : null;

/** The actual figures of a flight; a figure whose events were not both seen is null and hidden */
export const flightSummary = (log: FlightLog | null, plan: FlightPlanFigures): FlightSummary => {
  if (!log) {
    return { blockMinutes: null, flightMinutes: null, fuelUsedKg: null, landingWeightKg: null, fuelUsedDeltaKg: null };
  }
  const fuelUsedKg = log.takeoff && log.touchdown ? log.takeoff.fobKg - log.touchdown.fobKg : null;
  return {
    blockMinutes: minutesBetween(log.offBlocks, log.onBlocks),
    flightMinutes: minutesBetween(log.takeoff, log.touchdown),
    fuelUsedKg,
    landingWeightKg: log.touchdown ? log.touchdown.grossWeightKg : null,
    fuelUsedDeltaKg: fuelUsedKg !== null && plan.tripFuelKg ? fuelUsedKg - plan.tripFuelKg : null,
  };
};
