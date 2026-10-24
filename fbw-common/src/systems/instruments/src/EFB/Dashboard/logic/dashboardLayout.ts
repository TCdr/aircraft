// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DashboardPhase } from './dashboardPhase';
import { ServiceStatus } from './serviceStatus';

export type DashboardLayout = 'gateNoOfp' | 'gateOfp' | 'flight' | 'arrived' | 'noOfp';

/** Taxiing uses the flight frame: the turnaround is over once the aircraft moves, the checklists are what is left */
export const dashboardLayout = (phase: DashboardPhase, hasOfp: boolean): DashboardLayout => {
  if (!hasOfp) {
    return phase === 'atGate' ? 'gateNoOfp' : 'noOfp';
  }
  if (phase === 'atGate') {
    return 'gateOfp';
  }
  return phase === 'arrived' ? 'arrived' : 'flight';
};

/** What the countdown runs to; the taxi ones name where the taxi ends, so taxiing out never reads like taxi-in */
export type CountdownKind = 'offBlocks' | 'runway' | 'gate' | 'tod' | 'destination';

export interface Countdown {
  kind: CountdownKind;
  minutes: number;
  planned: boolean;
}

export interface CountdownInput {
  phase: DashboardPhase;
  nowMs: number;
  /** Scheduled off-blocks time, null without an OFP */
  stdMs: number | null;
  etaMs: number | null;
  taxiOut: { minutes: number; planned: boolean } | null;
  /** Only known when a taxi route to a known stand was built */
  taxiIn: { minutes: number; planned: boolean } | null;
  minutesToTod: { minutes: number; planned: boolean } | null;
  /** The flyPad latched this flight's takeoff: without it an airborne ETA is only the schedule */
  takeoffKnown: boolean;
}

const MS_PER_MINUTE = 60_000;

/**
 * Design choice: up to an hour after the STD the countdown stays at 0:00 (a delay worth seeing); later than that the
 * OFP schedule does not match the sim time and the countdown is hidden
 */
const OFF_BLOCKS_LATE_LIMIT_MIN = 60;

/** The one countdown of the flight strip: what comes next in this phase, null when nothing is known */
export const dashboardCountdown = (i: CountdownInput): Countdown | null => {
  switch (i.phase) {
    case 'atGate':
      return i.stdMs === null || i.nowMs - i.stdMs > OFF_BLOCKS_LATE_LIMIT_MIN * MS_PER_MINUTE
        ? null
        : { kind: 'offBlocks', minutes: Math.max(0, (i.stdMs - i.nowMs) / MS_PER_MINUTE), planned: false };
    case 'taxiOut':
      return i.taxiOut ? { kind: 'runway', ...i.taxiOut } : null;
    case 'takeoff':
    case 'climb':
    case 'cruise':
      if (i.minutesToTod) {
        return { kind: 'tod', ...i.minutesToTod };
      }
      break;
    case 'descent':
      // The FMS can enter its descent phase before the planned top of descent: that one still comes first
      if (i.minutesToTod && i.minutesToTod.minutes > 0) {
        return { kind: 'tod', ...i.minutesToTod };
      }
      break;
    case 'taxiIn':
      return i.taxiIn ? { kind: 'gate', ...i.taxiIn } : null;
    case 'arrived':
      return null;
    default:
      break;
  }
  // After the T/D, or without one, the time left is the one to the destination
  return i.etaMs === null || !i.takeoffKnown
    ? null
    : { kind: 'destination', minutes: Math.max(0, (i.etaMs - i.nowMs) / MS_PER_MINUTE), planned: true };
};

/**
 * The planned arrival: the actual takeoff time plus the planned flight time once airborne (a late departure moves it),
 * the scheduled arrival before that
 */
export const estimatedArrivalMs = (
  takeoffUnixSeconds: number | null,
  tripSeconds: number | string,
  schedInUnixSeconds: number,
): number | null => {
  // The OFP JSON carries the trip time as a string: added as is, it would be joined to the takeoff time
  const trip = Number(tripSeconds);
  if (takeoffUnixSeconds !== null && trip > 0) {
    return (takeoffUnixSeconds + trip) * 1000;
  }
  return schedInUnixSeconds > 0 ? schedInUnixSeconds * 1000 : null;
};

export type ChecklistRowMark = 'done' | 'missed' | 'optional' | 'next' | 'later';

export interface ChecklistRow {
  index: number;
  name: string;
  mark: ChecklistRowMark;
}

/**
 * The checklists of the flight as rows, at most `maxRows` of them: the window keeps one done checklist before the next
 * one, so the card shows where the crew is rather than the start of the list
 */
