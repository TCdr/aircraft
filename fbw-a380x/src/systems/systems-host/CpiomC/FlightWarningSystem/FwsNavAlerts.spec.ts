// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import {
  altDisagree,
  attDisagree,
  baroRefDisagree,
  FwsNavAlerts,
  hdgDisagree,
  readSideDisplayData,
  SideDisplayData,
  sideSource,
} from './FwsNavAlerts';

const SIDE: SideDisplayData = { baroStd: false, altitudeFt: 10000, pitchDeg: 2, rollDeg: 0, headingDeg: 90 };

describe('NAV CAPT AND F/O BARO REF DISAGREE: QNH on one side, STD on the other', () => {
  it('differs only with valid references', () => {
    expect(baroRefDisagree(SIDE, { ...SIDE, baroStd: true })).toBe(true);
    expect(baroRefDisagree(SIDE, SIDE)).toBe(false);
    expect(baroRefDisagree(SIDE, { ...SIDE, baroStd: null })).toBe(false);
  });
});

describe('NAV CAPT AND F/O ALT DISAGREE: > 500 ft in STD, > 250 ft in QNH', () => {
  it('QNH: 250 ft', () => {
    expect(altDisagree(SIDE, { ...SIDE, altitudeFt: 10250 })).toBe(false);
    expect(altDisagree(SIDE, { ...SIDE, altitudeFt: 10251 })).toBe(true);
  });

  it('STD: 500 ft', () => {
    const std = { ...SIDE, baroStd: true };
    expect(altDisagree(std, { ...std, altitudeFt: 10400 })).toBe(false);
    expect(altDisagree(std, { ...std, altitudeFt: 10501 })).toBe(true);
  });

  it('not with different references (BARO REF DISAGREE) or invalid data', () => {
    expect(altDisagree(SIDE, { ...SIDE, baroStd: true, altitudeFt: 12000 })).toBe(false);
    expect(altDisagree(SIDE, { ...SIDE, altitudeFt: null })).toBe(false);
  });
});

describe('NAV CAPT AND F/O ATT and HDG DISAGREE', () => {
  it('ATT: more than 5° in pitch or roll', () => {
    expect(attDisagree(SIDE, { ...SIDE, pitchDeg: 7 })).toBe(false);
    expect(attDisagree(SIDE, { ...SIDE, pitchDeg: 7.1 })).toBe(true);
    expect(attDisagree(SIDE, { ...SIDE, rollDeg: -5.5 })).toBe(true);
    expect(attDisagree(SIDE, { ...SIDE, rollDeg: null, pitchDeg: null })).toBe(false);
  });

  it('HDG: more than 7° magnetic, 5° true, the short way round', () => {
    expect(hdgDisagree(SIDE, { ...SIDE, headingDeg: 96 }, false)).toBe(false);
    expect(hdgDisagree(SIDE, { ...SIDE, headingDeg: 98 }, false)).toBe(true);
    expect(hdgDisagree(SIDE, { ...SIDE, headingDeg: 96 }, true)).toBe(true);
    expect(hdgDisagree({ ...SIDE, headingDeg: 358 }, { ...SIDE, headingDeg: 3 }, false)).toBe(false);
    expect(hdgDisagree({ ...SIDE, headingDeg: 358 }, { ...SIDE, headingDeg: 8 }, false)).toBe(true);
  });
});

describe('what each PFD displays', () => {
  it('ADR/IR 1 for the CAPT, 2 for the F/O, 3 when the switching selects it for that side', () => {
    expect(sideSource(true, 1)).toBe(1);
    expect(sideSource(true, 0)).toBe(3);
    expect(sideSource(true, 2)).toBe(1);
    expect(sideSource(false, 1)).toBe(2);
    expect(sideSource(false, 2)).toBe(3);
    expect(sideSource(false, 0)).toBe(2);
  });

  /** A word reader that answers the names it is given, invalid for the others */
  function reader(values: Record<string, { value?: number; bits?: number[] }>): (name: string) => Arinc429Register {
    return (name) => {
      const w = Arinc429Register.empty();
      const v = values[name];
      if (v) {
        w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
        if (v.value !== undefined) w.setValue(v.value);
        (v.bits ?? []).forEach((bit) => w.setBitValue(bit, true));
      }
      return w;
    };
  }

  it('QNH: the baro corrected altitude of its own baro setting (_1 CAPT, _2 F/O); STD: the pressure altitude', () => {
    const read = reader({
      'L:A32NX_FCU_EFIS_L_DISCRETE_WORD_2': { bits: [12] },
      'L:A32NX_FCU_EFIS_R_DISCRETE_WORD_2': { bits: [11] },
      'L:A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_1': { value: 5100 },
      'L:A32NX_ADIRS_ADR_1_ALTITUDE': { value: 5000 },
      'L:A32NX_ADIRS_ADR_2_BARO_CORRECTED_ALTITUDE_2': { value: 5200 },
      'L:A32NX_ADIRS_ADR_2_ALTITUDE': { value: 5000 },
      'L:A32NX_ADIRS_IR_2_TRUE_HEADING': { value: 123 },
    });
    const capt = readSideDisplayData(true, read, 1, 1, true);
    const fo = readSideDisplayData(false, read, 1, 1, true);
    expect(capt.baroStd).toBe(false);
    expect(capt.altitudeFt).toBe(5100);
    expect(fo.baroStd).toBe(true);
    expect(fo.altitudeFt).toBe(5000);
    expect(fo.headingDeg).toBe(123);
    expect(capt.pitchDeg).toBeNull();
  });
});

describe('confirm time', () => {
  it('BARO REF DISAGREE after 10 s (design choice), not on a short sequential STD selection', () => {
    const alerts = new FwsNavAlerts();
    const fo = { ...SIDE, baroStd: true };
    for (let i = 0; i < 50; i++) alerts.update(100, SIDE, fo, false);
    alerts.update(100, SIDE, SIDE, false);
    expect(alerts.baroRefDisagree.get()).toBe(false);
    for (let i = 0; i < 105; i++) alerts.update(100, SIDE, fo, false);
    expect(alerts.baroRefDisagree.get()).toBe(true);
  });
});

describe('FWS wiring of the NAV CAPT AND F/O DISAGREE alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it('FwsCore updates the monitor with both sides', () => {
    expect(fwsCore).toContain('this.navAlerts.update(');
    expect(fwsCore).toMatch(/readSideDisplayData\(true,/);
    expect(fwsCore).toMatch(/readSideDisplayData\(false,/);
  });

  it.each([
    ['340800016', 'altDisagree', 2],
    ['340800017', 'attDisagree', 2],
    ['340800018', 'baroRefDisagree', 1],
    ['340800020', 'hdgDisagree', 2],
  ])('%s is raised by navAlerts.%s, level 2, with its %i lines', (id, subject, lines) => {
    const start = abnormalSensed.indexOf(`    ${id}: {`);
    expect(start).toBeGreaterThan(0);
    const b = abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
    expect(b).toContain(`simVarIsActive: this.fws.navAlerts.${subject},`);
    expect(b).toContain('failure: 2,');
    const shown = b.split('whichItemsToShow')[1].split('whichItemsChecked')[0];
    expect(shown.match(/true/g)).toHaveLength(lines);
  });
});
