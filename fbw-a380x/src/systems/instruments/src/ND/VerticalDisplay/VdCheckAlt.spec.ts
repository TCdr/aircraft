// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { VdSideAltitude, isVdCheckAltShown, readVdSideAltitude } from './VdCheckAlt';

const QNH: VdSideAltitude = { baroStd: false, altitudeFt: 10000 };
const STD: VdSideAltitude = { baroStd: true, altitudeFt: 10000 };

describe('VD CHECK ALT', () => {
  it('QNH on both sides: more than 250 ft apart', () => {
    expect(isVdCheckAltShown(QNH, { ...QNH, altitudeFt: 10250 })).toBe(false);
    expect(isVdCheckAltShown(QNH, { ...QNH, altitudeFt: 9749 })).toBe(true);
  });

  it('STD on both sides: more than 500 ft apart', () => {
    expect(isVdCheckAltShown(STD, { ...STD, altitudeFt: 10500 })).toBe(false);
    expect(isVdCheckAltShown(STD, { ...STD, altitudeFt: 10501 })).toBe(true);
  });

  it('not with different barometric references, or an invalid altitude', () => {
    expect(isVdCheckAltShown(QNH, { ...STD, altitudeFt: 12000 })).toBe(false);
    expect(isVdCheckAltShown(QNH, { ...QNH, altitudeFt: null })).toBe(false);
    expect(isVdCheckAltShown({ ...QNH, baroStd: null }, { ...QNH, baroStd: null, altitudeFt: 12000 })).toBe(false);
  });
});

describe('VD side altitude', () => {
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

  const read = reader({
    'L:A32NX_FCU_EFIS_L_DISCRETE_WORD_2': { bits: [12] },
    'L:A32NX_FCU_EFIS_R_DISCRETE_WORD_2': { bits: [11] },
    'L:A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_1': { value: 5100 },
    'L:A32NX_ADIRS_ADR_3_BARO_CORRECTED_ALTITUDE_1': { value: 5150 },
    'L:A32NX_ADIRS_ADR_2_ALTITUDE': { value: 5000 },
    'L:A32NX_ADIRS_ADR_3_ALTITUDE': { value: 4900 },
  });

  it('QNH: the baro corrected altitude with its own setting; STD: the pressure altitude', () => {
    expect(readVdSideAltitude(true, read, 1)).toEqual({ baroStd: false, altitudeFt: 5100 });
    expect(readVdSideAltitude(false, read, 1)).toEqual({ baroStd: true, altitudeFt: 5000 });
  });

  it('ADR 3 when the AIR DATA switching selects it for that side', () => {
    expect(readVdSideAltitude(true, read, 0).altitudeFt).toBe(5150);
    expect(readVdSideAltitude(false, read, 2).altitudeFt).toBe(4900);
  });
});
