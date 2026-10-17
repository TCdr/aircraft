// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import {
  allGearsDownlocked,
  GearDoorIndication,
  gearDoorIndication,
  GearTriangle,
  gearTriangle,
  GravityExtensionIndication,
  LgciuGear,
  LgCtlIndication,
} from './LgersIndications';

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

describe('WHEEL page landing gear triangles', () => {
  // word 3 bits 11/12/13: left/right/nose gear not uplocked; word 1 bits 23/24/25: downlocked
  it('shows no triangle when the gear is uplocked', () => {
    expect(gearTriangle(word([]), word([]), LgciuGear.Left)).toBe(GearTriangle.Hidden);
  });

  it('shows a green triangle when the gear is downlocked', () => {
    expect(gearTriangle(word([25]), word([13]), LgciuGear.Nose)).toBe(GearTriangle.Downlocked);
  });

  it('shows a red triangle when the gear is in transit', () => {
    expect(gearTriangle(word([]), word([12]), LgciuGear.Right)).toBe(GearTriangle.InTransit);
  });

  it('reads the bits of its own gear', () => {
    // right gear downlocked, left gear not uplocked and not downlocked
    expect(gearTriangle(word([24]), word([11, 12]), LgciuGear.Left)).toBe(GearTriangle.InTransit);
    expect(gearTriangle(word([24]), word([11, 12]), LgciuGear.Right)).toBe(GearTriangle.Downlocked);
  });

  it('shows amber crosses when that LGCIS data is lost', () => {
    expect(gearTriangle(FAILED, word([11]), LgciuGear.Left)).toBe(GearTriangle.Invalid);
    expect(gearTriangle(word([23]), FAILED, LgciuGear.Left)).toBe(GearTriangle.Invalid);
  });
});

describe('WHEEL page landing gear doors', () => {
  // word 1 bits 17/18/19: left/right/nose door not uplocked; word 3 bits 25/26/27: door fully open
  it('is closed (green) when the door is uplocked', () => {
    expect(gearDoorIndication(word([]), word([]), word([]), word([]), LgciuGear.Nose)).toBe(GearDoorIndication.Closed);
  });

  it('is in transit when the door is not uplocked and not fully open', () => {
    expect(gearDoorIndication(word([17]), word([17]), word([]), word([]), LgciuGear.Left)).toBe(
      GearDoorIndication.InTransit,
    );
  });

  it('is open when the door is fully open', () => {
    expect(gearDoorIndication(word([18]), word([18]), word([26]), word([26]), LgciuGear.Right)).toBe(
      GearDoorIndication.Open,
    );
  });

  it('uses the valid LGCIS when the other is lost, amber crosses when both are lost', () => {
    expect(gearDoorIndication(FAILED, word([19]), FAILED, word([27]), LgciuGear.Nose)).toBe(GearDoorIndication.Open);
    expect(gearDoorIndication(FAILED, FAILED, FAILED, FAILED, LgciuGear.Nose)).toBe(GearDoorIndication.Invalid);
  });

  it('reads the bits of its own door', () => {
    expect(gearDoorIndication(word([17]), word([17]), word([25]), word([25]), LgciuGear.Right)).toBe(
      GearDoorIndication.Closed,
    );
  });
});
