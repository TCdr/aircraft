// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure, A380FailureDefinitions } from '@failures';
import {
  ConfigSidestickMonitor,
  FCTL_SENSOR_ALERT_KEYS,
  FCTL_SENSOR_PHASE_INHIBITION,
  FctlSensorAlerts,
  FctlSensorInputs,
  fctlSensorAbnormalItems,
  fctlSensorAlertFlags,
  fctlSensorDeferredItems,
  lostSpoilerCount,
  SidestickTakeoverLock,
} from './FwsFctlSensorAlerts';

/*
 * The EcamMessages tables are read from the source text (importing EcamMessages in a test fails on a circular import).
 */
const ecamDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ecamMessages = readFileSync(resolve(ecamDir, 'index.ts'), 'utf-8');
const ata27 = readFileSync(resolve(ecamDir, 'AbnormalSensed/ata27.ts'), 'utf-8');

/** Text of a line of an EcamMessages table, without its ECAM colour code */
function text(table: 'EcamInopSys' | 'EcamLimitations', key: string): string | undefined {
  const start = ecamMessages.indexOf(`export const ${table}`);
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'?${key}'?: '\\\\x1b<\\d+m([^']*)',`, 'm'));
  return line ? line[1].trim() : undefined;
}

/** Title (without the colour and underline codes) and item names of an ata27.ts procedure */
function procedure(key: number): { title: string; items: string[] } | undefined {
  const start = ata27.indexOf(`\n  ${key}: {`);
  if (start < 0) {
    return undefined;
  }
  const block = ata27.slice(start, ata27.indexOf('\n  },', start));
  const title = (block.match(/title: '([^']*)'/)?.[1] ?? '').replace(/\\x1b<?\d*m/g, '').replace('\\x1b', '');
  const items = [...block.matchAll(/name: '([^']*)'/g)].map((m) => m[1]);
  return { title, items };
}

/** Inputs of a normal aircraft on the ground: all computers healthy, no failure */
function normal(failures: number[] = []): FctlSensorInputs {
  return {
    flightPhase: 1,
    toConfigTest: false,
    taxiInFlapsLever0For1Min: false,
    primHealthy: [true, true, true],
    secHealthy: [true, true, true],
    captTakeoverPbPressed: false,
    foTakeoverPbPressed: false,
    deltaTimeSeconds: 0.1,
    isFailureActive: (failure) => failures.includes(failure),
  };
}

const flagsWith = (...failures: number[]) => fctlSensorAlertFlags(normal(failures));

