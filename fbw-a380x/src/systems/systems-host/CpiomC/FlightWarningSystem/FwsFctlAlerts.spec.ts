// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { directLawInfo, directLawInopSysAllPhases, lawInopSysApprLdg } from './FwsFctlAlerts';
import { createFws } from './FwsSpecFixture';

describe('F/CTL ALTN LAW (PROT LOST) and DIRECT LAW STATUS', () => {
  it('INOP SYS APPR & LDG: CAT 2 and GLS AUTOLAND', () => {
    expect(lawInopSysApprLdg()).toEqual(['220300027', '220300010']);
  });

  it('DIRECT LAW INOP SYS ALL PHASES: LOAD ALLEVIATION, AP 1+2, FD 1+2', () => {
    expect(directLawInopSysAllPhases()).toEqual(['340300014', '220300007', '220300024']);
  });

  it('DIRECT LAW INFO: F/CTL BKUP CTL ACTIVE only with all flight control computers failed', () => {
    expect(directLawInfo(true)).toEqual(['270200003']);
    expect(directLawInfo(false)).toEqual([]);
  });

  describe('wiring', () => {
    it('ALTN LAW lists CAT 2 and GLS AUTOLAND for APPR & LDG', () => {
      const { core } = createFws();
      expect(core.abnormalSensed.ewdAbnormalSensed['271800008'].inopSysApprLdg?.([])).toEqual(lawInopSysApprLdg());
    });

    it('DIRECT LAW lists LOAD ALLEVIATION, CAT 2, GLS AUTOLAND and the BKUP CTL info', () => {
      const { core } = createFws();
      const alert = core.abnormalSensed.ewdAbnormalSensed['271800009'];
      expect(alert.inopSysAllPhases?.([])).toEqual(directLawInopSysAllPhases());
      expect(alert.inopSysApprLdg?.([])).toEqual(lawInopSysApprLdg());

      core.allPrimAndSecFailed.set(false);
      expect(alert.info?.([])).toEqual(directLawInfo(false));
      core.allPrimAndSecFailed.set(true);
      expect(alert.info?.([])).toEqual(directLawInfo(true));
    });
  });
});
