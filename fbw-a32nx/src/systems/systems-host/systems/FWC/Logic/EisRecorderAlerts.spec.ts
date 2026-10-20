// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DmcSwitchingKnob } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import {
  DMC_FAULT_PHASE_5_INHIBITION_SECONDS,
  EIS_RECORDER_FAILURES,
  EisRecorderAlertKeys,
  EisRecorderAlerts,
  EisRecorderFailuresSource,
} from './EisRecorderAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements EisRecorderFailuresSource {
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

const CRUISE = 6;

function alertsWith(failures: number[], knob = DmcSwitchingKnob.Norm, flightPhase = CRUISE) {
  const consumer = new TestFailures();
  const alerts = new EisRecorderAlerts(consumer);
  alerts.init();
  failures.forEach((failure) => consumer.active.add(failure));
  alerts.update(knob, flightPhase, 1);
  return { alerts, consumer };
}

const active = (alerts: EisRecorderAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

const K = EisRecorderAlertKeys;

describe('EIS, FWS and RECORDER alerts', () => {
  it('registers the eight TS only failures 31009-31016', () => {
    const { consumer } = alertsWith([]);
    expect(consumer.registered).toEqual(EIS_RECORDER_FAILURES);
    expect(EIS_RECORDER_FAILURES).toEqual([31009, 31010, 31011, 31012, 31013, 31014, 31015, 31016]);
  });

  it('shows nothing without a failure', () => {
    const { alerts } = alertsWith([]);
    for (const key of Object.keys(alerts.ewdFailures)) {
      expect(active(alerts, key)).toBe(false);
    }
  });

  describe('EIS DMC 1(2)(3) FAULT', () => {
    it('DMC 1: -EIS DMC SWITCH CAPT 3 until the selector is there, INOP SYS DMC 1, level 2', () => {
      const { alerts } = alertsWith([A320Failure.Dmc1]);
      const item = alerts.ewdFailures[K.dmcFault[0]];
      expect(item.simVarIsActive.get()).toBe(true);
      expect(item.failure).toBe(2);
      expect(ewdLines(item)).toEqual(['EIS DMC 1 FAULT', ' -EIS DMC SWITCH..CAPT 3']);
      expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'DMC 1']);

      alerts.update(DmcSwitchingKnob.Capt, CRUISE, 1);
      expect(ewdLines(item)).toEqual(['EIS DMC 1 FAULT']);
    });

    it('DMC 2: -EIS DMC SWITCH F/O 3', () => {
      const { alerts } = alertsWith([A320Failure.Dmc2]);
      const item = alerts.ewdFailures[K.dmcFault[1]];
      expect(ewdLines(item)).toEqual(['EIS DMC 2 FAULT', ' -EIS DMC SWITCH...F/O 3']);
      alerts.update(DmcSwitchingKnob.Fo, CRUISE, 1);
      expect(ewdLines(item)).toEqual(['EIS DMC 2 FAULT']);
    });

    it('DMC 3: crew awareness, INOP SYS DMC 3', () => {
      const { alerts } = alertsWith([A320Failure.Dmc3]);
      const item = alerts.ewdFailures[K.dmcFault[2]];
      expect(item.simVarIsActive.get()).toBe(true);
      expect(item.failure).toBe(1);
      expect(ewdLines(item)).toEqual(['EIS DMC 3 FAULT']);
      expect(item.inopSys()).toEqual(['240300150']);
    });

    it('is inhibited in phases 3, 4, 7, 8 and in the first 15 s of phase 5', () => {
      expect(new EisRecorderAlerts(new TestFailures()).ewdFailures[K.dmcFault[0]].flightPhaseInhib).toEqual([
        3, 4, 7, 8,
      ]);
      const { alerts } = alertsWith([A320Failure.Dmc1], DmcSwitchingKnob.Norm, 5);
      for (let second = 2; second < DMC_FAULT_PHASE_5_INHIBITION_SECONDS; second++) {
        alerts.update(DmcSwitchingKnob.Norm, 5, 1);
      }
      expect(active(alerts, K.dmcFault[0])).toBe(false);
      alerts.update(DmcSwitchingKnob.Norm, 5, 1);
      expect(active(alerts, K.dmcFault[0])).toBe(true);
    });
  });

  it('EIS DMC/FWC COM FAULT: the DMC buses failure or all three DMCs failed, crew awareness in phases 1 and 10', () => {
    expect(active(alertsWith([A320Failure.DmcFwcBuses]).alerts, K.dmcFwcComFault)).toBe(true);
    expect(active(alertsWith([A320Failure.Dmc1, A320Failure.Dmc2]).alerts, K.dmcFwcComFault)).toBe(false);
    expect(active(alertsWith([A320Failure.Dmc1, A320Failure.Dmc2, A320Failure.Dmc3]).alerts, K.dmcFwcComFault)).toBe(
      true,
    );
    const item = alertsWith([A320Failure.DmcFwcBuses]).alerts.ewdFailures[K.dmcFwcComFault];
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ewdLines(item)).toEqual(['EIS DMC/FWC COM FAULT']);
  });

  describe('FWS SDAC FAULT', () => {
    it('SDAC 1(2) FAULT: crew awareness, INOP SYS SDAC 1(2), phases 3, 4, 5, 7, 8', () => {
      const { alerts } = alertsWith([A320Failure.Sdac2]);
      expect(active(alerts, K.sdacFault[0])).toBe(false);
      const item = alerts.ewdFailures[K.sdacFault[1]];
      expect(item.simVarIsActive.get()).toBe(true);
      expect(item.failure).toBe(1);
      expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
      expect(ewdLines(item)).toEqual(['FWS SDAC 2 FAULT']);
      expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'SDAC 2']);
    });

    it('SDAC 1+2 FAULT replaces both single alerts: MONITOR OVERHEAD PANEL, the SD pages left, phases 4, 5, 7, 8', () => {
      const { alerts } = alertsWith([A320Failure.Sdac1, A320Failure.Sdac2]);
      expect(active(alerts, K.sdacFault[0])).toBe(false);
      expect(active(alerts, K.sdacFault[1])).toBe(false);
      const item = alerts.ewdFailures[K.sdac1And2Fault];
      expect(item.simVarIsActive.get()).toBe(true);
      expect(item.failure).toBe(2);
      expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
      expect(ewdLines(item)).toEqual([
        'FWS SDAC 1+2 FAULT',
        ' -MONITOR OVERHEAD PANEL',
        'ECAM ENG FUEL F/CTL',
        'WHEEL (L/G POS IND)',
        'SYS PAGES AVAIL',
      ]);
      expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'SDAC 1+2']);
    });
  });

  it('RECORDER DFDR FAULT and SYS FAULT: crew awareness, INOP SYS DFDR / RECORDER SYS, phases 3, 4, 5, 7, 8', () => {
    const { alerts } = alertsWith([A320Failure.Dfdr, A320Failure.Fdiu]);
    const dfdr = alerts.ewdFailures[K.dfdrFault];
    const system = alerts.ewdFailures[K.recorderSysFault];
    expect(dfdr.simVarIsActive.get()).toBe(true);
    expect(system.simVarIsActive.get()).toBe(true);
    expect([dfdr.failure, system.failure]).toEqual([1, 1]);
    expect(dfdr.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(ewdLines(dfdr)).toEqual(['RECORDER DFDR FAULT']);
    expect(ewdLines(system)).toEqual(['RECORDER SYS FAULT']);
    expect(statusLines({ left: [], inopSys: [...dfdr.inopSys(), ...system.inopSys()] }).right).toEqual([
      'INOP SYS',
      'DFDR',
      'RECORDER SYS',
    ]);
  });

  it('the PseudoFWC registers, updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('this.eisRecorderAlerts.init();');
    expect(fwc).toContain('this.eisRecorderAlerts.update(');
    expect(fwc).toContain('...this.eisRecorderAlerts.ewdFailures,');
  });
});
