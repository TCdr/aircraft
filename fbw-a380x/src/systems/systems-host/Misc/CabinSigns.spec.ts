// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  areNoSmokingSignsOn,
  areSlatsExtended,
  isCabinAltitudeExcessive,
  NoSmokingSignsInputs,
  NoSmokingSwitchPosition,
} from './CabinSigns';

const cruise: NoSmokingSignsInputs = {
  switchPosition: NoSmokingSwitchPosition.Auto,
  slatsExtended: false,
  mainGearExtended: false,
  cabinAltitudeExcessive: false,
};

/** A slat/flap actual position word, bit 12 = slats retracted */
const sfccWord = (slatsRetracted: boolean, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  new Arinc429Word(Arinc429Word.getRawWord(slatsRetracted ? 1 << 11 : 0, ssm));

/* A380 FCOM DSC-33-50-10 SIGNS, NO SMOKING sw (a380_fcom.txt l.84079-84098) */
describe('A380X cabin NO SMOKING signs', () => {
  it('ON: the signs come on (l.84080); OFF: they go off (l.84091)', () => {
    expect(areNoSmokingSignsOn({ ...cruise, switchPosition: NoSmokingSwitchPosition.On })).toBe(true);
    expect(
      areNoSmokingSignsOn({
        ...cruise,
        switchPosition: NoSmokingSwitchPosition.Off,
        slatsExtended: true,
        mainGearExtended: true,
      }),
    ).toBe(false);
  });

  it('AUTO: on when "The slats are extended, or The main landing gear is extended." (l.84083-84087)', () => {
    expect(areNoSmokingSignsOn(cruise)).toBe(false);
    expect(areNoSmokingSignsOn({ ...cruise, slatsExtended: true })).toBe(true);
    expect(areNoSmokingSignsOn({ ...cruise, mainGearExtended: true })).toBe(true);
  });

  it('excessive cabin altitude: on regardless of the switch (l.84095-84098)', () => {
    for (const switchPosition of [NoSmokingSwitchPosition.Off, NoSmokingSwitchPosition.Auto]) {
      expect(areNoSmokingSignsOn({ ...cruise, switchPosition, cabinAltitudeExcessive: true })).toBe(true);
    }
  });

  it('"the cabin altitude exceeds the maximum of: 9 550 ft and the landing field elevation + 1 000 ft"', () => {
    expect(isCabinAltitudeExcessive(9500, 0)).toBe(false);
    expect(isCabinAltitudeExcessive(9600, 0)).toBe(true);
    expect(isCabinAltitudeExcessive(9600, null)).toBe(true);
    // high landing field (e.g. 9 000 ft): the limit is 10 000 ft
    expect(isCabinAltitudeExcessive(9600, 9000)).toBe(false);
    expect(isCabinAltitudeExcessive(10100, 9000)).toBe(true);
    expect(isCabinAltitudeExcessive(null, 0)).toBe(false);
  });

  it('slats extended: no valid SFCC reports them retracted', () => {
    expect(areSlatsExtended([sfccWord(true), sfccWord(true)])).toBe(false);
    expect(areSlatsExtended([sfccWord(false), sfccWord(false)])).toBe(true);
    expect(areSlatsExtended([sfccWord(true, Arinc429SignStatusMatrix.FailureWarning), sfccWord(false)])).toBe(true);
    expect(
      areSlatsExtended([
        sfccWord(false, Arinc429SignStatusMatrix.FailureWarning),
        sfccWord(false, Arinc429SignStatusMatrix.NoComputedData),
      ]),
    ).toBe(false);
  });

  it('is the source of L:A32NX_NO_SMOKING_MEMO (no longer forced on by the FWS)', () => {
    const systemsHost = readFileSync(resolve(__dirname, '../SystemsHost.ts'), 'utf-8');
    expect(systemsHost).toContain("this.backplane.addInstrument('CabinSigns', this.cabinSigns);");
    const fwsCore = readFileSync(resolve(__dirname, '../CpiomC/FlightWarningSystem/FwsCore.ts'), 'utf-8');
    expect(fwsCore).not.toContain("SimVar.SetSimVarValue('L:A32NX_NO_SMOKING_MEMO'");
  });
});
