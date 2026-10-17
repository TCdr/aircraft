// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { RECORDER_ACCELMTR_PHASE_INHIBITION, RECORDER_PHASE_INHIBITION, recorderAlerts } from './FwsRecorderAlerts';
import { CABIN_EMER_EXIT_LT_PHASE_INHIBITION, isCabinEmerExitLightFault } from './FwsEmerExitLightAlerts';

/*
 * RECORDER ACCELMTR / CVR / DFDR / SYS FAULT and CABIN EMER EXIT LT FAULT: crew awareness alerts that had a title but
 * no trigger.
 */
const messagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ecamMessages = readFileSync(resolve(messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const inopSys = readFileSync(resolve(__dirname, 'FwsInopSys.ts'), 'utf-8');
const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** The source of one entry (`    <id>: {` ... `    },`) of an FWS dictionary */
function entry(source: string, id: string): string {
  const match = source.match(new RegExp(`\\n    ${id}: \\{([\\s\\S]*?)\\n    \\},`));
  if (!match) {
    throw new Error(`no entry ${id}`);
  }
  return match[1];
}

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

  it('has the flight phase inhibitions of the aircraft', () => {
    expect(RECORDER_ACCELMTR_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(RECORDER_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it.each([
    ['319800001', 'RECORDER_ACCELMTR_PHASE_INHIBITION', 'this.fws.recorderAccelmtrFault'],
    ['319800002', 'RECORDER_PHASE_INHIBITION', 'this.fws.recorderCvrFault'],
    ['319800003', 'RECORDER_PHASE_INHIBITION', 'this.fws.recorderDfdrFault'],
    ['319800004', 'RECORDER_PHASE_INHIBITION', 'this.fws.recorderSysFault'],
  ])('raises %s as a level 1 caution (crew awareness)', (id, inhib, cond) => {
    const source = entry(abnormalSensed, id);
    expect(source).toContain(`flightPhaseInhib: ${inhib},`);
    expect(source).toContain(`simVarIsActive: ${cond},`);
    expect(source).toContain('failure: 1,');
  });

  it('shows the INOP SYS lines', () => {
    for (const [id, text, cond] of [
      ['310300022', 'RECORDER ACCELMTR', 'this.fws.recorderAccelmtrFault'],
      ['310300023', 'CVR', 'this.fws.recorderCvrFault'],
      ['310300004', 'DFDR', 'this.fws.recorderDfdrFault'],
      ['310300024', 'RECORDER SYS', 'this.fws.recorderSysFault'],
    ]) {
      expect(ecamMessages).toContain(`${id}: '\\x1b<4m${text}',`);
      expect(entry(inopSys, id)).toContain(`simVarIsActive: ${cond},`);
    }
  });

  it('reads the four recorder failures in FwsCore', () => {
    for (const failure of [
      'CockpitVoiceRecorder',
      'FlightDataRecorder',
      'FlightDataRecorderAccelerometer',
      'FlightDataInterfaceUnit',
    ]) {
      expect(core).toContain(`failureActive(A380Failure.${failure})`);
    }
  });
});

describe('CABIN EMER EXIT LT FAULT', () => {
  it('is raised by the cabin emergency lighting failure', () => {
    expect(isCabinEmerExitLightFault(true)).toBe(true);
    expect(isCabinEmerExitLightFault(false)).toBe(false);
  });

  it('is inhibited in phases 3 to 10', () => {
    expect(CABIN_EMER_EXIT_LT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is a level 1 caution with its INOP SYS EMER EXIT LT', () => {
    const source = entry(abnormalSensed, '334800101');
    expect(source).toContain('flightPhaseInhib: CABIN_EMER_EXIT_LT_PHASE_INHIBITION,');
    expect(source).toContain('simVarIsActive: this.fws.cabinEmerExitLtFault,');
    expect(source).toContain('failure: 1,');
    expect(ecamMessages).toContain("330300001: '\\x1b<4mEMER EXIT LT',");
    expect(entry(inopSys, '330300001')).toContain('simVarIsActive: this.fws.cabinEmerExitLtFault,');
    expect(core).toContain('isCabinEmerExitLightFault(failureActive(A380Failure.CabinEmergencyLighting))');
  });
});
