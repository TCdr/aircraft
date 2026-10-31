// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { antiIceItemsChecked, ICE_DETECTED_PHASE_INHIBITION, isSevereIceDetected } from './AntiIceAlerts';

import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, FwsFixture } from './FwsSpecFixture';

describe('A-ICE ICE DETECTED and SEVERE ICE DETECTED', () => {
  it('SEVERE ICE DETECTED needs the WING A-ICE off', () => {
    expect(isSevereIceDetected(true, false)).toBe(true);
    expect(isSevereIceDetected(true, true)).toBe(false);
    expect(isSevereIceDetected(false, false)).toBe(false);
  });

  it('the ENG A-ICE lines, and WING A-ICE for SEVERE ICE DETECTED', () => {
    expect(antiIceItemsChecked([true, false, true, false], null)).toEqual([true, false, true, false]);
    expect(antiIceItemsChecked([true, true, true, true], false)).toEqual([true, true, true, true, false]);
  });

  it('both are active in flight phase 8 only', () => {
    expect(ICE_DETECTED_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it('have messages', () => {
    expect(EcamAbnormalProcedures['300800001'].title).toBe('\x1b<4m\x1b4mA-ICE\x1bm ICE DETECTED');
    expect(EcamAbnormalProcedures['300800002'].title).toBe('\x1b<4m\x1b4mA-ICE\x1bm SEVERE ICE DETECTED');
  });

  describe('in the FWS', () => {
    let fixture: FwsFixture;
    beforeAll(() => {
      fixture = createFws();
    });

    it('ICE DETECTED follows the inhibited ice timer and yields to SEVERE ICE DETECTED', () => {
      const { core } = fixture;
      const entry = core.abnormalSensed.ewdAbnormalSensed['300800001'];
      expect(entry.flightPhaseInhib).toEqual(ICE_DETECTED_PHASE_INHIBITION);
      expect(entry.simVarIsActive).toBe(core.iceDetectedTimer2Status);
      expect(entry.notActiveWhenItemActive).toEqual(['300800002']);
    });

    it('SEVERE ICE DETECTED is active with severe icing only while the WING A-ICE is off', () => {
      const { core } = fixture;
      const entry = core.abnormalSensed.ewdAbnormalSensed['300800002'];
      expect(entry.flightPhaseInhib).toEqual(ICE_DETECTED_PHASE_INHIBITION);
      core.iceSevereDetectedTimerStatus.set(true);
      core.wingAntiIce.set(false);
      expect(entry.simVarIsActive.get()).toBe(true);
      core.wingAntiIce.set(true);
      expect(entry.simVarIsActive.get()).toBe(false);
    });
  });
});
