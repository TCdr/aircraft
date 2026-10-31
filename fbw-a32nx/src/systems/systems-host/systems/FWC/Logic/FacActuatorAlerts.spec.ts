// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  FAC_SYSTEM_ALERT_CONFIRM_SECONDS,
  FacDiscreteWord2Bits,
  FacActuatorPhaseInhibition,
  FacFunctionInputs,
  facActuatorStatus,
  facFunctionTriggers,
  rudderTrimSystemLines,
  rudderTravelLimiterSystemLines,
  tluLockedAtHighSpeed,
  yawDamperSystemLines,
} from './FacActuatorAlerts';
import { A320Failure, A320FailureDefinitions } from '../../../../failures/src/a320';
import { FwcRig, discreteWordWithBits, probedFailure, startCruiseFwc, triggeredAmong } from '../FwcControlsAlertProbe';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

/** FAC 1 has the function engaged, FAC 2 is in standby (FAC 1 has the priority), no actuator fault */
const NORMAL: FacFunctionInputs = {
  actuator1Fault: false,
  actuator2Fault: false,
  fac1Engaged: true,
  fac2Engaged: false,
};

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const INOP_SYS = '\x1b<7m\x1b4mINOP SYS\x1bm';

describe('AUTO FLT yaw damper, rudder trim and rudder travel limiter alerts', () => {
  it('no alert with both FACs normal', () => {
    expect(facFunctionTriggers(NORMAL)).toEqual({ unit1: false, unit2: false, system: false });
  });

  it('one actuator failed: the 1(2) alert, FAC 2 takes the function over', () => {
    expect(
      facFunctionTriggers({ actuator1Fault: true, actuator2Fault: false, fac1Engaged: false, fac2Engaged: true }),
    ).toEqual({ unit1: true, unit2: false, system: false });
  });

  it('the standby actuator of FAC 2 failed while FAC 1 has the function: the 2 alert', () => {
    expect(facFunctionTriggers({ ...NORMAL, actuator2Fault: true })).toEqual({
      unit1: false,
      unit2: true,
      system: false,
    });
  });

  it('both actuators failed: the SYS alert only', () => {
    expect(
      facFunctionTriggers({ actuator1Fault: true, actuator2Fault: true, fac1Engaged: false, fac2Engaged: false }),
    ).toEqual({ unit1: false, unit2: false, system: true });
  });

  it('FAC 1 failed and the actuator of FAC 2 failed: the function is lost, SYS alert', () => {
    // a failed FAC reports no actuator fault (fac/FacActuatorMonitor.h reportedActuatorFaults)
    expect(
      facFunctionTriggers({ actuator1Fault: false, actuator2Fault: true, fac1Engaged: false, fac2Engaged: false }),
    ).toEqual({ unit1: false, unit2: false, system: true });
  });

  it('no SYS alert for a function lost by the FACs or the hydraulics alone (FAC 1+2 FAULT, HYD G+Y SYS LO PR)', () => {
    expect(
      facFunctionTriggers({ actuator1Fault: false, actuator2Fault: false, fac1Engaged: false, fac2Engaged: false }),
    ).toEqual({ unit1: false, unit2: false, system: false });
  });

  it('flight phase inhibitions', () => {
    expect(FacActuatorPhaseInhibition).toEqual({
      rudderTrimFault: [3, 4, 5, 7, 8],
      rudderTrimSystem: [4, 5, 7, 8],
      rudderTravelLimiterFault: [3, 4, 5, 7, 8],
      rudderTravelLimiterSystem: [4, 5, 7, 8],
      yawDamperFault: [3, 4, 5, 7, 8, 10],
      yawDamperSystem: [4, 5, 7, 8, 10],
    });
    expect(FAC_SYSTEM_ALERT_CONFIRM_SECONDS).toBe(1);
  });

  it('the crew awareness titles', () => {
    // one code at a time: the E/WD shows the group title once for the alerts of a group that follow each other
    const titles = ['220023601', '220023701', '220023001', '220023101', '220023301', '220023401'].map(
      (code) => formatEwdMessages([code])[0],
    );
    expect(titles).toEqual([
      '\x1b<4m\x1b4mAUTO FLT\x1bm YAW DAMPER 1',
      '\x1b<4m\x1b4mAUTO FLT\x1bm YAW DAMPER 2',
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRIM 1 FAULT',
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRIM 2 FAULT',
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRV LIM 1',
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRV LIM 2',
    ]);
  });

  it('YAW DAMPER SYS and RUD TRIM SYS: FAC 1 and FAC 2 OFF THEN ON', () => {
    expect(text('2200238', yawDamperSystemLines())).toBe(
      '\x1b<4m\x1b4mAUTO FLT\x1bm YAW DAMPER SYS | \x1b<5m -FAC 1......OFF THEN ON | \x1b<5m -FAC 2......OFF THEN ON',
    );
    expect(text('2200232', rudderTrimSystemLines())).toBe(
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRIM SYS | \x1b<5m -FAC 1......OFF THEN ON | \x1b<5m -FAC 2......OFF THEN ON',
    );
  });

  it('RUD TRV LIM SYS: the TLU lines only with the TLU locked at high speed after slat extension', () => {
    const procedure =
      '\x1b<4m\x1b4mAUTO FLT\x1bm RUD TRV LIM SYS | \x1b<5mRUD WITH CARE ABV 160 KT | \x1b<5m -FAC 1......OFF THEN ON' +
      ' | \x1b<5m -FAC 2......OFF THEN ON';
    expect(text('2200235', rudderTravelLimiterSystemLines(false))).toBe(procedure);
    expect(text('2200235', rudderTravelLimiterSystemLines(true))).toBe(
      `${procedure} | \x1b<5mMAX X WIND FOR LDG 15 KT | \x1b<5m -AUTO BRK....DO NOT USE | \x1b<7m   .AT LDG ROLL:` +
        ' | \x1b<5m -DIFF BRAKING...AS RQRD',
    );
  });

  it('the TLU counts as locked at high speed with the slats out and a travel limit below 24 deg', () => {
    expect(tluLockedAtHighSpeed(true, 25)).toBe(false);
    expect(tluLockedAtHighSpeed(true, 14.5)).toBe(true);
    expect(tluLockedAtHighSpeed(false, 14.5)).toBe(false);
  });

  it('STATUS of the 1(2) alerts', () => {
    const yawDamper1 = facActuatorStatus.yawDamperFault(1);
    expect(formatStatusPage(yawDamper1.left, yawDamper1.inopSys)).toEqual({
      normal: false,
      left: '\x1b<3mCAT 3 SINGLE ONLY',
      right: `${INOP_SYS}\r\x1b<4mCAT 3 DUAL\r\x1b<4mYAW DAMPER 1`,
    });
    const rudderTrim2 = facActuatorStatus.rudderTrimFault(2);
    expect(formatStatusPage(rudderTrim2.left, rudderTrim2.inopSys).right).toBe(
      `${INOP_SYS}\r\x1b<4mCAT 3 DUAL\r\x1b<4mRUD TRIM 2`,
    );
    const travelLimiter1 = facActuatorStatus.rudderTravelLimiterFault(1);
    expect(formatStatusPage(travelLimiter1.left, travelLimiter1.inopSys)).toEqual({
      normal: false,
      left: '',
      right: `${INOP_SYS}\r\x1b<4mRUD TRV LIM 1`,
    });
  });

  it('STATUS of YAW DAMPER SYS and RUD TRIM SYS, in the aircraft order', () => {
    const yawDamperSystem = facActuatorStatus.yawDamperSystem();
    expect(formatStatusPage(yawDamperSystem.left, yawDamperSystem.inopSys)).toEqual({
      normal: false,
      left: [
        '\x1b<5mMAX SPEED........320 KT',
        '\x1b<7mAPPR PROC:',
        '\x1b<5mFOR LDG......USE FLAP 3',
        '\x1b<5mGPWS LDG FLAP 3......ON',
        '\x1b<5mAPPR SPD.....VREF+10 KT',
        '\x1b<5mLDG DIST PROC....APPLY',
        '\x1b<3mALTN LAW: PROT LOST',
      ].join('\r'),
      right: `${INOP_SYS}\r\x1b<4mF/CTL PROT\r\x1b<4mYAW DAMPER\r\x1b<4mAP 1+2\r\x1b<4mCAT 2`,
    });
    const rudderTrimSystem = facActuatorStatus.rudderTrimSystem();
    expect(formatStatusPage(rudderTrimSystem.left, rudderTrimSystem.inopSys).right).toBe(
      `${INOP_SYS}\r\x1b<4mRUD TRIM\r\x1b<4mAP 1+2\r\x1b<4mCAT 2`,
    );
  });

  it('STATUS of RUD TRV LIM SYS', () => {
    const notLocked = facActuatorStatus.rudderTravelLimiterSystem(false);
    expect(formatStatusPage(notLocked.left, notLocked.inopSys)).toEqual({
      normal: false,
      left: '\x1b<5mRUD WITH CARE ABV 160 KT',
      right: `${INOP_SYS}\r\x1b<4mRUD TRV LIM`,
    });
    const locked = facActuatorStatus.rudderTravelLimiterSystem(true);
    expect(formatStatusPage(locked.left, locked.inopSys).left).toBe(
      [
        '\x1b<5mRUD WITH CARE ABV 160 KT',
        '\x1b<5mMAX X WIND FOR LDG 15 KT',
        '\x1b<5mAUTO BRK.....DO NOT USE',
        '\x1b<7mAT LDG ROLL:',
        '\x1b<5mDIFF BRAKING.....AS RQRD',
      ].join('\r'),
    );
  });
});

