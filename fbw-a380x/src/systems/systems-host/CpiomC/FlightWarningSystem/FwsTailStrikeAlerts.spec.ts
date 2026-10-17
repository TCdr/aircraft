// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION,
  TAIL_STRIKE_PHASE_INHIBITION,
  TailStrikeDetector,
  TailStrikeInputs,
  firstValidPitch,
} from './FwsTailStrikeAlerts';

const rotation: TailStrikeInputs = { pitchDegrees: 8, mainGearCompressed: true, detectorFailed: false, flightPhase: 4 };

describe('TAIL STRIKE detector (aircraft geometry limit)', () => {
  it('detects no contact below the 11.5 deg tail strike pitch attitude with the gear compressed', () => {
    const detector = new TailStrikeDetector();
    expect(detector.update({ ...rotation, pitchDegrees: 11.4 })).toEqual({ tailStrike: false, detectorFault: false });
  });

  it('detects a contact at 11.5 deg with a main gear compressed and memorises it for the flight', () => {
    const detector = new TailStrikeDetector();
    expect(detector.update({ ...rotation, pitchDegrees: 11.5 }).tailStrike).toBe(true);
    // After lift-off, climbing at 15 deg: still memorised, the alert shows from phase 7
    expect(
      detector.update({ ...rotation, pitchDegrees: 15, mainGearCompressed: false, flightPhase: 7 }).tailStrike,
    ).toBe(true);
    expect(
      detector.update({ ...rotation, pitchDegrees: 2, mainGearCompressed: false, flightPhase: 8 }).tailStrike,
    ).toBe(true);
  });

  it('detects no contact in the air, whatever the pitch', () => {
    const detector = new TailStrikeDetector();
    expect(
      detector.update({ ...rotation, pitchDegrees: 20, mainGearCompressed: false, flightPhase: 6 }).tailStrike,
    ).toBe(false);
  });

  it('detects no contact without a valid IR pitch', () => {
    const detector = new TailStrikeDetector();
    expect(detector.update({ ...rotation, pitchDegrees: null }).tailStrike).toBe(false);
  });

  it('forgets the contact when the flight phase returns to 1 (next flight)', () => {
    const detector = new TailStrikeDetector();
    detector.update({ ...rotation, pitchDegrees: 12, flightPhase: 9 });
    expect(detector.update({ ...rotation, pitchDegrees: 0, flightPhase: 12 }).tailStrike).toBe(true);
    expect(detector.update({ ...rotation, pitchDegrees: 0, flightPhase: 1 }).tailStrike).toBe(false);
  });

  it('detects nothing and raises TAIL STRIKE DET FAULT when the detector is failed', () => {
    const detector = new TailStrikeDetector();
    expect(detector.update({ ...rotation, pitchDegrees: 13, detectorFailed: true })).toEqual({
      tailStrike: false,
      detectorFault: true,
    });
  });

  it('uses the flight phase inhibitions of the aircraft', () => {
    expect(TAIL_STRIKE_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 12]);
    expect(TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('takes the pitch of the first IR with a valid pitch', () => {
    const word = (valid: boolean, value: number) => ({ isNormalOperation: () => valid, value });
    expect(firstValidPitch([word(false, 1), word(true, 9), word(true, 3)])).toBe(9);
    expect(firstValidPitch([word(false, 1), word(false, 9), word(false, 3)])).toBeNull();
  });
});

describe('FWS wiring of TAIL STRIKE and TAIL STRIKE DET FAULT', () => {
  const sensed = readFileSync(resolve(__dirname, './FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, './FwsCore.ts'), 'utf-8');
  const inopSys = readFileSync(resolve(__dirname, './FwsInopSys.ts'), 'utf-8');
  const messages = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27.ts'),
    'utf-8',
  );
  const index = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
    'utf-8',
  );

  function entry(source: string, key: string, indent = '    '): string {
    const start = source.indexOf(`${indent}${key}: {`);
    expect(start, `entry ${key}`).toBeGreaterThan(0);
    return source.substring(start, source.indexOf(`\n${indent}},`, start));
  }

  it('raises TAIL STRIKE as a master caution with LAND ANSA', () => {
    const alert = entry(sensed, '271800071');
    expect(alert).toContain('flightPhaseInhib: TAIL_STRIKE_PHASE_INHIBITION,');
    expect(alert).toContain('simVarIsActive: this.fws.tailStrike,');
    expect(alert).toContain('failure: 2,');
    expect(messages).toContain("title: '\\x1b<4mTAIL STRIKE',");
    expect(entry(messages, '271800071', '  ')).toContain("recommendation: 'LAND ANSA',");
  });

  it('raises TAIL STRIKE DET FAULT as crew awareness with INOP SYS APPR TAIL STRIKE DET', () => {
    const alert = entry(sensed, '271800072');
    expect(alert).toContain('flightPhaseInhib: TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION,');
    expect(alert).toContain('simVarIsActive: this.fws.tailStrikeDetFault,');
    expect(alert).toContain('failure: 1,');
    expect(messages).toContain("title: '\\x1b<4mTAIL STRIKE DET FAULT',");
    expect(index).toContain("270300016: '\\x1b<4mTAIL STRIKE DET',");
    const inop = entry(inopSys, '270300016');
    expect(inop).toContain('simVarIsActive: this.fws.tailStrikeDetFault,');
    expect(inop).toContain('phase: FwsInopSysPhases.ApprLdg,');
  });

  it('feeds the detector with the IR pitch, both LGCIUs and the flyPad failure', () => {
    expect(core).toContain('this.failuresConsumer.isActive(A380Failure.TailStrikeDetector)');
    expect(core).toContain("SimVar.GetSimVarValue('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED', 'bool') > 0");
    expect(core).toContain('firstValidPitch([this.ir1Pitch, this.ir2Pitch, this.ir3Pitch])');
  });
});
