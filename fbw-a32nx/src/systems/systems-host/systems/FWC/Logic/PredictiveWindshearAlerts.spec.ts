// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  PRED_WS_DET_FAULT_KEY,
  PRED_WS_DET_FAULT_PHASE_INHIBITION,
  PredictiveWindshearAlerts,
  PredictiveWindshearFailuresSource,
  predWsDetFaultAlert,
  predWsDetFaultStatus,
} from './PredictiveWindshearAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements PredictiveWindshearFailuresSource {
  public readonly registered: number[] = [];

  public readonly active = new Set<number>();

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '');

describe('NAV PRED W/S DET FAULT', () => {
  it('triggers when the predictive windshear function is lost', () => {
    expect(predWsDetFaultAlert({ predictiveWindshearFailed: true })).toBe(true);
    expect(predWsDetFaultAlert({ predictiveWindshearFailed: false })).toBe(false);
  });

  it('follows the flyPad failure of the predictive windshear function', () => {
    const failures = new TestFailures();
    const alerts = new PredictiveWindshearAlerts(failures);
    alerts.init();
    expect(failures.registered).toEqual([A320Failure.WxrPredictiveWindshear]);
    const item = alerts.ewdFailures[PRED_WS_DET_FAULT_KEY];

    alerts.update();
    expect(item.simVarIsActive.get()).toBe(false);

    failures.active.add(A320Failure.WxrPredictiveWindshear);
    alerts.update();
    expect(item.simVarIsActive.get()).toBe(true);

    failures.active.clear();
    alerts.update();
    expect(item.simVarIsActive.get()).toBe(false);
  });

  it('is crew awareness without SD page, inhibited in phases 3, 4, 5, 8', () => {
    const item = new PredictiveWindshearAlerts(new TestFailures()).ewdFailures[PRED_WS_DET_FAULT_KEY];
    expect(item.failure).toBe(1);
    expect(item.sysPage).toBe(-1); // SdPages.NONE
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 8]);
    expect(PRED_WS_DET_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 8]);
    expect(item.whichCodeToReturn()).toEqual([0]);
  });

  it('E/WD title NAV PRED W/S DET FAULT and STATUS INOP SYS PRED W/S DET', () => {
    const item = new PredictiveWindshearAlerts(new TestFailures()).ewdFailures[PRED_WS_DET_FAULT_KEY];
    expect(item.codesToReturn).toEqual(['340090001']);
    expect(visible(formatEwdMessages(item.codesToReturn)[0]).trim()).toBe('NAV PRED W/S DET FAULT');
    const status = predWsDetFaultStatus();
    expect(item.inopSys()).toEqual(status.inopSys);
    expect(item.statusInfo()).toEqual([]);
    expect(visible(formatStatusPage(status.left, status.inopSys).right)).toContain('PRED W/S DET');
  });

  it('the PseudoFWC updates it and adds it to its alerts', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.predictiveWindshearAlerts.init();');
    expect(fwc).toContain('this.predictiveWindshearAlerts.update();');
    expect(fwc).toContain('...this.predictiveWindshearAlerts.ewdFailures,');
  });
});