describe('AUTO FLT FAC actuator alerts: failures', () => {
  const FAILURES = [
    ['YawDamperActuator1', 22006],
    ['YawDamperActuator2', 22007],
    ['RudderTrimActuator1', 22008],
    ['RudderTrimActuator2', 22009],
    ['RudderTravelLimiterActuator1', 22010],
    ['RudderTravelLimiterActuator2', 22011],
  ] as const;

  it('the six actuator failures exist in the flyPad list with these ids', () => {
    const definitions = A320FailureDefinitions.filter(([ata]) => ata === 22);
    for (const [name, id] of FAILURES) {
      expect((A320Failure as Record<string, number>)[`${name}Failure`]).toBe(id);
      expect(definitions.map(([, failureId]) => failureId)).toContain(id);
    }
  });

  // vitest cannot run the C++ flight controls: the failures of the fbw_a320 module are checked in its source
  it('the six actuator failures exist in the fbw_a320 module, with the same ids', () => {
    const wasm = resolve(__dirname, '../../../../../wasm/fbw_a320/src');
    const failureList = readFileSync(resolve(wasm, 'failures/FailureList.h'), 'utf8');
    const failuresConsumer = readFileSync(resolve(wasm, 'failures/FailuresConsumer.cpp'), 'utf8');
    for (const [name, id] of FAILURES) {
      expect(failureList).toContain(`${name} = ${id},`);
      expect(failuresConsumer).toContain(`Failures::${name}, false`);
    }
  });

  it('the FACs write the actuator faults that the C++ flight controls pass to the FAC model', () => {
    const flyByWireInterface = readFileSync(
      resolve(__dirname, '../../../../../wasm/fbw_a320/src/FlyByWireInterface.cpp'),
      'utf8',
    );
    for (const actuator of ['YAW_DAMPER', 'RUDDER_TRIM', 'RUDDER_TRAVEL_LIM']) {
      expect(flyByWireInterface).toContain(`"A32NX_FAC_" + idString + "_${actuator}_ACTUATOR_FAULT"`);
    }
    expect(flyByWireInterface).toContain('rudder_trim_actuator_healthy = facActuatorInputs.rudderTrimActuatorHealthy;');
    expect(flyByWireInterface).toContain(
      'rudder_travel_lim_actuator_healthy = facActuatorInputs.rudderTravelLimActuatorHealthy;',
    );
    expect(flyByWireInterface).toContain('yaw_damper_has_hyd_press = facActuatorInputs.yawDamperAvailable;');
  });
});

