// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  areRamAirInletsOpen,
  diffPressHiItemsToShow,
  ExcessNegativeDiffPressMonitor,
  isDiffPressHi,
  isLdgElevnFault,
  ldgElevnFaultItemsToShow,
  ramAirMemoIndex,
} from './CabPressAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata21 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata21-22-23.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');

/** The source of one alert entry of FwsAbnormalSensed, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('CAB PRESS EXCESS NEGATIVE DIFF PRESS', () => {
  it('triggers with the CPCS bit (< -0.72 PSI) and ends only above -0.32 PSI', () => {
    const monitor = new ExcessNegativeDiffPressMonitor();
    expect(monitor.update(false, -0.5)).toBe(false);
    expect(monitor.update(true, -0.8)).toBe(true);
    // The CPCS bit drops at -0.72 PSI: the warning stays until -0.32 PSI
    expect(monitor.update(false, -0.6)).toBe(true);
    expect(monitor.update(false, -0.33)).toBe(true);
    expect(monitor.update(false, -0.3)).toBe(false);
    expect(monitor.update(false, -0.5)).toBe(false);
  });

  it('ends without a valid differential pressure once the CPCS bit is gone', () => {
    const monitor = new ExcessNegativeDiffPressMonitor();
    monitor.update(true, -0.8);
    expect(monitor.update(false, null)).toBe(false);
  });

  it('is a red master warning, active in flight phases 8 and 9', () => {
    const block = alertBlock('213800003');
    expect(block).toContain('flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],');
    expect(block).toContain('simVarIsActive: this.fws.excessNegativeDiffPressure,');
    expect(block).toContain('failure: 3,');
    expect(ata21).toContain("title: '\\x1b<2m\\x1b4mCAB PRESS\\x1bm EXCESS NEGATIVE DIFF PRESS',");
  });
});

describe('CAB PRESS DIFF PRESS HI', () => {
  it('needs the automatic mode', () => {
    expect(isDiffPressHi(true, false)).toBe(true);
    expect(isDiffPressHi(true, true)).toBe(false);
    expect(isDiffPressHi(false, false)).toBe(false);
  });

  it('shows the MAN mode lines with the manual system, EXPECT HI CAB RATE without', () => {
    expect(diffPressHiItemsToShow(true)).toEqual([true, true, false]);
    expect(diffPressHiItemsToShow(false)).toEqual([false, false, true]);
  });

  it('is wired, master caution, active in flight phase 8 only', () => {
    const block = alertBlock('213800007');
    expect(block).toContain('flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],');
    expect(block).toContain('simVarIsActive: this.fws.diffPressHi,');
    expect(block).toContain('failure: 2,');
  });
});

describe('CAB PRESS DIFF PRESS LO', () => {
  it('is wired, master caution, active in flight phases 8 and 9', () => {
    const block = alertBlock('213800008');
    expect(block).toContain('flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],');
    expect(block).toContain('simVarIsActive: this.fws.diffPressLo,');
    expect(block).toContain('failure: 2,');
  });
});

describe('CAB PRESS LDG ELEVN FAULT', () => {
  it('triggers when no FMS sends a normal landing elevation', () => {
    expect(isLdgElevnFault(false, false)).toBe(true);
    expect(isLdgElevnFault(true, false)).toBe(false);
    expect(isLdgElevnFault(false, true)).toBe(false);
  });

  it('shows the backup mode lines only without the manual system', () => {
    expect(ldgElevnFaultItemsToShow(true)).toEqual([false, false, false]);
    expect(ldgElevnFaultItemsToShow(false)).toEqual([true, true, true]);
  });

  it('has a message, is wired in phase 8 only and has the LDG ELEVN deferred procedure', () => {
    expect(ata21).toContain("title: '\\x1b<4m\\x1b4mCAB PRESS\\x1bm LDG ELEVN FAULT',");
    const block = alertBlock('213800043');
    expect(block).toContain('flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],');
    expect(block).toContain('simVarIsActive: this.fws.ldgElevnFault,');
    expect(ata21).toMatch(/221700001: \{[^}]*fromAbnormalProcs: \['221800006', '213800007', '213800043'\],/);
  });
});

describe('RAM AIR memo', () => {
  it('the inlets open with the pb ON below 1 PSI', () => {
    expect(areRamAirInletsOpen(true, 0.5)).toBe(true);
    expect(areRamAirInletsOpen(true, 3)).toBe(false);
    expect(areRamAirInletsOpen(false, 0)).toBe(false);
    expect(areRamAirInletsOpen(true, null)).toBe(true);
  });

  it('green on ground with no engine running, amber in all other cases', () => {
    expect(ramAirMemoIndex(true, false)).toBe(0);
    expect(ramAirMemoIndex(true, true)).toBe(1);
    expect(ramAirMemoIndex(false, false)).toBe(1);
  });

  it('is defined and wired', () => {
    expect(messageIndex).toContain("'210000002': '\\x1b<3mRAM AIR',");
    expect(messageIndex).toContain("'210000003': '\\x1b<4mRAM AIR',");
    expect(memos).toContain('simVarIsActive: this.fws.ramAirInletsOpen,');
    expect(memos).toContain("codesToReturn: ['210000002', '210000003'],");
  });
});
