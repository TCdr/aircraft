// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { mockSimVars, MockedSimVarValues } from '../../../../../fbw-common/src/jest/MockedSimVars';
import {
  areNoSmokingSignsOn,
  areSeatBeltsSignsOn,
  areSlatsExtended,
  CabinSigns,
  CabinSignsSwitchPosition,
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

const retractedWord = Arinc429Word.getRawWord(1 << 11, Arinc429SignStatusMatrix.NormalOperation);
const extendedWord = Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NormalOperation);

/** The CabinSigns instrument over mocked simvars: slats retracted, no cabin altitude, no gear, both switches AUTO */
function cabinSignsHarness() {
  const simVars: MockedSimVarValues = new Map();
  const { setSimVarValue } = mockSimVars(simVars);
  simVars.set('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD', retractedWord);
  simVars.set('L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD', retractedWord);
  simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', CabinSignsSwitchPosition.Auto);
  simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', CabinSignsSwitchPosition.Auto);
  return { cabinSigns: new CabinSigns(), simVars, setSimVarValue };
}

describe('A380X cabin NO SMOKING signs', () => {
  it('ON: the signs come on; OFF: they go off', () => {
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

  it('AUTO: on when "The slats are extended, or The main landing gear is extended."', () => {
    expect(areNoSmokingSignsOn(cruise)).toBe(false);
    expect(areNoSmokingSignsOn({ ...cruise, slatsExtended: true })).toBe(true);
    expect(areNoSmokingSignsOn({ ...cruise, mainGearExtended: true })).toBe(true);
  });

  it('excessive cabin altitude: on regardless of the switch', () => {
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
});

describe('CabinSigns instrument, NO SMOKING signs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const memoWrites = (setSimVarValue: ReturnType<typeof cabinSignsHarness>['setSimVarValue']) =>
    setSimVarValue.mock.calls.filter(([name]) => name === 'L:A32NX_NO_SMOKING_MEMO').map(([, , value]) => value);

  it('is the source of L:A32NX_NO_SMOKING_MEMO, written on a change only', () => {
    const { cabinSigns, simVars, setSimVarValue } = cabinSignsHarness();

    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', CabinSignsSwitchPosition.On);
    cabinSigns.onUpdate();
    cabinSigns.onUpdate();
    expect(memoWrites(setSimVarValue)).toEqual([true]);

    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', CabinSignsSwitchPosition.Off);
    cabinSigns.onUpdate();
    expect(memoWrites(setSimVarValue)).toEqual([true, false]);
  });

  it('AUTO: stays off in the clean configuration', () => {
    const { cabinSigns, setSimVarValue } = cabinSignsHarness();
    cabinSigns.onUpdate();
    expect(memoWrites(setSimVarValue)).toEqual([false]);
  });

  it.each([
    ['a main gear downlocked', { 'L:A32NX_LGCIU_2_RIGHT_GEAR_DOWNLOCKED': 1 }],
    [
      'slats extended (no valid SFCC reports them retracted)',
      {
        'L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD': extendedWord,
        'L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD': extendedWord,
      },
    ],
    [
      'an excessive cabin altitude',
      { 'L:A32NX_PRESS_CABIN_ALTITUDE_B1': Arinc429Word.getRawWord(12000, Arinc429SignStatusMatrix.NormalOperation) },
    ],
  ])('AUTO: comes on with %s', (_description, changes) => {
    const { cabinSigns, simVars, setSimVarValue } = cabinSignsHarness();
    cabinSigns.onUpdate();
    for (const [name, value] of Object.entries(changes)) {
      simVars.set(name, value);
    }
    cabinSigns.onUpdate();
    expect(memoWrites(setSimVarValue)).toEqual([false, true]);
  });

  it('AUTO: stays off while one SFCC still reports the slats retracted', () => {
    const { cabinSigns, simVars, setSimVarValue } = cabinSignsHarness();
    simVars.set('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD', extendedWord);
    simVars.set('L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD', retractedWord);
    cabinSigns.onUpdate();
    expect(memoWrites(setSimVarValue)).toEqual([false]);
  });

  it('the FWS does not write L:A32NX_NO_SMOKING_MEMO', () => {
    const fwsCore = readFileSync(resolve(__dirname, '../CpiomC/FlightWarningSystem/FwsCore.ts'), 'utf-8');
    expect(fwsCore).not.toContain("SimVar.SetSimVarValue('L:A32NX_NO_SMOKING_MEMO'");
  });
});

describe('A380X cabin FASTEN SEAT BELT signs', () => {
  it('ON: the signs come on; OFF: they go off', () => {
    expect(areSeatBeltsSignsOn({ ...cruise, switchPosition: CabinSignsSwitchPosition.On })).toBe(true);
    expect(
      areSeatBeltsSignsOn({
        ...cruise,
        switchPosition: CabinSignsSwitchPosition.Off,
        slatsExtended: true,
        mainGearExtended: true,
      }),
    ).toBe(false);
  });

  it('AUTO: on when "The slats are extended, or The main landing gear is extended.", no engine term', () => {
    expect(areSeatBeltsSignsOn(cruise)).toBe(false);
    expect(areSeatBeltsSignsOn({ ...cruise, slatsExtended: true })).toBe(true);
    expect(areSeatBeltsSignsOn({ ...cruise, mainGearExtended: true })).toBe(true);
  });

  it('excessive cabin altitude: on regardless of the switch', () => {
    for (const switchPosition of [CabinSignsSwitchPosition.Off, CabinSignsSwitchPosition.Auto]) {
      expect(areSeatBeltsSignsOn({ ...cruise, switchPosition, cabinAltitudeExcessive: true })).toBe(true);
    }
  });
});

describe('CabinSigns instrument, FASTEN SEAT BELT signs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const toggles = (setSimVarValue: ReturnType<typeof cabinSignsHarness>['setSimVarValue']) =>
    setSimVarValue.mock.calls.filter(([name]) => name === 'K:CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE').length;

  it('is the source of A:CABIN SEATBELTS ALERT SWITCH: toggles it to follow the switch, no engine or slat angle rule', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const { cabinSigns, simVars, setSimVarValue } = cabinSignsHarness();
    // engines running and slats at 19 degrees do not turn the signs on by themselves
    simVars.set('L:A32NX_ENGINE_N1:1', 60);
    cabinSigns.onUpdate();
    expect(toggles(setSimVarValue)).toBe(0);

    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', CabinSignsSwitchPosition.On);
    cabinSigns.onUpdate();
    expect(toggles(setSimVarValue)).toBe(1);

    // the sim has not applied the toggle yet: no second toggle within the settle time
    now.mockReturnValue(10_200);
    cabinSigns.onUpdate();
    expect(toggles(setSimVarValue)).toBe(1);

    // the sim shows the signs on: nothing more to do
    simVars.set('A:CABIN SEATBELTS ALERT SWITCH', 1);
    now.mockReturnValue(12_000);
    cabinSigns.onUpdate();
    expect(toggles(setSimVarValue)).toBe(1);

    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', CabinSignsSwitchPosition.Off);
    cabinSigns.onUpdate();
    expect(toggles(setSimVarValue)).toBe(2);
  });

  // The cockpit XML cannot be run in a unit test for this point (an absent rule): text check of the model file
  it('the cockpit XML has no seat belt toggle of its own', () => {
    const cockpitBehavior = readFileSync(
      resolve(
        __dirname,
        '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml',
      ),
      'utf-8',
    );
    expect(cockpitBehavior).not.toContain('CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE');
    expect(cockpitBehavior).not.toContain('(L:A32NX_ENGINE_N1:1) 10 &gt;');
  });
});
