// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import {
  AIR_PACK_PHASE_INHIBITION,
  AirPackAlertKeys,
  AirPackAlerts,
  AirPackFailuresSource,
  AirPackInputs,
  isPackOverheatAlert,
} from './AirPackAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

class TestFailures implements AirPackFailuresSource {
  public readonly registered: number[] = [];

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(): boolean {
    return false;
  }
}

const normal: AirPackInputs = { overheat: false, pbOn: true, regulationFailed: false };

const active = (alerts: AirPackAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

describe('AIR PACK 1(2) OVHT', () => {
  it('on with the compressor outlet overheat (above 260 deg C) of the systems', () => {
    expect(isPackOverheatAlert(normal, false)).toBe(false);
    expect(isPackOverheatAlert({ ...normal, overheat: true }, false)).toBe(true);
  });

  it('stays while the pack is OFF after the overheat, goes when the crew sets the pack ON again', () => {
    expect(isPackOverheatAlert({ ...normal, pbOn: false }, true)).toBe(true);
    expect(isPackOverheatAlert({ ...normal, pbOn: true }, true)).toBe(false);
    // the overheat protection reopens the valve with the pb-sw left ON: nothing left to do
    expect(isPackOverheatAlert({ ...normal, pbOn: false }, false)).toBe(false);
  });

  it('-PACK OFF, then .WHEN PACK OVHT OUT: -PACK ON; STATUS and INOP SYS PACK 1', () => {
    const alerts = new AirPackAlerts(new TestFailures());
    const item = alerts.ewdFailures[AirPackAlertKeys.overheat[0]];
    alerts.updateAlerts([{ ...normal, overheat: true }, normal]);
    expect(item.simVarIsActive.get()).toBe(true);
    expect(active(alerts, AirPackAlertKeys.overheat[1])).toBe(false);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(ewdLines(item)).toEqual(['AIR PACK 1 OVHT', ' -PACK 1.............OFF']);

    alerts.updateAlerts([{ ...normal, overheat: true, pbOn: false }, normal]);
    expect(ewdLines(item)).toEqual(['AIR PACK 1 OVHT', '  .WHEN PACK OVHT OUT:', ' -PACK 1..............ON']);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() })).toEqual({
      left: ['WHEN PACK OVHT OUT:', 'PACK 1...............ON'],
      right: ['INOP SYS', 'PACK 1'],
    });

    alerts.updateAlerts([{ ...normal, pbOn: false }, normal]);
    expect(item.simVarIsActive.get()).toBe(true);
    alerts.updateAlerts([normal, normal]);
    expect(item.simVarIsActive.get()).toBe(false);
  });
});

describe('AIR PACK 1(2) REGUL FAULT', () => {
  it('registers the pack regulation failures 21029 and 21030', () => {
    const failures = new TestFailures();
    new AirPackAlerts(failures).init();
    expect(failures.registered).toEqual([A320Failure.Pack1Regulation, A320Failure.Pack2Regulation]);
  });

  it('crew awareness with the failure, INOP SYS PACK 2 REGUL, phases 3, 4, 5, 7, 8', () => {
    const alerts = new AirPackAlerts(new TestFailures());
    const item = alerts.ewdFailures[AirPackAlertKeys.regulationFault[1]];
    alerts.updateAlerts([normal, normal]);
    expect(item.simVarIsActive.get()).toBe(false);
    alerts.updateAlerts([normal, { ...normal, regulationFailed: true }]);
    expect(item.simVarIsActive.get()).toBe(true);
    expect(active(alerts, AirPackAlertKeys.regulationFault[0])).toBe(false);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual(AIR_PACK_PHASE_INHIBITION);
    expect(ewdLines(item)).toEqual(['AIR PACK 2 REGUL FAULT']);
    expect(statusLines({ left: [], inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'PACK 2 REGUL']);
  });

  it('the PseudoFWC registers, updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('this.airPackAlerts.init();');
    expect(fwc).toContain('this.airPackAlerts.update();');
    expect(fwc).toContain('...this.airPackAlerts.ewdFailures,');
  });
});