describe('F/CTL sensor alert conditions', () => {
  it('raises no alert on a normal aircraft', () => {
    const flags = flagsWith();
    expect(Object.values(flags).every((flag) => (Array.isArray(flag) ? flag.every((f) => !f) : !flag))).toBe(true);
  });

  it('raises L(R) SIDESTICK FAULT from the sidestick failures while a PRIM runs', () => {
    expect(flagsWith(A380Failure.CaptSidestick).sidestickFault).toEqual([true, false]);
    expect(flagsWith(A380Failure.FoSidestick).sidestickFault).toEqual([false, true]);
    expect(
      fctlSensorAlertFlags({ ...normal([A380Failure.CaptSidestick]), primHealthy: [false, false, false] })
        .sidestickFault,
    ).toEqual([false, false]);
  });

  it('raises SIDESTICK SENSOR FAULT when two or three PRIMs see the failed sensor, PRIM n SIDESTICK SENSOR when one does', () => {
    expect(flagsWith(A380Failure.CaptSidestickSensor).sidestickSensorFault).toEqual([true, false]);
    expect(flagsWith(A380Failure.CaptSidestickSensor).primSidestickSensorFault).toEqual([false, false, false]);
    const onePrim = fctlSensorAlertFlags({
      ...normal([A380Failure.FoSidestickSensor]),
      primHealthy: [false, true, false],
    });
    expect(onePrim.sidestickSensorFault).toEqual([false, false]);
    expect(onePrim.primSidestickSensorFault).toEqual([false, true, false]);
    expect(flagsWith(A380Failure.Prim3SidestickSensorChannel).primSidestickSensorFault).toEqual([false, false, true]);
    // A failed sidestick covers its sensors
    expect(flagsWith(A380Failure.CaptSidestick, A380Failure.CaptSidestickSensor).sidestickSensorFault).toEqual([
      false,
      false,
    ]);
  });

  it('raises SIDESTICK PRIORITY FAULT when a running PRIM lost the priority function', () => {
    expect(flagsWith(A380Failure.Prim2SidestickPriority).sidestickPriorityFault).toBe(true);
    expect(
      fctlSensorAlertFlags({ ...normal([A380Failure.Prim2SidestickPriority]), primHealthy: [true, false, true] })
        .sidestickPriorityFault,
    ).toBe(false);
  });

  it('raises RUDDER PEDAL FAULT, RUDDER PEDAL SENSOR FAULT and the rudder pressure sensor alerts', () => {
    expect(flagsWith(A380Failure.RudderPedalTransducers).rudderPedalFault).toBe(true);
    expect(flagsWith(A380Failure.RudderPedalSensor).rudderPedalSensorFault).toBe(true);
    expect(flagsWith(A380Failure.RudderPedalSensor, A380Failure.RudderPedalTransducers).rudderPedalSensorFault).toBe(
      false,
    );
    const upper = flagsWith(A380Failure.UpperRudderPressureSensor);
    expect([upper.rudderPressureSensorFault, upper.doubleRudderPressureSensorFault]).toEqual([true, false]);
    const both = flagsWith(A380Failure.UpperRudderPressureSensor, A380Failure.LowerRudderPressureSensor);
    expect([both.rudderPressureSensorFault, both.doubleRudderPressureSensorFault]).toEqual([false, true]);
  });

  it('raises RUDDER TRIM 1(2) FAULT for one motor and RUDDER TRIM FAULT when both trim channels are lost', () => {
    expect(flagsWith(A380Failure.RudderTrimMotor1).rudderTrimSingleFault).toEqual([true, false]);
    expect(flagsWith(A380Failure.RudderTrimMotor1).rudderTrimFault).toBe(false);
    const both = flagsWith(A380Failure.RudderTrimMotor1, A380Failure.RudderTrimMotor2);
    expect([both.rudderTrimFault, ...both.rudderTrimSingleFault]).toEqual([true, false, false]);
    // motor 2 failed with SEC 1 failed: SEC 3 cannot trim, SEC 1 cannot either
    const motor2Sec1 = fctlSensorAlertFlags({
      ...normal([A380Failure.RudderTrimMotor2]),
      secHealthy: [false, true, true],
    });
    expect(motor2Sec1.rudderTrimFault).toBe(true);
    // SEC 1 and SEC 3 failed without a motor failure: the SEC alerts cover it
    expect(fctlSensorAlertFlags({ ...normal(), secHealthy: [false, true, false] }).rudderTrimFault).toBe(false);
  });

  it('raises GND SPLRs FAULT without the PRIM wheel speeds and SPEED BRAKES FAULT without the lever', () => {
    expect(flagsWith(A380Failure.PrimWheelSpeedInputs).gndSplrsFault).toBe(true);
    expect(flagsWith(A380Failure.SpeedBrakesLever).speedBrakesFault).toBe(true);
  });

  it('counts the failed spoilers and their inhibited symmetric spoilers, except spoilers 5 and 6', () => {
    const none = Array(8).fill(false);
    const left3 = [...none];
    left3[2] = true;
    expect(lostSpoilerCount(left3, none)).toBe(2);
    const left5 = [...none];
    left5[4] = true;
    expect(lostSpoilerCount(left5, none)).toBe(1);
    expect(lostSpoilerCount(left3, left3)).toBe(2);
  });

  it('raises PART SPLRs FAULT for one to eight spoilers lost and MOST SPLRs FAULT from nine', () => {
    const one = flagsWith(A380Failure.LeftSpoiler3Actuator);
    expect([one.partSplrsFault, one.mostSplrsFault]).toEqual([true, false]);
    const four = flagsWith(
      A380Failure.LeftSpoiler1Actuator,
      A380Failure.LeftSpoiler2Actuator,
      A380Failure.LeftSpoiler3Actuator,
      A380Failure.LeftSpoiler4Actuator,
    );
    expect([four.partSplrsFault, four.mostSplrsFault]).toEqual([true, false]);
    const five = flagsWith(
      A380Failure.LeftSpoiler1Actuator,
      A380Failure.LeftSpoiler2Actuator,
      A380Failure.LeftSpoiler3Actuator,
      A380Failure.LeftSpoiler4Actuator,
      A380Failure.RightSpoiler7Actuator,
    );
    expect([five.partSplrsFault, five.mostSplrsFault]).toEqual([false, true]);
    // spoilers 1 to 4 with their symmetric ones (8) and spoiler 5, which keeps its symmetric one: nine
    const nine = flagsWith(
      A380Failure.LeftSpoiler1Actuator,
      A380Failure.LeftSpoiler2Actuator,
      A380Failure.LeftSpoiler3Actuator,
      A380Failure.LeftSpoiler4Actuator,
      A380Failure.LeftSpoiler5Actuator,
    );
    expect([nine.partSplrsFault, nine.mostSplrsFault]).toEqual([false, true]);
  });

  it('raises LOAD ALLEVIATION FAULT with two of the three accelerometers of one wing failed', () => {
    expect(flagsWith(A380Failure.LeftWingLafAccelerometer1).loadAlleviationFault).toBe(false);
    expect(
      flagsWith(A380Failure.LeftWingLafAccelerometer1, A380Failure.RightWingLafAccelerometer1).loadAlleviationFault,
    ).toBe(false);
    expect(
      flagsWith(A380Failure.RightWingLafAccelerometer1, A380Failure.RightWingLafAccelerometer3).loadAlleviationFault,
    ).toBe(true);
  });

  it('raises TWO GYROMETERs FAULT with two gyrometers failed', () => {
    expect(flagsWith(A380Failure.FlightControlGyrometer4).twoGyrometersFault).toBe(false);
    expect(flagsWith(A380Failure.FlightControlGyrometer1, A380Failure.FlightControlGyrometer6).twoGyrometersFault).toBe(
      true,
    );
  });

  it('raises the VERSIONS and PIN PROG DISAGREE alerts with two computers to compare', () => {
    expect(flagsWith(A380Failure.PrimSoftwareVersions).primVersionsDisagree).toBe(true);
    expect(flagsWith(A380Failure.SecSoftwareVersions).secVersionsDisagree).toBe(true);
    expect(flagsWith(A380Failure.PrimPinProgramming).primsPinProgDisagree).toBe(true);
    expect(
      fctlSensorAlertFlags({ ...normal([A380Failure.PrimPinProgramming]), primHealthy: [true, false, false] })
        .primsPinProgDisagree,
    ).toBe(false);
  });

  it('reads the computer health flags as SimVar Bool reads give them (the number 1)', () => {
    const fromSimVars = {
      ...normal([A380Failure.CaptSidestick]),
      primHealthy: [1, 0, 0] as unknown as [boolean, boolean, boolean],
    };
    expect(fctlSensorAlertFlags(fromSimVars).sidestickFault).toEqual([true, false]);
  });
});

