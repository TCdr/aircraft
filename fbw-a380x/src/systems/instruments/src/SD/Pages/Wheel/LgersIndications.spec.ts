// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { allGearsDownlocked, GravityExtensionIndication, LgCtlIndication } from './LgersIndications';

function word(bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(ssm);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

const DOWNLOCKED = [23, 24, 25];
/** Left gear not downlocked with the lever down (bit 14) */
const LEFT_NOT_DOWNLOCKED = [14, 24, 25];
/** Nose gear not uplocked with the lever up (bit 13) */
const NOSE_NOT_UPLOCKED = [13];
const FAILED = word([], Arinc429SignStatusMatrix.FailureWarning);

function runFor(seconds: number, step: (dt: number) => boolean): boolean {
  let out = false;
  for (let t = 0; t < seconds; t += 1) {
    out = step(1);
  }
  return out;
}

/* A380 FCOM DSC-32-20-40 WHEEL SD LGERS indications (a380_fcom.txt l.81054-81065, l.81105-81109) */
describe('WHEEL page L/G CTL', () => {
  it('shows a gear not downlocked 60 s after the lever went down', () => {
    const lgCtl = new LgCtlIndication();
    expect(runFor(59, (dt) => lgCtl.update(dt, word(LEFT_NOT_DOWNLOCKED), word(LEFT_NOT_DOWNLOCKED)))).toBe(false);
    expect(lgCtl.update(1, word(LEFT_NOT_DOWNLOCKED), word(LEFT_NOT_DOWNLOCKED))).toBe(true);
  });

  it('shows a gear not uplocked 40 s after the lever went up', () => {
    const lgCtl = new LgCtlIndication();
    expect(runFor(39, (dt) => lgCtl.update(dt, word(NOSE_NOT_UPLOCKED), word(NOSE_NOT_UPLOCKED)))).toBe(false);
    expect(lgCtl.update(1, word(NOSE_NOT_UPLOCKED), word(NOSE_NOT_UPLOCKED))).toBe(true);
  });

  it('needs both valid LGCIS to agree, one LGCIS decides alone when the other failed', () => {
    const lgCtl = new LgCtlIndication();
    expect(runFor(70, (dt) => lgCtl.update(dt, word(LEFT_NOT_DOWNLOCKED), word(DOWNLOCKED)))).toBe(false);
    expect(runFor(70, (dt) => lgCtl.update(dt, word(LEFT_NOT_DOWNLOCKED), FAILED))).toBe(true);
  });

  it('goes when the gears lock', () => {
    const lgCtl = new LgCtlIndication();
    runFor(70, (dt) => lgCtl.update(dt, word(LEFT_NOT_DOWNLOCKED), word(LEFT_NOT_DOWNLOCKED)));
    expect(lgCtl.update(1, word(DOWNLOCKED), word(DOWNLOCKED))).toBe(false);
  });
});

describe('WHEEL page L/G GRVTY EXTN IN PROGRESS', () => {
  it('shows from the gravity extension command until all gears are downlocked', () => {
    const gravity = new GravityExtensionIndication();
    expect(gravity.update(1, false, false)).toBe(false);
    expect(gravity.update(1, true, false)).toBe(true);
    expect(runFor(60, (dt) => gravity.update(dt, true, false))).toBe(true);
    expect(gravity.update(1, true, true)).toBe(false);
  });

  it('goes after 120 s', () => {
    const gravity = new GravityExtensionIndication();
    gravity.update(1, true, false);
    expect(runFor(118, (dt) => gravity.update(dt, true, false))).toBe(true);
    expect(runFor(2, (dt) => gravity.update(dt, true, false))).toBe(false);
  });

  it('reads all gears downlocked from either LGCIS', () => {
    expect(allGearsDownlocked(word(DOWNLOCKED), FAILED)).toBe(true);
    expect(allGearsDownlocked(word([23, 24]), word([25]))).toBe(true);
    expect(allGearsDownlocked(word([23, 24]), word([23, 24]))).toBe(false);
  });
});
