// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { doorBits, DSMS_VARS, PASSENGER_DOOR_COUNT } from '@shared/DoorsAndSlides';
import { MockedSimVarValues, mockSimVars } from '../../../../../fbw-common/src/jest/MockedSimVars';
import { CabinOxygenMasks } from './CabinOxygenMasks';
import { CabinSigns } from './CabinSigns';
import { DOOR_FAILURES, DoorsAndSlidesManagementSystem } from './DoorsAndSlidesManagement';

/*
 * These systems run on every frame of the systems host: they read their simvars through registered handles, made once,
 * so that an update builds no simvar names (garbage in the one JavaScript heap of the cockpit).
 */

const UPDATES = 5;

let simVars: MockedSimVarValues;
let spies: ReturnType<typeof mockSimVars>;

beforeEach(() => {
  simVars = new Map();
  spies = mockSimVars(simVars);
});

function runUpdatesWithoutNameReads(update: () => void, updates = UPDATES): void {
  spies.getSimVarValue.mockClear();
  for (let i = 0; i < updates; i++) {
    update();
  }
  expect(spies.getSimVarValue).not.toHaveBeenCalled();
}

const normalWord = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);

describe('doors and slides management system', () => {
  it('publishes the door monitoring and the flight lock from the registered simvars', () => {
    const failedLdc = DOOR_FAILURES.Ldc[0];
    const system = new DoorsAndSlidesManagementSystem(
      { deltaTime: 200 },
      { register: () => {}, isActive: (failure) => failure === failedLdc },
    );
    simVars.set('AIRSPEED INDICATED', 120);
    simVars.set('PRESSURE ALTITUDE', 5000);

    runUpdatesWithoutNameReads(() => system.onUpdate());

    const onlyFirstDoor = Array.from({ length: PASSENGER_DOOR_COUNT }, (_, door) => door === 0);
    expect(simVars.get(DSMS_VARS.ldcFault)).toBe(doorBits(onlyFirstDoor));
    expect(simVars.get(DSMS_VARS.positionInvalid)).toBe(doorBits(onlyFirstDoor));
    expect(simVars.get(DSMS_VARS.flightLockEngaged)).toBe(doorBits(onlyFirstDoor.map((unmonitored) => !unmonitored)));
  });

  it('does not lock the doors below 65 kt', () => {
    const system = new DoorsAndSlidesManagementSystem(
      { deltaTime: 200 },
      { register: () => {}, isActive: () => false },
    );
    simVars.set('AIRSPEED INDICATED', 30);
    simVars.set('PRESSURE ALTITUDE', 0);

    runUpdatesWithoutNameReads(() => system.onUpdate());

    expect(simVars.get(DSMS_VARS.flightLockEngaged)).toBe(0);
  });
});

describe('cabin signs', () => {
  it('turns the signs on with a main gear downlocked in AUTO, from the registered simvars', () => {
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', 1);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', 1);
    simVars.set('L:A32NX_LGCIU_2_RIGHT_GEAR_DOWNLOCKED', 1);
    const signs = new CabinSigns();

    runUpdatesWithoutNameReads(() => signs.onUpdate(), 1);

    expect(simVars.get('L:A32NX_NO_SMOKING_MEMO')).toBe(true);
    expect(spies.setSimVarValue).toHaveBeenCalledWith('K:CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE', 'number', 0);
  });

  it('turns the signs off in AUTO with the gear up and the slats retracted', () => {
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', 1);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', 1);
    simVars.set('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD', normalWord(1 << 11));
    const signs = new CabinSigns();

    runUpdatesWithoutNameReads(() => signs.onUpdate());

    expect(simVars.get('L:A32NX_NO_SMOKING_MEMO')).toBe(false);
  });

  it('turns the signs on for an excessive cabin altitude whatever the switch', () => {
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', 2);
    simVars.set('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', 2);
    simVars.set('L:A32NX_PRESS_CABIN_ALTITUDE_B3', normalWord(10_000));
    const signs = new CabinSigns();

    runUpdatesWithoutNameReads(() => signs.onUpdate());

    expect(simVars.get('L:A32NX_NO_SMOKING_MEMO')).toBe(true);
  });
});

describe('cabin oxygen masks', () => {
  it('drops the masks above 13 800 ft cabin altitude with DC ESS powered', () => {
    simVars.set('L:A32NX_PRESS_CABIN_ALTITUDE_B2', normalWord(14_500));
    simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 1);
    const masks = new CabinOxygenMasks();

    runUpdatesWithoutNameReads(() => masks.onUpdate());

    expect(simVars.get('L:A32NX_OXYGEN_MASKS_DEPLOYED')).toBe(true);
  });

  it('keeps the masks without DC ESS', () => {
    simVars.set('L:A32NX_PRESS_CABIN_ALTITUDE_B2', normalWord(14_500));
    const masks = new CabinOxygenMasks();

    runUpdatesWithoutNameReads(() => masks.onUpdate());

    expect(simVars.get('L:A32NX_OXYGEN_MASKS_DEPLOYED')).toBeUndefined();
  });
});