describe('sidestick deactivation by take-over (CONFIG L(R) SIDESTICK FAULT)', () => {
  const hold = (lock: SidestickTakeoverLock, capt: boolean, fo: boolean, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.5) {
      lock.update(capt, fo, 0.5);
    }
  };

  it('deactivates the CAPT sidestick after a 30 s F/O take-over, until the CAPT presses the pb', () => {
    const lock = new SidestickTakeoverLock();
    hold(lock, false, true, 29);
    expect(lock.deactivated).toEqual([false, false]);
    hold(lock, false, true, 2);
    expect(lock.deactivated).toEqual([true, false]);
    hold(lock, false, false, 10);
    expect(lock.deactivated).toEqual([true, false]);
    // the F/O pressing again keeps it, the CAPT pressing gives the priority back
    hold(lock, false, true, 1);
    hold(lock, false, false, 1);
    expect(lock.deactivated).toEqual([true, false]);
    hold(lock, true, false, 1);
    expect(lock.deactivated).toEqual([false, false]);
  });

  it('does not deactivate with a short press (autopilot disconnection)', () => {
    const lock = new SidestickTakeoverLock();
    hold(lock, true, false, 2);
    hold(lock, false, false, 40);
    expect(lock.deactivated).toEqual([false, false]);
  });

  it('raises the CONFIG alert at the T.O CONFIG test and from take-off power until lift-off', () => {
    const monitor = new ConfigSidestickMonitor();
    expect(monitor.update(true, 2, false)).toBe(false);
    expect(monitor.update(true, 2, true)).toBe(true);
    expect(monitor.update(true, 3, false)).toBe(true);
    expect(monitor.update(true, 4, false)).toBe(true);
    expect(monitor.update(true, 6, false)).toBe(false);
    expect(monitor.update(false, 3, true)).toBe(false);
  });

  it('shows the alert of the deactivated sidestick', () => {
    const alerts = new FctlSensorAlerts();
    for (let t = 0; t < 31; t += 0.5) {
      alerts.update({ ...normal(), foTakeoverPbPressed: true, deltaTimeSeconds: 0.5 });
    }
    alerts.update({ ...normal(), flightPhase: 3 });
    expect(alerts.configSidestickFault.map((s) => s.get())).toEqual([true, false]);
  });
});

