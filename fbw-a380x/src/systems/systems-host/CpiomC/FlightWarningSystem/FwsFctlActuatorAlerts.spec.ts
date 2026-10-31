// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import { SdPages } from '@shared/EcamSystemPages';
import {
  AILERON_ACTUATOR_FAULT_PHASE_INHIBITION,
  AILERON_FAULT_PHASE_INHIBITION,
  ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION,
  ELEVATOR_FAULT_PHASE_INHIBITION,
  FctlActuatorAlertMonitor,
  FctlActuatorFailures,
  fctlActuatorAlerts,
  lostElevatorsInopSys,
  PRIM_ACTUATOR_FAULT_PHASE_INHIBITION,
  readFctlActuatorFailures,
  RUDDER_ACTUATOR_FAULT_PHASE_INHIBITION,
  RUDDER_ELEC_ACTUATOR_FAULT_PHASE_INHIBITION,
  STABILIZER_ACTUATOR_FAULT_PHASE_INHIBITION,
  STABILIZER_FAULT_PHASE_INHIBITION,
} from './FwsFctlActuatorAlerts';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

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
    stabilizerElectricMotorFailed: false,
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

  it('raises STABILIZER ELEC ACTUATOR FAULT for the electric motor, but not with STABILIZER FAULT', () => {
    const electric = healthy();
    electric.stabilizerElectricMotorFailed = true;
    expect(raised(electric)).toEqual(['stabilizerElecActuatorFault']);

    electric.stabilizerMotors = [false, true];
    expect(raised(electric).sort()).toEqual(['stabilizerActuatorFault', 'stabilizerElecActuatorFault']);

    electric.stabilizerMotors = [true, true];
    expect(raised(electric)).toEqual(['stabilizerFault']);
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
  // key, title, condition, phase inhibition, failure level (1 crew awareness, 2 single chime and master caution)
  const alerts: [string, string, (monitor: FctlActuatorAlertMonitor) => unknown, number[], number][] = [
    ['271800006', 'AILERON ACTUATOR FAULT', (m) => m.aileronActuatorFault, AILERON_ACTUATOR_FAULT_PHASE_INHIBITION, 1],
    [
      '271800007',
      'AILERON ELEC ACTUATOR FAULT',
      (m) => m.aileronElecActuatorFault,
      AILERON_ACTUATOR_FAULT_PHASE_INHIBITION,
      1,
    ],
    ['271800019', 'L INR AILERON FAULT', (m) => m.aileronFault[2], AILERON_FAULT_PHASE_INHIBITION, 2],
    ['271800020', 'R INR AILERON FAULT', (m) => m.aileronFault[3], AILERON_FAULT_PHASE_INHIBITION, 2],
    ['271800021', 'L MID AILERON FAULT', (m) => m.aileronFault[1], AILERON_FAULT_PHASE_INHIBITION, 2],
    ['271800022', 'R MID AILERON FAULT', (m) => m.aileronFault[4], AILERON_FAULT_PHASE_INHIBITION, 2],
    ['271800023', 'L OUTR AILERON FAULT', (m) => m.aileronFault[0], AILERON_FAULT_PHASE_INHIBITION, 2],
    ['271800024', 'R OUTR AILERON FAULT', (m) => m.aileronFault[5], AILERON_FAULT_PHASE_INHIBITION, 2],
    [
      '271800011',
      'ELEVATOR ACTUATOR FAULT',
      (m) => m.elevatorActuatorFault,
      ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION,
      2,
    ],
    [
      '271800012',
      'ELEVATOR ELEC ACTUATOR FAULT',
      (m) => m.elevatorElecActuatorFault,
      ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION,
      1,
    ],
    ['271800061', 'SINGLE ELEVATOR FAULT', (m) => m.singleElevatorFault, ELEVATOR_FAULT_PHASE_INHIBITION, 2],
    ['271800010', 'DOUBLE ELEVATOR FAULT', (m) => m.doubleElevatorFault, ELEVATOR_FAULT_PHASE_INHIBITION, 2],
    ['271800048', 'RUDDER ACTUATOR FAULT', (m) => m.rudderActuatorFault, RUDDER_ACTUATOR_FAULT_PHASE_INHIBITION, 2],
    [
      '271800049',
      'RUDDER ELEC ACTUATOR FAULT',
      (m) => m.rudderElecActuatorFault,
      RUDDER_ELEC_ACTUATOR_FAULT_PHASE_INHIBITION,
      1,
    ],
    [
      '271800066',
      'STABILIZER ACTUATOR FAULT',
      (m) => m.stabilizerActuatorFault,
      STABILIZER_ACTUATOR_FAULT_PHASE_INHIBITION,
      1,
    ],
    ['271800068', 'STABILIZER FAULT', (m) => m.stabilizerFault, STABILIZER_FAULT_PHASE_INHIBITION, 2],
  ];

  it.each([0, 1, 2])('raises PRIM %i ELEVATOR (RUDDER) ACTUATOR FAULT as crew awareness without SD page', (prim) => {
    const { core } = createFws();
    const pairs: [string, (monitor: FctlActuatorAlertMonitor) => unknown, string][] = [
      [`${271800033 + prim}`, (m) => m.primElevatorActuatorFault[prim], `PRIM ${prim + 1} ELEVATOR ACTUATOR FAULT`],
      [`${271800039 + prim}`, (m) => m.primRudderActuatorFault[prim], `PRIM ${prim + 1} RUDDER ACTUATOR FAULT`],
    ];
    for (const [key, condition, title] of pairs) {
      const alert = core.abnormalSensed.ewdAbnormalSensed[key];
      expect(alert.flightPhaseInhib).toEqual(PRIM_ACTUATOR_FAULT_PHASE_INHIBITION);
      expect(alert.simVarIsActive).toBe(condition(core.fctlActuators));
      expect(alert.failure).toBe(1);
      expect(alert.sysPage).toBe(SdPages.None);
      expect(EcamAbnormalProcedures[key].title.endsWith(`F/CTL\x1bm ${title}`)).toBe(true);
    }
  });

  it.each(alerts)('raises %s %s on the F/CTL page', (key, title, condition, inhibition, failure) => {
    const { core } = createFws();
    const alert = core.abnormalSensed.ewdAbnormalSensed[key];
    expect(alert.flightPhaseInhib).toEqual(inhibition);
    expect(alert.simVarIsActive).toBe(condition(core.fctlActuators));
    expect(alert.failure).toBe(failure);
    expect(alert.sysPage).toBe(SdPages.Fctl);
    expect(EcamAbnormalProcedures[key].title.endsWith(`F/CTL\x1bm ${title}`)).toBe(true);
  });

  it.each([
    ['271800023', '290100009'],
    ['271800021', '270300103'],
    ['271800019', '270300101'],
    ['271800020', '270300102'],
    ['271800022', '270300104'],
    ['271800024', '290100010'],
  ])('lists the aileron lost by %s as INOP SYS %s', (key, inopSys) => {
    const { core } = createFws();
    expect(core.abnormalSensed.ewdAbnormalSensed[key].inopSysAllPhases?.([])).toEqual([inopSys]);
  });

  it('shows the lines of the lost surfaces: LDG DIST (PERF) AFFECTED, BTV, FUEL CONSUMPT INCRSD', () => {
    const { core } = createFws();
    const sensed = core.abnormalSensed;
    const aileron = sensed.ewdAbnormalSensed['271800019'];
    expect(aileron.limitationsApprLdg?.([])).toEqual(['800400002']);
    expect(aileron.inopSysApprLdg?.([])).toEqual(['320300007']);
    expect(aileron.info?.([])).toEqual(['280200003', '270200101']);
    expect(EcamAbnormalProcedures['271800019'].items).toMatchObject([{ name: 'LDG DIST AFFECTED', sensed: false }]);

    const double = sensed.ewdAbnormalSensed['271800010'];
    expect(double.limitationsApprLdg?.([])).toEqual(['800400003']);
    expect(EcamAbnormalProcedures['271800010'].items).toMatchObject([{ name: 'LDG PERF AFFECTED', sensed: false }]);
    expect(EcamDeferredProcedures['270700101'].fromAbnormalProcs).toEqual(['271800010']);
    expect(sensed.ewdDeferredProcs['270700101'].whichItemsToShow()).toEqual([true, true]);

    const stabilizer = sensed.ewdAbnormalSensed['271800068'];
    expect(stabilizer.inopSysAllPhases?.([])).toEqual(['290100007']);
    expect(stabilizer.limitationsAllPhases?.([])).toEqual([]);
    core.fctlActuators.stabilizerLockedNoseUp.set(true);
    expect(stabilizer.limitationsAllPhases?.([])).toEqual(['270400101']);
    expect(stabilizer.limitationsPfd?.([])).toEqual(['270400101']);
  });

  it('feeds the monitor with the flyPad failures of the actuators', () => {
    const { core } = createFws(new Set([A380Failure.LeftMidAileronEha]));
    runFwsCycle(core);
    expect(core.fctlActuators.aileronElecActuatorFault.get()).toBe(true);
    expect(core.fctlActuators.aileronActuatorFault.get()).toBe(false);
  });

  it('feeds the monitor with the PRIM states and shares the SINGLE RUDDER FAULT subjects', () => {
    const { core, simVars } = createFws(new Set([A380Failure.Prim2ElevatorActuatorControl]));
    expect(core.lowerRudderFault).toBe(core.fctlActuators.lowerRudderFault);
    expect(core.upperRudderFault).toBe(core.fctlActuators.upperRudderFault);

    runFwsCycle(core);
    // A failed PRIM shows PRIM 2 FAULT instead
    expect(core.fctlActuators.primElevatorActuatorFault[1].get()).toBe(false);

    simVars.set('L:A32NX_PRIM_2_HEALTHY', 1);
    runFwsCycle(core);
    expect(core.fctlActuators.primElevatorActuatorFault[1].get()).toBe(true);
  });
});
