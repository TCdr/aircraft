// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import type { FwsCore } from './FwsCore';
import { FwsInopSys, FwsInopSysPhases } from './FwsInopSys';
import { EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

/** Text of an EcamInopSys line, without its ECAM colour code */
function inopSysText(key: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  return EcamInopSys[key]?.replace(/^\x1b<\d+m/, '');
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

/** The INOP SYS items shown: active and not replaced by another active item (FwsCore INOP SYS loop) */
function shownItems(inopSys: FwsInopSys, keys: string[]): string[] {
  const items = inopSys.inopSys;
  const active = (key: string) => items[key].simVarIsActive.get();
  return keys.filter((key) => active(key) && !(items[key].notActiveWhenItemActive ?? []).some(active));
}

const STBY_RAD_NAV = '230300015';
const RMP_ITEMS = ['230300009', '230300010', '230300011', '230300012', '230300013', '230300014', '230300016'];

describe('A380X INOP SYS STBY RAD NAV of the RMP failures', () => {
  it('is the aircraft text, under ALL PHASES', () => {
    const { fws } = fakeFws();
    expect(inopSysText(STBY_RAD_NAV)).toBe('STBY RAD NAV');
    expect(new FwsInopSys(fws).inopSys[STBY_RAD_NAV]?.phase).toBe(FwsInopSysPhases.AllPhases);
  });

  it('"STBY RAD NAV (If RMPs 1+2 are failed)": shown with RMP 1+2', () => {
    const { fws, subjects } = fakeFws();
    const inopSys = new FwsInopSys(fws);
    subjects.rmp1Fault.set(true);
    subjects.rmp2Fault.set(true);
    expect(shownItems(inopSys, [...RMP_ITEMS, STBY_RAD_NAV])).toEqual(['230300012', STBY_RAD_NAV]);
  });

  it('"If RMPs 1+3(2+3) are failed: STBY RAD NAV is available via RMP 2(1)"', () => {
    for (const [first, second] of [
      ['rmp1Fault', 'rmp3Fault'],
      ['rmp2Fault', 'rmp3Fault'],
    ]) {
      const { fws, subjects } = fakeFws();
      const inopSys = new FwsInopSys(fws);
      subjects[first].set(true);
      subjects[second].set(true);
      expect(shownItems(inopSys, [STBY_RAD_NAV]), `${first} ${second}`).toEqual([]);
    }
  });

  it('one RMP failed: no STBY RAD NAV', () => {
    for (const rmp of ['rmp1Fault', 'rmp2Fault', 'rmp3Fault']) {
      const { fws, subjects } = fakeFws();
      const inopSys = new FwsInopSys(fws);
      subjects[rmp].set(true);
      expect(shownItems(inopSys, [STBY_RAD_NAV]), rmp).toEqual([]);
    }
  });

  it('COM RMP 1+2+3 FAULT STATUS: RMP 1+2+3 and STBY RAD NAV; the VHF 1+2+3 and HF 1+2 lines stay', () => {
    const { fws, subjects } = fakeFws();
    const inopSys = new FwsInopSys(fws);
    subjects.rmp1Fault.set(true);
    subjects.rmp2Fault.set(true);
    subjects.rmp3Fault.set(true);
    subjects.allRmpFault.set(true);
    expect(shownItems(inopSys, [...RMP_ITEMS, STBY_RAD_NAV, '230300017', '230300018'])).toEqual([
      '230300016',
      STBY_RAD_NAV,
      '230300017',
      '230300018',
    ]);
  });
});

describe('A380X SURV GPWS, TERR SYS and TAWS INOP SYS lines', () => {
  it.each([
    ['340300001', 'GPWS 1', 'SURV GPWS 1(2) FAULT: APPR & LDG, GPWS 1(2) (l.166462-166466)'],
    ['340300002', 'GPWS 2', 'SURV GPWS 1(2) FAULT: APPR & LDG, GPWS 1(2) (l.166462-166466)'],
    ['340300003', 'GPWS 1+2', 'SURV GPWS 1+2 FAULT: APPR & LDG, GPWS 1+2 (l.166495-166498)'],
    ['340300039', 'TERR SYS 1', 'SURV TERR SYS 1(2) FAULT: APPR & LDG, TERR SYS 1(2) (l.167034-167039)'],
    ['340300040', 'TERR SYS 2', 'SURV TERR SYS 1(2) FAULT: APPR & LDG, TERR SYS 1(2) (l.167034-167039)'],
    ['340300044', 'TERR SYS 1+2', 'SURV TERR SYS 1+2 FAULT: APPR & LDG, TERR SYS 1+2 (l.167078-167080)'],
    ['340300046', 'TAWS SYS 1', 'SURV TAWS 1(2) FAULT: APPR & LDG, TAWS 1(2) (l.166839-166842)'],
    ['340300047', 'TAWS SYS 2', 'SURV TAWS 1(2) FAULT: APPR & LDG, TAWS 1(2) (l.166839-166842)'],
    ['340300048', 'TAWS SYS 1+2', 'SURV TAWS 1+2 FAULT: APPR & LDG, TAWS 1+2 (l.166877-166880)'],
  ])('%s %s is an APPR & LDG item (%s)', (key, text) => {
    const { fws } = fakeFws();
    expect(inopSysText(key)).toBe(text);
    expect(new FwsInopSys(fws).inopSys[key].phase).toBe(FwsInopSysPhases.ApprLdg);
  });

  it.each([
    ['341800020', '340300039', 'SURV TERR SYS 1 FAULT'],
    ['341800021', '340300040', 'SURV TERR SYS 2 FAULT'],
    ['341800022', '340300044', 'SURV TERR SYS 1+2 FAULT'],
    ['341800023', '340300046', 'SURV TAWS 1 FAULT'],
    ['341800024', '340300047', 'SURV TAWS 2 FAULT'],
    ['341800025', '340300048', 'SURV TAWS 1+2 FAULT'],
  ])('procedure %s lists %s under APPR & LDG, not ALL PHASES (%s STATUS)', (procedure, key) => {
    const { core } = createFws();
    const entry = core.abnormalSensed.ewdAbnormalSensed[procedure];
    expect(entry.inopSysApprLdg?.([])).toEqual([key]);
    expect(entry.inopSysAllPhases).toBeUndefined();
  });

  it('keeps the TAWS SYS 1(2)(1+2) replacement of the GPWS and TERR SYS lines (FwsSurvAlerts tawsFunctionFaults)', () => {
    const { fws, subjects } = fakeFws();
    const inopSys = new FwsInopSys(fws);
    subjects.gpws1Failed.set(true);
    subjects.terrSys1Failed.set(true);
    subjects.taws1Failed.set(true);
    expect(shownItems(inopSys, ['340300001', '340300039', '340300046'])).toEqual(['340300046']);
  });
});
