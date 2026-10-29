// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDefinition } from './failures-orchestrator';

export type EcamColour = 'white' | 'green' | 'cyan' | 'amber' | 'red' | 'magenta' | 'yellow';

export interface EcamTextSegment {
  text: string;
  colour: EcamColour;
  underline: boolean;
}

/** pending: still to do on the EWD; done: checked on the EWD; reference: alert not presented; inactive: shown greyed on the EWD, not yet to be done */
export type ProcedureLineState = 'pending' | 'done' | 'reference' | 'inactive';

export interface ProcedureLine {
  segments: EcamTextSegment[];
  level: number;
  state: ProcedureLineState;
}

export interface AlertProcedure {
  alertId: string;
  title: EcamTextSegment[];
  lines: ProcedureLine[];
  /** position on the EWD, undefined when not presented */
  ewdOrder?: number;
  /** A32NX overflow: the EWD hides lines of this alert below its last line */
  continuesOnEwd?: boolean;
  /** A32NX overflow: not among the shown lines, but the EWD is full so the alert may be further down */
  mayBeBelowEwd?: boolean;
}

/** One thing the crew sees, with the display or panel it shows on */
export interface SeenEffect {
  /** E/WD, PFD, ND, SD <page>, MFD, an overhead panel, the pedestal or aural */
  where: string;
  text: string;
}

export interface FailureDetail {
  /** the part and what it does normally: system knowledge, not about the failure */
  whatItIs: string;
  /** what the failure does to the aircraft and what follows from it */
  impact: readonly string[];
  /** every alert the failure can raise; A32NX: 7-digit FWC alert key, A380X: 9-digit procedure id */
  alertIds: readonly string[];
  effects: readonly SeenEffect[];
  notSimulated?: readonly string[];
  /** ECAM-style lines for alerts whose procedure has no lines in the warning-system tables */
  literalProcedure?: readonly string[];
  /** whether the crew writes the failure in the aircraft technical logbook, and why in a few words */
  logbook: { required: boolean; reason: string };
  clearing: string;
}

/** `reason` says why nothing was written; a plain shape because the build does not narrow unions on a boolean */
export interface LogbookWriteResult {
  written: boolean;
  reason?: string;
}

/** `detail` receives the 1-based position of the failure in `ids` */
export interface FailureDetailFamily {
  ids: readonly number[];
  detail: (number: number) => FailureDetail;
}

export interface FailureDetailTable {
  entries: Readonly<Record<number, FailureDetail>>;
  families: readonly FailureDetailFamily[];
}

/** An entry wins over a family, so one member of a family can differ from its siblings. */
export function resolveFailureDetail(table: FailureDetailTable, id: number): FailureDetail | undefined {
  const entry = table.entries[id];
  if (entry) {
    return entry;
  }

  for (const family of table.families) {
    const position = family.ids.indexOf(id);
    if (position >= 0) {
      return family.detail(position + 1);
    }
  }

  return undefined;
}

/** Failures of the chapters whose details are written but that have none yet. */
export function failuresWithoutDetail(
  table: FailureDetailTable,
  definitions: readonly FailureDefinition[],
  doneChapters: readonly number[],
): number[] {
  return definitions
    .filter(([chapter, id]) => doneChapters.includes(chapter) && resolveFailureDetail(table, id) === undefined)
    .map(([, id]) => id);
}

export function allAlertIds(table: FailureDetailTable, definitions: readonly FailureDefinition[]): string[] {
  const alertIds = new Set<string>();
  for (const [, id] of definitions) {
    const detail = resolveFailureDetail(table, id);
    if (detail) {
      detail.alertIds.forEach((alertId) => alertIds.add(alertId));
    }
  }
  return Array.from(alertIds);
}

/** presented first in EWD order, then the others in entry order */
export function orderByEwd(procedures: readonly AlertProcedure[]): AlertProcedure[] {
  const presented = procedures
    .filter((procedure) => procedure.ewdOrder !== undefined)
    .sort((a, b) => (a.ewdOrder as number) - (b.ewdOrder as number));
  const others = procedures.filter((procedure) => procedure.ewdOrder === undefined);
  return presented.concat(others);
}

/** The procedures the logbook comment holds: what the EWD presents, or the first alert when it presents none */
export function logbookProcedures(procedures: readonly AlertProcedure[]): AlertProcedure[] {
  const presented = orderByEwd(procedures).filter((procedure) => procedure.ewdOrder !== undefined);
  return presented.length > 0 ? presented : procedures.slice(0, 1);
}