/** A checklist named in chevrons (<< DEPARTURE CHANGE >>) is run only when needed */
const isOptionalChecklist = (name: string): boolean => name.trim().indexOf('<<') === 0;

/**
 * Where each checklist stands in this flight phase. A checklist becomes relevant at its FWC flight phase; an unmarked
 * one is missed once a checklist of a later phase is relevant (the crew has moved on), and the next one is the first
 * that is neither done, missed nor optional, so in flight the card jumps to the approach without the ground ones.
 * @param checklistPhases the FWC flight phase of each checklist, as the aircraft's checklist file gives it (0: none)
 * @param fwcPhase the current FWC flight phase
 */
export const checklistMarks = (
  checklists: readonly { name: string; markedCompleted: boolean }[],
  checklistPhases: readonly number[],
  fwcPhase: number,
): ChecklistRowMark[] => {
  let latestRelevantPhase = 0;
  checklistPhases.forEach((phase) => {
    if (phase > 0 && phase <= fwcPhase && phase > latestRelevantPhase) {
      latestRelevantPhase = phase;
    }
  });
  let nextFound = false;
  return checklists.map((checklist, index) => {
    if (checklist.markedCompleted) {
      return 'done';
    }
    if (isOptionalChecklist(checklist.name)) {
      return 'optional';
    }
    const phase = checklistPhases[index] ?? 0;
    if (phase > 0 && phase < latestRelevantPhase) {
      return 'missed';
    }
    if (!nextFound) {
      nextFound = true;
      return 'next';
    }
    return 'later';
  });
};

/**
 * The flight phase the checklists are rated in: the FWC phase, but the last checklist phase once the flight has
 * arrived (the FWC goes back to its first phase five minutes after the engines stop, which would reopen the flight)
 */
export const checklistRatingPhase = (fwcPhase: number, checklistPhases: readonly number[], arrived: boolean): number =>
  arrived ? Math.max(fwcPhase, ...checklistPhases) : fwcPhase;

export const checklistRows = (
  checklists: readonly { name: string; markedCompleted: boolean }[],
  marks: readonly ChecklistRowMark[],
  maxRows: number,
): ChecklistRow[] => {
  const nextIndex = marks.indexOf('next');
  const rows: ChecklistRow[] = checklists.map((checklist, index) => ({
    index,
    name: checklist.name,
    mark: marks[index] ?? 'later',
  }));
  if (rows.length <= maxRows) {
    return rows;
  }
  let lastDone = -1;
  rows.forEach((row) => {
    if (row.mark === 'done') {
      lastDone = row.index;
    }
  });
  const anchor = nextIndex >= 0 ? nextIndex : lastDone + 1;
  const start = Math.max(0, Math.min(anchor - 1, rows.length - maxRows));
  return rows.slice(start, start + maxRows);
};

export type ChipTone = 'active' | 'busy' | 'warn' | 'idle';

export interface ServiceChip {
  tone: ChipTone;
  /** Localisation key under Dashboard.Service */
  key: string;
  replacements: Record<string, string>[];
  /** 0..1 while a service runs, null otherwise (the progress line is hidden) */
  progress: number | null;
}

/**
 * The status chip of the fuel or payload card. Without an OFP a service that is not running shows "No plan": a
 * complete status there only means the target equals what is on board, which nobody planned.
 */
export const serviceChip = (status: ServiceStatus, hasOfp: boolean): ServiceChip => {
  const running = (key: string): ServiceChip => {
    const replacements: Record<string, string>[] = [];
    let suffix = '';
    if (status.done !== null && status.total !== null) {
      suffix = 'Count';
      replacements.push({ done: String(status.done) }, { total: String(status.total) });
    } else if (status.minutesLeft !== null) {
      suffix = 'Minutes';
      replacements.push({ minutes: String(Math.max(1, Math.round(status.minutesLeft))) });
    }
    return { tone: 'busy', key: `Dashboard.Service.${key}${suffix}`, replacements, progress: status.progress };
  };
  switch (status.kind) {
    case 'onTheWay':
      return { tone: 'busy', key: 'Dashboard.Service.OnTheWay', replacements: [], progress: null };
    case 'refueling':
      return running('Refueling');
    case 'defueling':
      return running('Defueling');
    case 'boarding':
      return running('Boarding');
    case 'deboarding':
      return running('Deboarding');
    case 'complete':
      return hasOfp
        ? { tone: 'active', key: 'Dashboard.Service.Complete', replacements: [], progress: null }
        : { tone: 'idle', key: 'Dashboard.Service.NoPlan', replacements: [], progress: null };
    default:
      return {
        tone: 'idle',
        key: hasOfp ? 'Dashboard.Service.NotStarted' : 'Dashboard.Service.NoPlan',
        replacements: [],
        progress: null,
      };
  }
};
