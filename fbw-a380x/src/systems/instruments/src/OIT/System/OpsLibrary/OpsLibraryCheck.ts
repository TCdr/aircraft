// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { OpsManual, countUnits, manualHash } from './OpsLibraryContent';
import { OpsLibraryCheckResult } from './OpsLibraryUserData';

/**
 * Check of a manual: the content is read again and compared with what the manual declares. A manual built at run time
 * has no stored checksum, so only its unit count is compared.
 * @param manual the manual
 * @returns success, or failed when the unit count or the checksum differs
 */
export function checkManual(manual: OpsManual): 'success' | 'failed' {
  if (countUnits(manual.root) !== manual.units) {
    return 'failed';
  }
  if (manual.hash !== '' && manualHash(manual.root) !== manual.hash) {
    return 'failed';
  }
  return 'success';
}

/** How long the checking of a manual takes. Design choice: a few seconds, so that "Checking..." is seen */
export const CHECK_DURATION_MS = 3000;

/** The check of one manual in progress */
export interface RunningCheck {
  readonly manualId: string;
  /** Sim time the check ends */
  readonly endsAt: number;
}

/** The check of one manual at a time: it takes a few seconds and aborts when the laptop goes off meanwhile */
export class OpsLibraryCheckRunner {
  private readonly _running = Subject.create<RunningCheck | null>(null);
  public readonly running = this._running as Subscribable<RunningCheck | null>;

  /**
   * @param manualId the manual to check
   * @param now sim time, ms
   * @returns false when a check is already running
   */
  public start(manualId: string, now: number): boolean {
    if (this._running.get() !== null) {
      return false;
    }
    this._running.set({ manualId, endsAt: now + CHECK_DURATION_MS });
    return true;
  }

  /**
   * @param now sim time, ms
   * @param laptopOn the laptop is running
   * @returns the check that ended now, with how it ended; null while it runs or when none runs
   */
  public update(now: number, laptopOn: boolean): { manualId: string; outcome: 'done' | 'aborted' } | null {
    const running = this._running.get();
    if (running === null) {
      return null;
    }
    if (!laptopOn) {
      this._running.set(null);
      return { manualId: running.manualId, outcome: 'aborted' };
    }
    if (now >= running.endsAt) {
      this._running.set(null);
      return { manualId: running.manualId, outcome: 'done' };
    }
    return null;
  }
}

/**
 * @param running the manual is being checked
 * @param record the last check of the manual
 * @param formatDate the text of a date
 * @returns the text of the check column of the LIBRARY list
 */
export function checkStatusText(
  running: boolean,
  record: { result: OpsLibraryCheckResult; date: number } | null,
  formatDate: (ms: number) => string,
): string {
  if (running) {
    return 'Checking...';
  }
  if (record === null) {
    return '';
  }
  const word = record.result === 'success' ? 'Success' : record.result === 'failed' ? 'Failed' : 'Aborted';
  return `${word} check on ${formatDate(record.date)}`;
}
