// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { ELEC_AC_ESS_BUS_FAULT_STATUS } from './FwsElecAlerts';
import { FwsInopSys } from './FwsInopSys';
import { FwsCore } from './FwsCore';

/*
 * The EcamMessages tables are read from the source text: importing EcamMessages/index.ts in a test fails, because the
 * AbnormalSensed/ata*.ts files it imports read ChecklistLineStyle back from index.ts before it is defined (circular
 * import; the esbuild bundle of the sim inlines the enum values, the per-file test transform does not).
 */
const ecamMessages = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
  'utf-8',
);

/** Text of a line of an EcamMessages table (EcamInopSys, EcamLimitations), without its ECAM colour code */
function text(table: 'EcamInopSys' | 'EcamLimitations', key: string): string | undefined {
  const start = ecamMessages.indexOf(`export const ${table}`);
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'?${key}'?: '\\\\x1b<\\d+m([^']*)',`, 'm'));
  return line ? line[1] : undefined;
}

/** An FwsCore stand-in for FwsInopSys: every property is a boolean Subject, created false on first access */
function fakeFws(): { fws: FwsCore; subjects: Record<string, Subject<boolean>> } {
  const subjects: Record<string, Subject<boolean>> = {};
  const fws = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (!(name in subjects)) {
          subjects[name] = Subject.create(false);
        }
        return subjects[name];
      },
    },
  ) as unknown as FwsCore;
  return { fws, subjects };
}

describe('ELEC AC ESS BUS FAULT STATUS (A380 FCOM PRO-ABN-ECAM-10-24, l.139256-139289)', () => {
  it('has the FCOM LIMITATIONS, APPR AND LDG (l.139263)', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.limitationsApprLdg.map((k) => text('EcamLimitations', k))).toEqual([
      'SLATS SLOW',
    ]);
  });

  it('has the FCOM INOP SYS, ALL PHASES column in order (l.139271-139280)', () => {
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

  it('has the FCOM INOP SYS, APPR & LDG column in order (l.139271-139275)', () => {
    expect(ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysApprLdg.map((k) => text('EcamInopSys', k))).toEqual([
      'SLAT SYS 1',
      'CAT 2',
      'GLS AUTOLAND',
      'LS 1',
      'TAWS 1',
    ]);
  });

  it('has the FCOM REDUND LOSS in order (l.139284-139289)', () => {
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
    const { fws, subjects } = fakeFws();
    const inopSys = new FwsInopSys(fws).inopSys;
    const active = (key: string) => inopSys[key].simVarIsActive.get();

    for (const key of ELEC_AC_ESS_BUS_FAULT_STATUS.redundLoss) {
      expect(inopSys[key]?.redundancyLoss, key).toBe(true);
    }
    // RA SYS C follows the RA 3 failure (the RA 3 is supplied by the AC ESS busbar), the others the alert itself
    const fromAlert = ELEC_AC_ESS_BUS_FAULT_STATUS.redundLoss.filter((k) => k !== '340300024');
    expect(fromAlert.some(active)).toBe(false);
    subjects.elecAcEssBusFault.set(true);
    expect(fromAlert.every(active)).toBe(true);
    expect(active('340300024')).toBe(false);
    subjects.height3Failed.set(true);
    expect(active('340300024')).toBe(true);
  });

  it('does not repeat TAWS 1 / XPDR 1 as GPWS 1, TERR SYS 1 and ADS-B RPTG 1 (not in the FCOM STATUS, l.139267-139280)', () => {
    const { fws, subjects } = fakeFws();
    const inopSys = new FwsInopSys(fws).inopSys;
    const active = (key: string) => inopSys[key].simVarIsActive.get();
    const surv1Items = ['340300001', '340300039', '340300041']; // GPWS 1, TERR SYS 1, ADS-B RPTG 1

    subjects.gpws1Failed.set(true);
    subjects.terrSys1Failed.set(true);
    expect(surv1Items.every(active)).toBe(true); // their own failure, without the ELEC alert
    subjects.elecAcEssBusFault.set(true);
    expect(surv1Items.some(active)).toBe(false);
  });
});
