// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION,
  TAIL_STRIKE_PHASE_INHIBITION,
  TailStrikeDetector,
  TailStrikeInputs,
  firstValidPitch,
} from './FwsTailStrikeAlerts';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { FwsInopSysPhases } from './FwsInopSys';

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
  const { core, simVars } = createFws(new Set());
  const sensed = core.abnormalSensed.ewdAbnormalSensed;

  it('raises TAIL STRIKE as a master caution with LAND ANSA', () => {
    const alert = sensed['271800071'];
    expect(alert.flightPhaseInhib).toBe(TAIL_STRIKE_PHASE_INHIBITION);
    expect(alert.simVarIsActive).toBe(core.tailStrike);
    expect(alert.failure).toBe(2);
    expect(EcamAbnormalProcedures['271800071'].title).toBe('\x1b<4mTAIL STRIKE');
    expect(EcamAbnormalProcedures['271800071'].recommendation).toBe('LAND ANSA');
  });

  it('raises TAIL STRIKE DET FAULT as crew awareness with INOP SYS APPR TAIL STRIKE DET', () => {
    const alert = sensed['271800072'];
    expect(alert.flightPhaseInhib).toBe(TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION);
    expect(alert.simVarIsActive).toBe(core.tailStrikeDetFault);
    expect(alert.failure).toBe(1);
    expect(EcamAbnormalProcedures['271800072'].title).toBe('\x1b<4mTAIL STRIKE DET FAULT');
    expect(EcamInopSys['270300016']).toBe('\x1b<4mTAIL STRIKE DET');
    const inop = core.inopSys.inopSys['270300016'];
    expect(inop.simVarIsActive).toBe(core.tailStrikeDetFault);
    expect(inop.phase).toBe(FwsInopSysPhases.ApprLdg);
  });

  it('feeds the detector with the IR pitch and a compressed main gear of the LGCIUs', () => {
    simVars.set('L:A32NX_ADIRS_IR_1_PITCH', Arinc429Word.getRawWord(12, Arinc429SignStatusMatrix.NormalOperation));
    simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 1);
    runFwsCycle(core);
    // the main gear is not compressed: no contact at 12 deg
    expect(core.tailStrike.get()).toBe(false);

    simVars.set('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED', 1);
    runFwsCycle(core);
    expect(core.tailStrike.get()).toBe(true);
    expect(core.tailStrikeDetFault.get()).toBe(false);
  });

  it('raises the detector fault and detects nothing with the flyPad failure', () => {
    const failed = createFws(new Set([A380Failure.TailStrikeDetector]));
    failed.simVars.set(
      'L:A32NX_ADIRS_IR_1_PITCH',
      Arinc429Word.getRawWord(12, Arinc429SignStatusMatrix.NormalOperation),
    );
    failed.simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 1);
    failed.simVars.set('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED', 1);
    runFwsCycle(failed.core);
    expect(failed.core.tailStrikeDetFault.get()).toBe(true);
    expect(failed.core.tailStrike.get()).toBe(false);
  });
});