describe('AUTO FLT FAC actuator alerts: the whole FWC', () => {
  /** FAC discrete word 2: the own engaged bits of the yaw damper, rudder trim and rudder travel limiter */
  const FAC_FUNCTIONS_ENGAGED = discreteWordWithBits(
    FacDiscreteWord2Bits.yawDamperOwnEngaged,
    FacDiscreteWord2Bits.rudderTrimOwnEngaged,
    FacDiscreteWord2Bits.rudderTravelLimiterOwnEngaged,
  );

  const FUNCTIONS = [
    {
      actuator: 'YAW_DAMPER',
      unit1: '2200236',
      unit2: '2200237',
      system: '2200238',
      fault: 'yawDamperFault',
      sys: 'yawDamperSystem',
    },
    {
      actuator: 'RUDDER_TRIM',
      unit1: '2200230',
      unit2: '2200231',
      system: '2200232',
      fault: 'rudderTrimFault',
      sys: 'rudderTrimSystem',
    },
    {
      actuator: 'RUDDER_TRAVEL_LIM',
      unit1: '2200233',
      unit2: '2200234',
      system: '2200235',
      fault: 'rudderTravelLimiterFault',
      sys: 'rudderTravelLimiterSystem',
    },
  ] as const;
  const ALL_ALERTS: string[] = [];
  FUNCTIONS.forEach((fn) => ALL_ALERTS.push(fn.unit1, fn.unit2, fn.system));

  /** The FWC with FAC 1 having every rudder function engaged, FAC 2 on standby */
  function startWithFac1Engaged(): FwcRig {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_FAC_1_DISCRETE_WORD_2', FAC_FUNCTIONS_ENGAGED);
    rig.run(3);
    return rig;
  }

  it('the FWC reads the actuator faults and the engaged functions of both FACs', () => {
    for (const fn of FUNCTIONS) {
      const rig = startWithFac1Engaged();
      expect(triggeredAmong(rig.fwc, ALL_ALERTS)).toEqual([]);

      rig.simvars.set(`L:A32NX_FAC_1_${fn.actuator}_ACTUATOR_FAULT`, 1);
      rig.simvars.set('L:A32NX_FAC_2_DISCRETE_WORD_2', FAC_FUNCTIONS_ENGAGED);
      rig.simvars.set('L:A32NX_FAC_1_DISCRETE_WORD_2', discreteWordWithBits());
      rig.run(3);
      expect(triggeredAmong(rig.fwc, ALL_ALERTS)).toEqual([fn.unit1]);

      rig.simvars.set(`L:A32NX_FAC_1_${fn.actuator}_ACTUATOR_FAULT`, 0);
      rig.simvars.set(`L:A32NX_FAC_2_${fn.actuator}_ACTUATOR_FAULT`, 1);
      rig.simvars.set('L:A32NX_FAC_1_DISCRETE_WORD_2', FAC_FUNCTIONS_ENGAGED);
      rig.run(3);
      expect(triggeredAmong(rig.fwc, ALL_ALERTS)).toEqual([fn.unit2]);

      // no FAC has the function engaged: the system alert replaces the single one
      rig.simvars.set('L:A32NX_FAC_1_DISCRETE_WORD_2', discreteWordWithBits());
      rig.simvars.set('L:A32NX_FAC_2_DISCRETE_WORD_2', discreteWordWithBits());
      rig.run(3);
      expect(triggeredAmong(rig.fwc, ALL_ALERTS)).toEqual([fn.system]);
    }
  });

  it('the nine alerts have their flight phase inhibitions and their STATUS', () => {
    const { fwc } = startCruiseFwc();
    for (const fn of FUNCTIONS) {
      for (const [unit, key] of [
        [1, fn.unit1],
        [2, fn.unit2],
      ] as const) {
        const alert = probedFailure(fwc, key);
        expect(alert.flightPhaseInhib).toEqual(FacActuatorPhaseInhibition[fn.fault]);
        expect(alert.inopSys?.()).toEqual(facActuatorStatus[fn.fault](unit).inopSys);
        expect(alert.statusInfo?.()).toEqual(facActuatorStatus[fn.fault](unit).left);
      }
      expect(probedFailure(fwc, fn.system).flightPhaseInhib).toEqual(FacActuatorPhaseInhibition[fn.sys]);
    }
    expect(probedFailure(fwc, '2200238').inopSys?.()).toEqual(facActuatorStatus.yawDamperSystem().inopSys);
    expect(probedFailure(fwc, '2200232').inopSys?.()).toEqual(facActuatorStatus.rudderTrimSystem().inopSys);
    expect(probedFailure(fwc, '2200235').inopSys?.()).toEqual(
      facActuatorStatus.rudderTravelLimiterSystem(false).inopSys,
    );
  });
});
