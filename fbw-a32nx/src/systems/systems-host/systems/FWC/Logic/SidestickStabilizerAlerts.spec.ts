// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import { FcdcDiscreteWord } from './FlightControlSurfaceAlerts';
import {
  SIDESTICK_FAULT_PHASE_INHIBITION,
  SIDESTICK_PRIORITY_PHASE_INHIBITION,
  STABILIZER_JAM_PHASE_INHIBITION,
  SidestickStabilizerAlerts,
  SidestickStabilizerFailuresSource,
  SidestickStabilizerKeys,
} from './SidestickStabilizerAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements SidestickStabilizerFailuresSource {
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

const ELAC_1_INVALID = 23;
const ELAC_2_INVALID = 24;
const SEC_1_INVALID = 25;
const SEC_2_INVALID = 26;
const SEC_3_INVALID = 29;

/** An FCDC discrete word 1 with the given computers reported not valid; a failed FCDC sends no word */
const fcdcWord = (invalidBits: number[] = [], valid = true): FcdcDiscreteWord => ({
  isNormalOperation: () => valid,
  bitValueOr: (bit, valueIfInvalid) => (valid ? invalidBits.includes(bit) : valueIfInvalid),
});

const alertsWith = (failed: number[], fcdc1 = fcdcWord(), fcdc2 = fcdcWord()) => {
  const failures = new TestFailures();
  failed.forEach((failure) => failures.active.add(failure));
  const alerts = new SidestickStabilizerAlerts(failures);
  alerts.init();
  alerts.update({ fcdc1Word1: fcdc1, fcdc2Word1: fcdc2 });
  return { alerts, failures };
};

const activeKeys = (alerts: SidestickStabilizerAlerts) =>
  Object.keys(alerts.ewdFailures).filter((key) => alerts.ewdFailures[key].simVarIsActive.get());

const status = (alerts: SidestickStabilizerAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  return statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });
};

describe('F/CTL sidestick and stabilizer cautions', () => {
  it('registers the failures and shows nothing without them', () => {
    const { alerts, failures } = alertsWith([]);
    expect(failures.registered).toEqual([
      A320Failure.CaptSidestick,
      A320Failure.FoSidestick,
      A320Failure.SidestickPriorityLogic,
      A320Failure.StabilizerElecControl,
    ]);
    expect(activeKeys(alerts)).toEqual([]);
  });

  it.each([
    [A320Failure.CaptSidestick, SidestickStabilizerKeys.leftSidestickFault, 'L', 'F/CTL L SIDESTICK FAULT'],
    [A320Failure.FoSidestick, SidestickStabilizerKeys.rightSidestickFault, 'R', 'F/CTL R SIDESTICK FAULT'],
  ] as const)(
    'failure %i raises the %s crew awareness caution with INOP SYS %s SIDESTICK',
    (failure, key, side, title) => {
      const { alerts, failures } = alertsWith([failure]);
      expect(activeKeys(alerts)).toEqual([key]);
      const item = alerts.ewdFailures[key];
      expect(ewdLines(item)).toEqual([title]);
      expect(item.failure).toBe(1);
      expect(item.flightPhaseInhib).toEqual(SIDESTICK_FAULT_PHASE_INHIBITION);
      expect(status(alerts, key)).toEqual({ left: [], right: ['INOP SYS', `${side} SIDESTICK`] });

      failures.active.delete(failure);
      alerts.update({ fcdc1Word1: fcdcWord(), fcdc2Word1: fcdcWord() });
      expect(activeKeys(alerts)).toEqual([]);
    },
  );

  it('raises SIDESTICK PRIORITY, a caution shown on the ground before the engine start and after landing only', () => {
    const { alerts } = alertsWith([A320Failure.SidestickPriorityLogic]);
    expect(activeKeys(alerts)).toEqual([SidestickStabilizerKeys.sidestickPriority]);
    const item = alerts.ewdFailures[SidestickStabilizerKeys.sidestickPriority];
    expect(ewdLines(item)).toEqual(['F/CTL SIDESTICK PRIORITY', ' -CHECK PRIORITY LOGIC']);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual(SIDESTICK_PRIORITY_PHASE_INHIBITION);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('raises STABILIZER JAM with its procedure, STATUS and INOP SYS, inhibited at takeoff', () => {
    const { alerts } = alertsWith([A320Failure.StabilizerElecControl]);
    expect(activeKeys(alerts)).toEqual([SidestickStabilizerKeys.stabilizerJam]);
    const item = alerts.ewdFailures[SidestickStabilizerKeys.stabilizerJam];
    expect(ewdLines(item)).toEqual([
      'F/CTL STABILIZER JAM',
      ' -MAN PITCH TRIM...CHECK',
      '  .IF MAN TRIM AVAIL:',
      ' -TRIM FOR NEUTRAL ELEV',
    ]);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual(STABILIZER_JAM_PHASE_INHIBITION);
    expect(item.flightPhaseInhib).toEqual([4, 5]);
    expect(status(alerts, SidestickStabilizerKeys.stabilizerJam)).toEqual({
      left: [
        'MAX SPEED........320 KT',
        'APPR PROC:',
        'FOR LDG......USE FLAP 3',
        'GPWS LDG FLAP 3......ON',
        'IF MAN TRIM NOT AVAIL:',
        'WHEN CONF 3 AND VAPP:',
        'L/G.................DN',
        'APPR SPD.....VREF+10 KT',
        'LDG DIST PROC....APPLY',
        'ALTN LAW: PROT LOST',
        'WHEN L/G DN: DIRECT LAW',
      ],
      right: ['INOP SYS', 'F/CTL PROT', 'STABILIZER', 'ELAC PITCH', 'AP 1+2', 'CAT 2'],
    });
  });

  it('needs a flight control computer that an FCDC reports valid to detect the failures', () => {
    const all = [
      A320Failure.CaptSidestick,
      A320Failure.FoSidestick,
      A320Failure.SidestickPriorityLogic,
      A320Failure.StabilizerElecControl,
    ];
    const allComputersInvalid = [ELAC_1_INVALID, ELAC_2_INVALID, SEC_1_INVALID, SEC_2_INVALID, SEC_3_INVALID];
    expect(activeKeys(alertsWith(all, fcdcWord(allComputersInvalid), fcdcWord(allComputersInvalid)).alerts)).toEqual(
      [],
    );
    expect(activeKeys(alertsWith(all, fcdcWord([], false), fcdcWord([], false)).alerts)).toEqual([]);

    // SEC 3 alone reads the sidesticks but does not control the THS
    const sec3Only = [ELAC_1_INVALID, ELAC_2_INVALID, SEC_1_INVALID, SEC_2_INVALID];
    expect(activeKeys(alertsWith(all, fcdcWord(sec3Only), fcdcWord([], false)).alerts)).toEqual([
      SidestickStabilizerKeys.leftSidestickFault,
      SidestickStabilizerKeys.rightSidestickFault,
      SidestickStabilizerKeys.sidestickPriority,
    ]);
  });
});

describe('PseudoFWC wiring of the sidestick and stabilizer cautions', () => {
  it('adds the items, registers the failures and updates them from the FCDC discrete words 1', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.sidestickStabilizerAlerts.ewdFailures,');
    expect(fwc).toContain('this.sidestickStabilizerAlerts.init();');
    expect(fwc).toContain(
      'this.sidestickStabilizerAlerts.update({ fcdc1Word1: fcdc1DiscreteWord1, fcdc2Word1: fcdc2DiscreteWord1 });',
    );
  });
});
