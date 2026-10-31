// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ELEC_AC_ESS_BUS_FAULT_STATUS } from './FwsElecAlerts';
import { EcamInopSys, EcamLimitations } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

const ESCAPE = String.fromCharCode(27);

/** Text of a line of an EcamMessages table (EcamInopSys, EcamLimitations), without its ECAM colour code */
function text(table: 'EcamInopSys' | 'EcamLimitations', key: string): string | undefined {
  const line = (table === 'EcamInopSys' ? EcamInopSys : EcamLimitations)[key];
  return line?.replace(new RegExp(`^${ESCAPE}<\\d+m`), '');
}

describe('ELEC AC ESS BUS FAULT STATUS', () => {
  it('has the LIMITATIONS, APPR AND LDG', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.limitationsApprLdg.map((k) => text('EcamLimitations', k))).toEqual([
      'SLATS SLOW',
    ]);
  });

  it('has the INOP SYS, ALL PHASES column in order', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysAllPhases.map((k) => text('EcamInopSys', k))).toEqual([
      'ADR 1',
      'GPS 1',
      'WXR 1',
      'XPDR 1',
      'TCAS 1',
      'HF 1',
      'FEED TK 2 MAIN PMP',
      'STBY PITOT HEATG',
      'L WINDSHIELD HEATG',
      'DFDR',
    ]);
  });

  it('has the INOP SYS, APPR & LDG column in order', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysApprLdg.map((k) => text('EcamInopSys', k))).toEqual([
      'SLAT SYS 1',
      'CAT 2',
      'GLS AUTOLAND',
      'LS 1',
      'TAWS 1',
    ]);
  });

  it('has the REDUND LOSS in order', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.redundLoss.map((k) => text('EcamInopSys', k))).toEqual([
      'RA SYS C',
      'FEED TK 3 STBY PMP',
      'TRIM TK L PMP',
      'ENG 1+2+3+4 IGN A',
      'PACK 1 CTL 1',
      'PACK 2 CTL 1',
    ]);
  });

  it('shows every REDUND LOSS item as a redundancy loss of FwsInopSys, the only source of the STATUS MORE page', () => {
    const { core } = createFws();
    const inopSys = core.inopSys.inopSys;
    const active = (key: string) => inopSys[key].simVarIsActive.get();

    for (const key of ELEC_AC_ESS_BUS_FAULT_STATUS.redundLoss) {
      expect(inopSys[key]?.redundancyLoss, key).toBe(true);
    }
    // RA SYS C follows the RA 3 failure (the RA 3 is supplied by the AC ESS busbar), the others the alert itself
    const fromAlert = ELEC_AC_ESS_BUS_FAULT_STATUS.redundLoss.filter((k) => k !== '340300024');
    expect(fromAlert.some(active)).toBe(false);
    core.elecAcEssBusFault.set(true);
    expect(fromAlert.every(active)).toBe(true);
    expect(active('340300024')).toBe(false);
    core.height3Failed.set(true);
    expect(active('340300024')).toBe(true);
  });

  it('does not repeat TAWS 1 / XPDR 1 as GPWS 1, TERR SYS 1 and ADS-B RPTG 1 (not on the real STATUS page)', () => {
    const { core } = createFws();
    const inopSys = core.inopSys.inopSys;
    const active = (key: string) => inopSys[key].simVarIsActive.get();
    const surv1Items = ['340300001', '340300039', '340300041']; // GPWS 1, TERR SYS 1, ADS-B RPTG 1

    core.gpws1Failed.set(true);
    core.terrSys1Failed.set(true);
    expect(surv1Items.every(active)).toBe(true); // their own failure, without the ELEC alert
    core.elecAcEssBusFault.set(true);
    expect(surv1Items.some(active)).toBe(false);
  });
});
