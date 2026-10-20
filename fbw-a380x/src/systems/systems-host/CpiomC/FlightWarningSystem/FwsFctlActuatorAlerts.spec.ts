// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import {
  FctlActuatorAlertMonitor,
  FctlActuatorFailures,
  fctlActuatorAlerts,
  lostElevatorsInopSys,
  readFctlActuatorFailures,
} from './FwsFctlActuatorAlerts';

function healthy(): FctlActuatorFailures {
  return {
    ailerons: [0, 1, 2, 3, 4, 5].map((): [boolean, boolean] => [false, false]),
    elevators: [0, 1, 2, 3].map((): [boolean, boolean] => [false, false]),
    rudders: [
      [false, false],
      [false, false],
    ],
    rudderEbhaElectricalParts: [
      [false, false],
      [false, false],
    ],
    stabilizerMotors: [false, false],
    stabilizerJammed: false,
    primElevatorActuatorControlLost: [false, false, false],
    primRudderActuatorControlLost: [false, false, false],
  };
}

const ALL_PRIMS_HEALTHY = [true, true, true];

function raised(failures: FctlActuatorFailures, primHealthy = ALL_PRIMS_HEALTHY): string[] {
  const states = fctlActuatorAlerts(failures, primHealthy);
  return Object.keys(states).filter((alert) => {
    const state = states[alert as keyof typeof states];
    return Array.isArray(state) ? state.some((lost) => lost) : state;
  });
}

