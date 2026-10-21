// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380FailureDefinitions } from '@failures';
import { DSMS_VARS } from '@shared/DoorsAndSlides';
import {
  DOOR_FAILURES,
  DSMS_CHANNEL_FAILURES,
  DsmsFailures,
  DsmsLogic,
  dsmsVarValues,
  isFlightLockCommanded,
  SLIDE_LENGTHENING_FAILURES,
} from './DoorsAndSlidesManagement';

function noFailure(): DsmsFailures {
  const doors = () => new Array(16).fill(false);
  return {
    actuator: doors(),
    flightLock: doors(),
    latchMonitoring: doors(),
    ldc: doors(),
    slide: doors(),
    slideLengthening: [false, false],
    channelsFailed: 0,
    aspsu: false,
  };
}

const doorsSet = (flags: boolean[]) => flags.map((flag, door) => (flag ? door : -1)).filter((door) => door >= 0);

describe('DSMS flight lock', () => {
  it('locks the door handles from 65 kt and below FL 240', () => {
    expect(isFlightLockCommanded(64, 0)).toBe(false);
    expect(isFlightLockCommanded(65, 0)).toBe(true);
    expect(isFlightLockCommanded(300, 23990)).toBe(true);
    expect(isFlightLockCommanded(300, 24000)).toBe(false);
  });

  it('a failed flight lock actuator stays where it was: locked when it fails in climb, unlocked when it fails parked', () => {
    const dsms = new DsmsLogic();
    const failures = noFailure();
    dsms.update(failures, true);
    failures.flightLock[3] = true;
    const cruise = dsms.update(failures, false);
    expect(cruise.flightLockEngaged[3]).toBe(true);
    expect(cruise.flightLockEngaged[2]).toBe(false);
    expect(doorsSet(cruise.flightLockFault)).toEqual([3]);

    const parked = new DsmsLogic();
    const parkedFailures = noFailure();
    parkedFailures.flightLock[4] = true;
    expect(parked.update(parkedFailures, false).flightLockEngaged[4]).toBe(false);
    expect(parked.update(parkedFailures, true).flightLockEngaged[4]).toBe(false);
  });
});

describe('DSMS door monitoring', () => {
  it('detects the faults of a monitored door', () => {
    const failures = noFailure();
    failures.actuator[1] = true;
    failures.latchMonitoring[10] = true;
    failures.slide[15] = true;
    failures.slideLengthening[0] = true;
    const outputs = new DsmsLogic().update(failures, false);
    expect(doorsSet(outputs.actuatorFault)).toEqual([1]);
    expect(doorsSet(outputs.latchMonitoringFault)).toEqual([10]);
    expect(doorsSet(outputs.slideFault)).toEqual([15]);
    expect(outputs.slideLengtheningFault).toEqual([true, false]);
    expect(outputs.positionInvalid.some((invalid) => invalid)).toBe(false);
  });

  it('a failed LDC: unknown door position, no fault detected on the door, flight lock released', () => {
    const dsms = new DsmsLogic();
    const failures = noFailure();
    dsms.update(failures, true);
    failures.ldc[0] = true;
    failures.actuator[0] = true;
    failures.slideLengthening[0] = true;
    const outputs = dsms.update(failures, true);
    expect(doorsSet(outputs.positionInvalid)).toEqual([0]);
    expect(doorsSet(outputs.ldcFault)).toEqual([0]);
    expect(outputs.actuatorFault[0] || outputs.slideLengtheningFault[0]).toBe(false);
    expect(outputs.flightLockEngaged[0]).toBe(false);
    expect(outputs.flightLockEngaged[1]).toBe(true);
  });

  it('three DSMS channels lost: no door monitored; one or two lost: every door still monitored', () => {
    const failures = noFailure();
    failures.slide[6] = true;
    failures.channelsFailed = 2;
    expect(new DsmsLogic().update(failures, false).slideFault[6]).toBe(true);
    failures.channelsFailed = 3;
    const outputs = new DsmsLogic().update(failures, true);
    expect(outputs.positionInvalid.every((invalid) => invalid)).toBe(true);
    expect(outputs.slideFault[6]).toBe(false);
    expect(outputs.flightLockEngaged.some((engaged) => engaged)).toBe(false);
    expect(outputs.channelsFailed).toBe(3);
  });

  it('publishes the ASPSU failure as the loss of the residual pressure detection', () => {
    const failures = noFailure();
    failures.aspsu = true;
    expect(new DsmsLogic().update(failures, false).residualPressureDetectionFault).toBe(true);
  });

  it('writes the per-door outputs as bit fields', () => {
    const failures = noFailure();
    failures.actuator[0] = true;
    failures.actuator[15] = true;
    failures.channelsFailed = 1;
    const values = new Map(dsmsVarValues(new DsmsLogic().update(failures, false)));
    expect(values.get(DSMS_VARS.actuatorFault)).toBe(1 + (1 << 15));
    expect(values.get(DSMS_VARS.channelsFailed)).toBe(1);
    expect(values.get(DSMS_VARS.positionInvalid)).toBe(0);
  });
});

describe('DSMS flyPad failures', () => {
  const nameOf = (id: number) => A380FailureDefinitions.find(([, listed]) => listed === id);

  it('has one failure of each kind per passenger door, listed in ATA 52 with the door name', () => {
    const expected: [keyof typeof DOOR_FAILURES, number, string][] = [
      ['Actuator', 52200, 'opening/closing actuator'],
      ['FlightLock', 52220, 'flight lock actuator'],
      ['LatchMonitoring', 52240, 'latch monitoring (LDC)'],
      ['Ldc', 52260, 'local door controller (LDC)'],
      ['Slide', 52280, 'escape slide'],
    ];
    for (const [kind, firstId, part] of expected) {
      expect(DOOR_FAILURES[kind]).toEqual(Array.from({ length: 16 }, (_, door) => firstId + door));
      expect(nameOf(firstId)).toEqual([52, firstId, `Door main 1L ${part}`]);
      expect(nameOf(firstId + 15)).toEqual([52, firstId + 15, `Door upper 3R ${part}`]);
    }
  });

  it('lists the slide extension, DSMS channel and ASPSU failures in ATA 52', () => {
    expect(SLIDE_LENGTHENING_FAILURES).toEqual([52300, 52301]);
    expect(DSMS_CHANNEL_FAILURES).toEqual([52310, 52311, 52312]);
    expect(nameOf(52301)).toEqual([52, 52301, 'Door main 1R slide extension sill height sensors']);
    expect(nameOf(52312)).toEqual([52, 52312, 'DSMS channel 3']);
    expect(nameOf(52320)?.[0]).toBe(52);
  });
});
