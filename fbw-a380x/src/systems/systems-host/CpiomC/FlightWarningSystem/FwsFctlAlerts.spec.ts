// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { directLawInfo, directLawInopSysAllPhases, lawInopSysApprLdg } from './FwsFctlAlerts';

describe('F/CTL ALTN LAW (PROT LOST) and DIRECT LAW STATUS (A380 FCOM PRO-ABN-ECAM-10-27-10)', () => {
  it('INOP SYS APPR & LDG: CAT 2 and GLS AUTOLAND (l.144870-144871, 144982-144983)', () => {
    expect(lawInopSysApprLdg()).toEqual(['220300027', '220300010']);
  });

  it('DIRECT LAW INOP SYS ALL PHASES: LOAD ALLEVIATION, AP 1+2, FD 1+2 (l.144982-144985)', () => {
    expect(directLawInopSysAllPhases()).toEqual(['340300014', '220300007', '220300024']);
  });

  it('DIRECT LAW INFO: F/CTL BKUP CTL ACTIVE only with all flight control computers failed (l.144990-144992)', () => {
    expect(directLawInfo(true)).toEqual(['270200003']);
    expect(directLawInfo(false)).toEqual([]);
  });

  describe('wiring', () => {
    const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

    /** The source of one alert entry */
    function block(id: string): string {
      const start = abnormalSensed.indexOf(`    ${id}: {`);
      expect(start).toBeGreaterThan(0);
      return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
    }

    it('ALTN LAW lists CAT 2 and GLS AUTOLAND for APPR & LDG', () => {
      expect(block('271800008')).toContain('inopSysApprLdg: () => lawInopSysApprLdg(),');
    });

    it('DIRECT LAW lists LOAD ALLEVIATION, CAT 2, GLS AUTOLAND and the BKUP CTL info', () => {
      const b = block('271800009');
      expect(b).toContain('inopSysAllPhases: () => directLawInopSysAllPhases(),');
      expect(b).toContain('inopSysApprLdg: () => lawInopSysApprLdg(),');
      expect(b).toContain('info: () => directLawInfo(this.fws.allPrimAndSecFailed.get()),');
    });
  });
});
