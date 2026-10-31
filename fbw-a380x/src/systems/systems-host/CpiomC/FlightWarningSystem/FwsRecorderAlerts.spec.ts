// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { RECORDER_ACCELMTR_PHASE_INHIBITION, RECORDER_PHASE_INHIBITION, recorderAlerts } from './FwsRecorderAlerts';
import { CABIN_EMER_EXIT_LT_PHASE_INHIBITION, isCabinEmerExitLightFault } from './FwsEmerExitLightAlerts';
import { EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { A380Failure } from '@failures';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/*
 * RECORDER ACCELMTR / CVR / DFDR / SYS FAULT and CABIN EMER EXIT LT FAULT: crew awareness alerts that had a title but
 * no trigger.
 */
let core: FwsCore;
let abnormalSensed: FwsCore['abnormalSensed']['ewdAbnormalSensed'];
let inopSys: FwsCore['inopSys']['inopSys'];

beforeAll(() => {
  core = createFws().core;
  abnormalSensed = core.abnormalSensed.ewdAbnormalSensed;
  inopSys = core.inopSys.inopSys;
});

const NO_FAILURE = {
  cockpitVoiceRecorder: false,
  flightDataRecorder: false,
  accelerometer: false,
  flightDataInterfaceUnit: false,
};

describe('RECORDER alerts', () => {
  it('raises nothing without a failure', () => {
    expect(recorderAlerts(NO_FAILURE)).toEqual({
      accelerometerFault: false,
      cvrFault: false,
      dfdrFault: false,
      systemFault: false,
    });
  });

  it('raises each alert from its own failure', () => {
    expect(recorderAlerts({ ...NO_FAILURE, cockpitVoiceRecorder: true }).cvrFault).toBe(true);
    expect(recorderAlerts({ ...NO_FAILURE, flightDataRecorder: true }).dfdrFault).toBe(true);
    expect(recorderAlerts({ ...NO_FAILURE, accelerometer: true }).accelerometerFault).toBe(true);
    expect(recorderAlerts({ ...NO_FAILURE, flightDataInterfaceUnit: true }).systemFault).toBe(true);
    expect(recorderAlerts({ ...NO_FAILURE, flightDataInterfaceUnit: true }).dfdrFault).toBe(false);
  });

  it.each([
    [A380Failure.CockpitVoiceRecorder, 'recorderCvrFault'],
    [A380Failure.FlightDataRecorder, 'recorderDfdrFault'],
    [A380Failure.FlightDataRecorderAccelerometer, 'recorderAccelmtrFault'],
    [A380Failure.FlightDataInterfaceUnit, 'recorderSysFault'],
  ] as const)('the FWS raises the alert of flyPad failure %i on %s', (failure, subject) => {
    const failing = createFws(new Set([failure])).core;
    runFwsCycle(failing);
    expect(failing[subject].get()).toBe(true);
    const healthy = createFws(new Set()).core;
    runFwsCycle(healthy);
    expect(healthy[subject].get()).toBe(false);
  });

  it('has the flight phase inhibitions of the aircraft', () => {
    expect(RECORDER_ACCELMTR_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(RECORDER_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it.each([
    ['319800001', RECORDER_ACCELMTR_PHASE_INHIBITION, 'recorderAccelmtrFault'],
    ['319800002', RECORDER_PHASE_INHIBITION, 'recorderCvrFault'],
    ['319800003', RECORDER_PHASE_INHIBITION, 'recorderDfdrFault'],
    ['319800004', RECORDER_PHASE_INHIBITION, 'recorderSysFault'],
  ] as const)('raises %s as a level 1 caution (crew awareness)', (id, inhibition, subject) => {
    const alert = abnormalSensed[id];
    expect(alert.flightPhaseInhib).toEqual(inhibition);
    expect(alert.simVarIsActive).toBe(core[subject]);
    expect(alert.failure).toBe(1);
  });

  it('shows the INOP SYS lines', () => {
    for (const [id, text, subject] of [
      ['310300022', 'RECORDER ACCELMTR', 'recorderAccelmtrFault'],
      ['310300023', 'CVR', 'recorderCvrFault'],
      ['310300004', 'DFDR', 'recorderDfdrFault'],
      ['310300024', 'RECORDER SYS', 'recorderSysFault'],
    ] as const) {
      expect(EcamInopSys[id]).toBe(`\x1b<4m${text}`);
      expect(inopSys[id].simVarIsActive).toBe(core[subject]);
    }
  });
});

describe('CABIN EMER EXIT LT FAULT', () => {
  it('is raised by the cabin emergency lighting failure', () => {
    expect(isCabinEmerExitLightFault(true)).toBe(true);
    expect(isCabinEmerExitLightFault(false)).toBe(false);
  });

  it('the FWS raises it from the cabin emergency lighting failure', () => {
    const failing = createFws(new Set([A380Failure.CabinEmergencyLighting])).core;
    runFwsCycle(failing);
    expect(failing.cabinEmerExitLtFault.get()).toBe(true);
    const healthy = createFws(new Set()).core;
    runFwsCycle(healthy);
    expect(healthy.cabinEmerExitLtFault.get()).toBe(false);
  });

  it('is inhibited in phases 3 to 10', () => {
    expect(CABIN_EMER_EXIT_LT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is a level 1 caution with its INOP SYS EMER EXIT LT', () => {
    const alert = abnormalSensed['334800101'];
    expect(alert.flightPhaseInhib).toEqual(CABIN_EMER_EXIT_LT_PHASE_INHIBITION);
    expect(alert.simVarIsActive).toBe(core.cabinEmerExitLtFault);
    expect(alert.failure).toBe(1);
    expect(EcamInopSys['330300001']).toBe('\x1b<4mEMER EXIT LT');
    expect(inopSys['330300001'].simVarIsActive).toBe(core.cabinEmerExitLtFault);
  });
});
