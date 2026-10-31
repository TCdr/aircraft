// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A320Failure } from '@failures';
import { IdgCoolingAlertKeys, IdgCoolingAlerts, IdgCoolingFailuresSource } from './IdgCoolingAlerts';
import { ewdLines } from './FwcAlertSpecHelpers';
import { fwcModule, isAlertTriggered, setActiveFailures, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

class TestFailures implements IdgCoolingFailuresSource {
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

describe('FUEL IDG 1(2) COOL FAULT', () => {
  it('registers the TS only failures 28018 and 28019', () => {
    const failures = new TestFailures();
    new IdgCoolingAlerts(failures).init();
    expect(failures.registered).toEqual([A320Failure.Idg1FuelCoolingCommand, A320Failure.Idg2FuelCoolingCommand]);
    expect(failures.registered).toEqual([28018, 28019]);
  });

  it('follows the failure of its IDG: crew awareness, no STATUS, shown in phases 1 and 10 only', () => {
    const failures = new TestFailures();
    const alerts = new IdgCoolingAlerts(failures);
    const [idg1, idg2] = IdgCoolingAlertKeys.coolFault.map((key) => alerts.ewdFailures[key]);
    alerts.update();
    expect(idg2.simVarIsActive.get()).toBe(false);

    failures.active.add(A320Failure.Idg2FuelCoolingCommand);
    alerts.update();
    expect(idg2.simVarIsActive.get()).toBe(true);
    expect(idg1.simVarIsActive.get()).toBe(false);
    expect(idg2.failure).toBe(1);
    expect(idg2.flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ewdLines(idg2)).toEqual(['FUEL IDG 2 COOL FAULT']);
    expect([...idg2.statusInfo(), ...idg2.inopSys()]).toEqual([]);

    failures.active.clear();
    alerts.update();
    expect(idg2.simVarIsActive.get()).toBe(false);
  });

  it('the real PseudoFWC raises the alert of the IDG whose cooling failure is active', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    const [idg1, idg2] = IdgCoolingAlertKeys.coolFault;
    expect([isAlertTriggered(fwc, idg1), isAlertTriggered(fwc, idg2)]).toEqual([false, false]);
    setActiveFailures(fwcModule(fwc, 'idgCoolingAlerts'), [A320Failure.Idg2FuelCoolingCommand]);
    runFwc(fwc, 1);
    expect([isAlertTriggered(fwc, idg1), isAlertTriggered(fwc, idg2)]).toEqual([false, true]);
  });
});
