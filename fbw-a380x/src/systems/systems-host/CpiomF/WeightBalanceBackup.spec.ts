// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  slatsAndFlapsRetractedFromSfcc,
  WbbcInputs,
  wbbcOutputSsm,
  WeightBalanceBackupComputer,
} from './WeightBalanceBackup';

const climb = (inputs: Partial<WbbcInputs> = {}): WbbcInputs => ({
  onGround: false,
  slatsAndFlapsRetracted: true,
  aerodynamicGrossWeightKg: 500_000,
  aerodynamicCgPercentMac: 38,
  fuelUsedKg: 2_000,
  ...inputs,
});

/** An SFCC slat/flap actual position word with the given bits set */
function sfccWord(bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Word {
  const register = Arinc429Register.empty();
  register.setSsm(ssm);
  bits.forEach((bit) => register.setBitValue(bit, true));
  return new Arinc429Word(register.rawWord);
}

describe('A380 Weight and Balance Backup Computer', () => {
  it('computes nothing on ground nor before the slats and flaps retraction', () => {
    const wbbc = new WeightBalanceBackupComputer();
    expect(wbbc.update(climb({ onGround: true }))).toEqual({ grossWeightKg: null, cgPercentMac: null });
    expect(wbbc.update(climb({ slatsAndFlapsRetracted: false }))).toEqual({ grossWeightKg: null, cgPercentMac: null });
  });

  it('gives the aerodynamic GW and CG while the slats and flaps are retracted', () => {
    const wbbc = new WeightBalanceBackupComputer();
    expect(wbbc.update(climb())).toEqual({ grossWeightKg: 500_000, cgPercentMac: 38 });
  });

  it('after slats/flaps extension: GW from the takeoff GW and the fuel used, no CG', () => {
    const wbbc = new WeightBalanceBackupComputer();
    wbbc.update(climb());
    wbbc.update(climb({ aerodynamicGrossWeightKg: 420_000, fuelUsedKg: 80_000 }));
    expect(
      wbbc.update(climb({ slatsAndFlapsRetracted: false, aerodynamicGrossWeightKg: 1, fuelUsedKg: 90_000 })),
    ).toEqual({ grossWeightKg: 500_000 - 88_000, cgPercentMac: null });
  });

  it('without a valid SFCC position, the GW comes from the fuel used too', () => {
    const wbbc = new WeightBalanceBackupComputer();
    wbbc.update(climb());
    expect(wbbc.update(climb({ slatsAndFlapsRetracted: null, fuelUsedKg: 3_000 }))).toEqual({
      grossWeightKg: 499_000,
      cgPercentMac: null,
    });
  });

  it('starts again after a landing', () => {
    const wbbc = new WeightBalanceBackupComputer();
    wbbc.update(climb());
    wbbc.update(climb({ onGround: true }));
    expect(wbbc.update(climb({ slatsAndFlapsRetracted: false }))).toEqual({ grossWeightKg: null, cgPercentMac: null });
    expect(wbbc.update(climb({ aerodynamicGrossWeightKg: 300_000 })).grossWeightKg).toBe(300_000);
  });

  it('reads the slats and flaps retracted from the SFCC word (bits 11/18 valid, 12/19 retracted)', () => {
    expect(slatsAndFlapsRetractedFromSfcc(sfccWord([11, 12, 18, 19]))).toBe(true);
    expect(slatsAndFlapsRetractedFromSfcc(sfccWord([11, 12, 18]))).toBe(false);
    expect(slatsAndFlapsRetractedFromSfcc(sfccWord([11, 18, 19]))).toBe(false);
    expect(slatsAndFlapsRetractedFromSfcc(sfccWord([12, 18, 19]))).toBe(null);
    expect(slatsAndFlapsRetractedFromSfcc(sfccWord([11, 12, 18, 19], Arinc429SignStatusMatrix.FailureWarning))).toBe(
      null,
    );
  });
});

describe('A380 WBBC failures', () => {
  it('both WBBCs failed: the outputs carry a failure warning (FUEL WEIGHT & BALANCE BKUP FAULT)', () => {
    expect(wbbcOutputSsm(true, true, 500_000)).toBe(Arinc429SignStatusMatrix.FailureWarning);
    expect(wbbcOutputSsm(true, true, null)).toBe(Arinc429SignStatusMatrix.FailureWarning);
  });

  it('one WBBC failed: the other one still computes', () => {
    expect(wbbcOutputSsm(true, false, 500_000)).toBe(Arinc429SignStatusMatrix.NormalOperation);
    expect(wbbcOutputSsm(false, true, null)).toBe(Arinc429SignStatusMatrix.NoComputedData);
  });
});