describe('F/CTL sensor alert entries (FwsAbnormalSensed)', () => {
  const keys = FCTL_SENSOR_ALERT_KEYS;

  it('uses the flight phase inhibitions of the alerts', () => {
    expect(FCTL_SENSOR_PHASE_INHIBITION).toEqual({
      configSidestickFault: [5, 6, 7, 8, 9, 10, 12],
      sidestickFault: [],
      sidestickSensorFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      primSidestickSensorFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      sidestickPriorityFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      rudderPedalFault: [4, 5, 6, 7],
      rudderPedalSensorFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      rudderPressureSensorFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      doubleRudderPressureSensorFault: [3, 4, 5, 6, 7, 9, 10, 11],
      rudderTrimSingleFault: [3, 4, 5, 6, 7, 9, 10, 11],
      rudderTrimFault: [4, 5, 6, 7, 9, 10],
      gndSplrsFault: [3, 4, 5, 6, 7],
      splrsFault: [3, 4, 5, 6, 7, 9, 10],
      speedBrakesFault: [3, 4, 5, 6, 7, 9, 10],
      loadAlleviationFault: [3, 4, 5, 6, 7, 8, 9, 10],
      twoGyrometersFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      versionsDisagree: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
  });

  it('has one entry per alert, each with its ata27.ts title, level and one shown line per item', () => {
    const items = fctlSensorAbnormalItems(new FctlSensorAlerts());
    const expected: [number, string, number][] = [
      [271800001, 'CONFIG L SIDESTICK FAULT (BY TAKE-OVER)', 3],
      [271800002, 'CONFIG R SIDESTICK FAULT (BY TAKE-OVER)', 3],
      [271800016, 'F/CTL GND SPLRs FAULT', 2],
      [271800018, 'F/CTL TWO GYROMETERs FAULT', 1],
      [271800025, 'F/CTL L SIDESTICK FAULT', 2],
      [271800026, 'F/CTL R SIDESTICK FAULT', 2],
      [271800027, 'F/CTL L SIDESTICK SENSOR FAULT', 1],
      [271800028, 'F/CTL R SIDESTICK SENSOR FAULT', 1],
      [271800029, 'F/CTL LOAD ALLEVIATION FAULT', 1],
      [271800030, 'F/CTL PART SPLRs FAULT', 2],
      [271800031, 'F/CTL MOST SPLRs FAULT', 2],
      [271800042, 'F/CTL PRIM 1 SIDESTICK SENSOR FAULT', 1],
      [271800043, 'F/CTL PRIM 2 SIDESTICK SENSOR FAULT', 1],
      [271800044, 'F/CTL PRIM 3 SIDESTICK SENSOR FAULT', 1],
      [271800045, 'F/CTL PRIM VERSIONS DISAGREE', 1],
      [271800046, 'F/CTL SEC VERSIONS DISAGREE', 1],
      [271800047, 'F/CTL PRIMs PIN PROG DISAGREE', 1],
      [271800050, 'F/CTL RUDDER PEDAL FAULT', 2],
      [271800052, 'F/CTL RUDDER PEDAL SENSOR FAULT', 1],
      [271800053, 'F/CTL RUDDER PRESSURE SENSOR FAULT', 1],
      [271800054, 'F/CTL RUDDER TRIM 1 FAULT', 1],
      [271800055, 'F/CTL RUDDER TRIM 2 FAULT', 1],
      [271800056, 'F/CTL RUDDER TRIM FAULT', 2],
      [271800063, 'F/CTL SPEED BRAKES FAULT', 2],
      [271800073, 'F/CTL SIDESTICK PRIORITY FAULT', 1],
      [271800074, 'F/CTL DOUBLE RUDDER PRESS SENSOR FAULT', 1],
    ];
    expect(Object.keys(items).map(Number).sort()).toEqual(expected.map(([key]) => key).sort());
    for (const [key, title, level] of expected) {
      expect(procedure(key)?.title).toBe(title);
      expect(items[key].failure).toBe(level);
      expect(items[key].whichItemsToShow().length).toBe(procedure(key)?.items.length);
      expect(items[key].whichItemsChecked().length).toBe(procedure(key)?.items.length);
    }
  });

  it('has the ECAM lines of the procedures', () => {
    expect(procedure(keys.configSidestickFault[0])?.items).toEqual(['L TAKEOVER']);
    expect(procedure(keys.gndSplrsFault)?.items).toEqual(['LDG DIST AFFECTED', 'AUTO BRK : DO NOT USE']);
    expect(procedure(keys.partSplrsFault)?.items).toEqual(['FOR TAXI : FLAPS SELECT CONF 1+F', 'LDG DIST AFFECTED']);
    expect(procedure(keys.rudderPedalFault)?.items).toEqual(['AP : KEEP ON', 'LDG DIST AFFECTED']);
  });

  it('shows FOR TAXI : FLAPS SELECT CONF 1+F one minute after the FLAPS lever is set to 0 at taxi-in', () => {
    const alerts = new FctlSensorAlerts();
    const items = fctlSensorAbnormalItems(alerts);
    alerts.update(normal([A380Failure.LeftSpoiler3Actuator]));
    expect(items[keys.partSplrsFault].whichItemsToShow()).toEqual([false, true]);
    alerts.update({ ...normal([A380Failure.LeftSpoiler3Actuator]), taxiInFlapsLever0For1Min: true });
    expect(items[keys.partSplrsFault].whichItemsToShow()).toEqual([true, true]);
  });

  it('lists the STATUS lines of the alerts', () => {
    const items = fctlSensorAbnormalItems(new FctlSensorAlerts());
    const inop = (keysOf: (string | null)[] | undefined) =>
      (keysOf ?? []).map((key) => text('EcamInopSys', key as string));
    const limitations = (keysOf: (string | null)[] | undefined) =>
      (keysOf ?? []).map((key) => text('EcamLimitations', key as string));
    expect(inop(items[keys.sidestickFault[0]].inopSysAllPhases?.([]))).toEqual(['L SIDESTICK']);
    expect(inop(items[keys.sidestickFault[1]].inopSysAllPhases?.([]))).toEqual(['R SIDESTICK']);
    expect(inop(items[keys.rudderPedalFault].inopSysAllPhases?.([]))).toEqual(['RUDDER PEDAL']);
    expect(inop(items[keys.rudderPedalFault].inopSysApprLdg?.([]))).toEqual(['BTV']);
    expect(limitations(items[keys.rudderPedalFault].limitationsApprLdg?.([]))).toEqual(['LDG DIST AFFECTED']);
    expect(inop(items[keys.rudderTrimSingleFault[1]].redundLoss?.([]))).toEqual(['RUDDER TRIM 2']);
    expect(inop(items[keys.rudderTrimFault].inopSysAllPhases?.([]))).toEqual(['RUDDER TRIM']);
    expect(inop(items[keys.rudderTrimFault].inopSysApprLdg?.([]))).toEqual(['CAT 2']);
    expect(inop(items[keys.gndSplrsFault].inopSysApprLdg?.([]))).toEqual([
      'GND SPLRs',
      'BTV',
      'RWY OVERRUN PROT',
      'CAT 2',
    ]);
    expect(limitations(items[keys.gndSplrsFault].limitationsApprLdg?.([]))).toEqual([
      'LDG DIST AFFECTED',
      'AUTO BRK:DO NOT USE',
    ]);
    expect(inop(items[keys.partSplrsFault].inopSysAllPhases?.([]))).toEqual(['PART SPLRs']);
    expect(inop(items[keys.mostSplrsFault].inopSysAllPhases?.([]))).toEqual(['MOST SPLRs']);
    expect(inop(items[keys.mostSplrsFault].inopSysApprLdg?.([]))).toEqual(['BTV', 'GLS AUTOLAND']);
    expect(inop(items[keys.speedBrakesFault].inopSysAllPhases?.([]))).toEqual(['SPEED BRAKES']);
    expect(inop(items[keys.loadAlleviationFault].inopSysAllPhases?.([]))).toEqual(['LOAD ALLEVIATION']);
    expect(inop(items[keys.primsPinProgDisagree].inopSysAllPhases?.([]))).toEqual(['AP/FD TCAS MODE']);
    expect(inop(items[keys.primsPinProgDisagree].inopSysApprLdg?.([]))).toEqual(['BTV', 'RWY OVERRUN PROT']);
  });

  it('stops the BTV arming with the alerts that list BTV inoperative, except the pin programming one', () => {
    const alerts = new FctlSensorAlerts();
    alerts.update(normal([A380Failure.PrimPinProgramming]));
    expect(alerts.btvInop.get()).toBe(false);
    alerts.update(normal([A380Failure.PrimWheelSpeedInputs]));
    expect(alerts.btvInop.get()).toBe(true);
  });

  it('has the deferred procedures of GND SPLRs, MOST SPLRs and RUDDER PEDAL FAULT', () => {
    const deferred = fctlSensorDeferredItems();
    const deferredBlock = (key: number) => {
      const start = ata27.indexOf(`\n  ${key}: {`);
      return start < 0 ? '' : ata27.slice(start, ata27.indexOf('\n  },', start));
    };
    expect(deferredBlock(270700002)).toContain("fromAbnormalProcs: ['271800016']");
    expect(deferredBlock(270700004)).toContain("fromAbnormalProcs: ['271800031']");
    expect(deferredBlock(270700003)).toContain("fromAbnormalProcs: ['271800050']");
    for (const key of [270700002, 270700003, 270700004]) {
      expect(deferred[key].whichItemsToShow().length).toBe(procedure(key)?.items.length);
    }
    expect(procedure(270700003)?.items).toEqual([
      'LDG DIST COMPUTATION',
      'AUTOLAND : RECOMMENDED',
      'AUTO BRK : DO NOT USE',
      'USE DIFF BRAKING AS RQRD',
      'N/W STEER TILLER (< 70 KT)',
      'REVERSER : SYMMETRIC USE ONLY',
    ]);
  });
});

describe('flyPad failures and wiring', () => {
  it('lists the ATA 27 failures of these alerts on the flyPad', () => {
    const names = new Map(A380FailureDefinitions.map(([ata, id, name]) => [id, [ata, name]]));
    expect(names.get(A380Failure.CaptSidestick)).toEqual([27, 'CAPT sidestick']);
    expect(names.get(A380Failure.RudderPedalTransducers)).toEqual([27, 'Rudder pedal transducers']);
    expect(names.get(A380Failure.PrimWheelSpeedInputs)).toEqual([27, 'PRIM wheel speed inputs']);
    expect(names.get(A380Failure.RightSpoiler8Actuator)).toEqual([27, 'Right spoiler 8 actuator']);
    expect(names.get(A380Failure.PrimPinProgramming)).toEqual([27, 'PRIM pin programming']);
  });

  it('gives the C++ fbw module the same ids for the failures it simulates', () => {
    const failureList = readFileSync(
      resolve(__dirname, '../../../../wasm/fbw_a380/src/failures/FailureList.h'),
      'utf-8',
    );
    const cppIds = new Map(
      [...failureList.matchAll(/^\s*(\w+) = (\d+),/gm)].map(([, name, id]) => [name, Number(id)] as const),
    );
    for (const name of [
      'CaptSidestick',
      'FoSidestick',
      'RudderPedalTransducers',
      'RudderTrimMotor1',
      'RudderTrimMotor2',
      'PrimWheelSpeedInputs',
      'SpeedBrakesLever',
      'LeftSpoiler1Actuator',
      'RightSpoiler8Actuator',
    ]) {
      expect(cppIds.get(name)).toBe(A380Failure[name as keyof typeof A380Failure]);
    }
  });

  it('adds the entries to the abnormal sensed procedures and updates the alerts every cycle', () => {
    const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(abnormalSensed).toContain('...fctlSensorAbnormalItems(this.fws.fctlSensorAlerts),');
    expect(abnormalSensed).toContain('...fctlSensorDeferredItems(),');
    expect(core).toContain('public readonly fctlSensorAlerts = new FctlSensorAlerts();');
    expect(core).toContain('this.fctlSensorAlerts.update({');
    expect(core).toContain('this.fctlSensorAlerts.btvInop,');
    expect(core).toContain('sidestickDeactivatedByTakeover: this.fctlSensorAlerts.sidestickDeactivatedByTakeover(),');
  });
});