describe('F/CTL actuator alerts', () => {
  it('raises nothing with all the actuators healthy', () => {
    expect(raised(healthy())).toEqual([]);
  });

  it('raises AILERON ACTUATOR FAULT for one actuator of an outer aileron, or the hydraulic one of a mid aileron', () => {
    const outer = healthy();
    outer.ailerons[5] = [false, true];
    expect(raised(outer)).toEqual(['aileronActuatorFault']);

    const mid = healthy();
    mid.ailerons[1] = [true, false];
    expect(raised(mid)).toEqual(['aileronActuatorFault']);
  });

  it('raises AILERON ELEC ACTUATOR FAULT for the EHA of a mid or inner aileron', () => {
    const inner = healthy();
    inner.ailerons[3] = [false, true];
    expect(raised(inner)).toEqual(['aileronElecActuatorFault']);
  });

  it('raises the AILERON FAULT of the aileron with both actuators failed, not its actuator faults', () => {
    const failures = healthy();
    failures.ailerons[2] = [true, true];
    expect(raised(failures)).toEqual(['aileronFault']);
    expect(fctlActuatorAlerts(failures, ALL_PRIMS_HEALTHY).aileronFault).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('raises ELEVATOR (ELEC) ACTUATOR FAULT for the hydraulic actuator (the EHA) of an elevator', () => {
    const hydraulic = healthy();
    hydraulic.elevators[2] = [true, false];
    expect(raised(hydraulic)).toEqual(['elevatorActuatorFault']);

    const eha = healthy();
    eha.elevators[0] = [false, true];
    expect(raised(eha)).toEqual(['elevatorElecActuatorFault']);
  });

  it('raises SINGLE ELEVATOR FAULT for one lost elevator and DOUBLE ELEVATOR FAULT for two or more', () => {
    const single = healthy();
    single.elevators[3] = [true, true];
    expect(raised(single)).toEqual(['elevatorFault', 'singleElevatorFault']);

    const double = healthy();
    double.elevators[0] = [true, true];
    double.elevators[1] = [true, true];
    expect(raised(double)).toEqual(['elevatorFault', 'doubleElevatorFault']);

    double.elevators[2] = [true, true];
    expect(fctlActuatorAlerts(double, ALL_PRIMS_HEALTHY).doubleElevatorFault).toBe(true);
  });

  it('raises RUDDER ACTUATOR FAULT for one EBHA and SINGLE RUDDER FAULT (upper or lower) for both', () => {
    const one = healthy();
    one.rudders[1] = [false, true];
    expect(raised(one)).toEqual(['rudderActuatorFault']);

    const both = healthy();
    both.rudders[0] = [true, true];
    expect(raised(both)).toEqual(['upperRudderFault']);
  });

  it('raises RUDDER ELEC ACTUATOR FAULT for the electrical part of a working EBHA only', () => {
    const elec = healthy();
    elec.rudderEbhaElectricalParts[0] = [false, true];
    expect(raised(elec)).toEqual(['rudderElecActuatorFault']);

    elec.rudders[0] = [false, true];
    expect(raised(elec)).toEqual(['rudderActuatorFault']);
  });

  it('raises STABILIZER ACTUATOR FAULT for one hydraulic motor and STABILIZER FAULT when jammed or both are failed', () => {
    const motor = healthy();
    motor.stabilizerMotors = [false, true];
    expect(raised(motor)).toEqual(['stabilizerActuatorFault']);

    motor.stabilizerMotors = [true, true];
    expect(raised(motor)).toEqual(['stabilizerFault']);

    const jammed = healthy();
    jammed.stabilizerJammed = true;
    jammed.stabilizerMotors = [true, false];
    expect(raised(jammed)).toEqual(['stabilizerFault']);
  });

  it('lists the lost elevators as INOP SYS', () => {
    expect(lostElevatorsInopSys([false, true, false, true])).toEqual(['270300105', '270300108']);
  });

  it('reads each flyPad failure into its surface and actuator', () => {
    const active = new Set<number>([
      A380Failure.LeftMidAileronEha,
      A380Failure.RightOuterElevatorYellowActuator,
      A380Failure.LowerRudderYellowEbha,
      A380Failure.UpperRudderGreenEbhaElectricalPart,
      A380Failure.StabilizerYellowHydraulicMotor,
      A380Failure.Prim2ElevatorActuatorControl,
      A380Failure.Prim3RudderActuatorControl,
    ]);
    const failures = readFctlActuatorFailures((failure) => active.has(failure));
    const expected = healthy();
    expected.ailerons[1] = [false, true];
    expected.elevators[3] = [true, false];
    expected.rudders[1] = [false, true];
    expected.rudderEbhaElectricalParts[0] = [false, true];
    expected.stabilizerMotors = [false, true];
    expected.primElevatorActuatorControlLost = [false, true, false];
    expected.primRudderActuatorControlLost = [false, false, true];
    expect(failures).toEqual(expected);
  });

  it('raises PRIM 1(2)(3) ELEVATOR (RUDDER) ACTUATOR FAULT for a running PRIM only', () => {
    const failures = healthy();
    failures.primElevatorActuatorControlLost = [true, false, false];
    failures.primRudderActuatorControlLost = [false, false, true];
    expect(fctlActuatorAlerts(failures, ALL_PRIMS_HEALTHY).primElevatorActuatorFault).toEqual([true, false, false]);
    expect(fctlActuatorAlerts(failures, ALL_PRIMS_HEALTHY).primRudderActuatorFault).toEqual([false, false, true]);

    // A failed PRIM shows PRIM 1(2)(3) FAULT instead
    expect(raised(failures, [false, true, false])).toEqual([]);
  });
});

describe('STABILIZER FAULT MAX SPEED', () => {
  const jammed = (): FctlActuatorFailures => ({ ...healthy(), stabilizerJammed: true });

  it('asks to check the stabilizer position when it failed below 240 kt, MAX SPEED above 3.9 deg nose up', () => {
    const monitor = new FctlActuatorAlertMonitor();
    monitor.update(healthy(), ALL_PRIMS_HEALTHY, 180, 5);
    monitor.update(jammed(), ALL_PRIMS_HEALTHY, 180, 5);
    expect(monitor.stabilizerFault.get()).toBe(true);
    expect(monitor.stabilizerFailedAtLowSpeed.get()).toBe(true);
    expect(monitor.stabilizerLockedNoseUp.get()).toBe(true);

    // The speed at the detection counts, not the speed now
    monitor.update(jammed(), ALL_PRIMS_HEALTHY, 300, 5);
    expect(monitor.stabilizerFailedAtLowSpeed.get()).toBe(true);
  });

  it('has no MAX SPEED when the stabilizer failed at high speed or is locked below 3.9 deg nose up', () => {
    const fast = new FctlActuatorAlertMonitor();
    fast.update(jammed(), ALL_PRIMS_HEALTHY, 280, 2);
    expect(fast.stabilizerFailedAtLowSpeed.get()).toBe(false);
    expect(fast.stabilizerLockedNoseUp.get()).toBe(false);
  });
});

describe('FWS wiring of the F/CTL actuator alerts', () => {
  const sensed = readFileSync(resolve(__dirname, './FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, './FwsCore.ts'), 'utf-8');
  const messages = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27.ts'),
    'utf-8',
  );

  function entry(source: string, key: string, indent = '    '): string {
    const start = source.indexOf(`${indent}${key}: {`);
    expect(start, `entry ${key}`).toBeGreaterThan(0);
    return source.substring(start, source.indexOf(`\n${indent}},`, start));
  }

  // key, title, condition, phase inhibition, failure level (1 crew awareness, 2 single chime and master caution)
  const alerts: [string, string, string, string, number][] = [
    ['271800006', 'AILERON ACTUATOR FAULT', 'aileronActuatorFault', 'AILERON_ACTUATOR_FAULT_PHASE_INHIBITION', 1],
    [
      '271800007',
      'AILERON ELEC ACTUATOR FAULT',
      'aileronElecActuatorFault',
      'AILERON_ACTUATOR_FAULT_PHASE_INHIBITION',
      1,
    ],
    ['271800019', 'L INR AILERON FAULT', 'aileronFault[2]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800020', 'R INR AILERON FAULT', 'aileronFault[3]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800021', 'L MID AILERON FAULT', 'aileronFault[1]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800022', 'R MID AILERON FAULT', 'aileronFault[4]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800023', 'L OUTR AILERON FAULT', 'aileronFault[0]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800024', 'R OUTR AILERON FAULT', 'aileronFault[5]', 'AILERON_FAULT_PHASE_INHIBITION', 2],
    ['271800011', 'ELEVATOR ACTUATOR FAULT', 'elevatorActuatorFault', 'ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION', 2],
    [
      '271800012',
      'ELEVATOR ELEC ACTUATOR FAULT',
      'elevatorElecActuatorFault',
      'ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION',
      1,
    ],
    ['271800061', 'SINGLE ELEVATOR FAULT', 'singleElevatorFault', 'ELEVATOR_FAULT_PHASE_INHIBITION', 2],
    ['271800010', 'DOUBLE ELEVATOR FAULT', 'doubleElevatorFault', 'ELEVATOR_FAULT_PHASE_INHIBITION', 2],
    ['271800048', 'RUDDER ACTUATOR FAULT', 'rudderActuatorFault', 'RUDDER_ACTUATOR_FAULT_PHASE_INHIBITION', 2],
    [
      '271800049',
      'RUDDER ELEC ACTUATOR FAULT',
      'rudderElecActuatorFault',
      'RUDDER_ELEC_ACTUATOR_FAULT_PHASE_INHIBITION',
      1,
    ],
    [
      '271800066',
      'STABILIZER ACTUATOR FAULT',
      'stabilizerActuatorFault',
      'STABILIZER_ACTUATOR_FAULT_PHASE_INHIBITION',
      1,
    ],
    ['271800068', 'STABILIZER FAULT', 'stabilizerFault', 'STABILIZER_FAULT_PHASE_INHIBITION', 2],
  ];

  it.each([0, 1, 2])('raises PRIM %i ELEVATOR (RUDDER) ACTUATOR FAULT as crew awareness without SD page', (prim) => {
    for (const [key, condition, title] of [
      [`${271800033 + prim}`, `primElevatorActuatorFault[${prim}]`, `PRIM ${prim + 1} ELEVATOR ACTUATOR FAULT`],
      [`${271800039 + prim}`, `primRudderActuatorFault[${prim}]`, `PRIM ${prim + 1} RUDDER ACTUATOR FAULT`],
    ]) {
      const alert = entry(sensed, key);
      expect(alert).toContain('flightPhaseInhib: PRIM_ACTUATOR_FAULT_PHASE_INHIBITION,');
      expect(alert).toContain(`simVarIsActive: this.fws.fctlActuators.${condition},`);
      expect(alert).toContain('failure: 1,');
      expect(alert).toContain('sysPage: SdPages.None,');
      expect(entry(messages, key, '  ')).toContain(`F/CTL\\x1bm ${title}',`);
    }
  });

  it.each(alerts)('raises %s %s on the F/CTL page', (key, title, condition, inhibition, failure) => {
    const alert = entry(sensed, key);
    expect(alert).toContain(`flightPhaseInhib: ${inhibition},`);
    expect(alert).toContain(`simVarIsActive: this.fws.fctlActuators.${condition},`);
    expect(alert).toContain(`failure: ${failure},`);
    expect(alert).toContain('sysPage: SdPages.Fctl,');
    expect(entry(messages, key, '  ')).toContain(`F/CTL\\x1bm ${title}',`);
  });

  it.each([
    ['271800023', '290100009'],
    ['271800021', '270300103'],
    ['271800019', '270300101'],
    ['271800020', '270300102'],
    ['271800022', '270300104'],
    ['271800024', '290100010'],
  ])('lists the aileron lost by %s as INOP SYS %s', (key, inopSys) => {
    expect(entry(sensed, key)).toContain(`inopSysAllPhases: () => ['${inopSys}'],`);
  });

  it('shows the lines of the lost surfaces: LDG DIST (PERF) AFFECTED, BTV, FUEL CONSUMPT INCRSD', () => {
    const aileron = entry(sensed, '271800019');
    expect(aileron).toContain("limitationsApprLdg: () => ['800400002'],");
    expect(aileron).toContain("inopSysApprLdg: () => ['320300007'],");
    expect(aileron).toContain("info: () => ['280200003', '270200101'],");
    expect(entry(messages, '271800019', '  ')).toContain("items: [{ name: 'LDG DIST AFFECTED', sensed: false }],");

    const double = entry(sensed, '271800010');
    expect(double).toContain("limitationsApprLdg: () => ['800400003'],");
    expect(entry(messages, '271800010', '  ')).toContain("items: [{ name: 'LDG PERF AFFECTED', sensed: false }],");
    expect(entry(messages, '270700101', '  ')).toContain("fromAbnormalProcs: ['271800010'],");
    expect(entry(sensed, '270700101')).toContain('whichItemsToShow: () => [true, true],');

    const stabilizer = entry(sensed, '271800068');
    expect(stabilizer).toContain("inopSysAllPhases: () => ['290100007'],");
    expect(stabilizer).toContain("this.fws.fctlActuators.stabilizerLockedNoseUp.get() ? ['270400101'] : []");
  });

  it('feeds the monitor with the flyPad failures, the ADR speed and the stabilizer position, and the SINGLE RUDDER FAULT', () => {
    expect(core).toContain('readFctlActuatorFailures((failure) => this.failuresConsumer.isActive(failure)),');
    expect(core).toContain('[this.prim1Healthy.get(), this.prim2Healthy.get(), this.prim3Healthy.get()],');
    expect(core).toContain('public readonly lowerRudderFault = this.fctlActuators.lowerRudderFault;');
    expect(core).toContain('public readonly upperRudderFault = this.fctlActuators.upperRudderFault;');
  });
});
