// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  areDoorsInTakeoffConfig,
  CABIN_DOORS,
  CARGO_DOORS,
  cabinDoorNotClosedAlertId,
  cargoDoorLockedVariable,
  cargoDoorNotClosedAlertId,
  isAnyDoorNotClosed,
  isCabinDoorNotClosed,
  isCargoDoorNotClosed,
} from './DoorAlerts';

/*
 * Sources read as text (as FwsAbnormalSensedItems.spec.ts does: importing the EcamMessages tables in a test fails on a
 * circular import).
 */
const fromHere = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const flightModel = fromHere(
  '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/config/flight_model.cfg',
);
const doorTexts = fromHere('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56.ts');
const abnormalSensed = fromHere('FwsAbnormalSensed.ts');
const fwsCore = fromHere('FwsCore.ts');

/** The source of one ECAM text, from its id to the end of its object */
function textBlock(id: string): string {
  const start = doorTexts.indexOf(`  ${id}: {`);
  expect(start, `text ${id}`).toBeGreaterThan(0);
  return doorTexts.slice(start, doorTexts.indexOf('\n  },', start));
}

describe('A380X doors and their sim interactive points', () => {
  it('has 10 main deck and 6 upper deck passenger doors', () => {
    expect(CABIN_DOORS.filter((door) => door.startsWith('MAIN'))).toHaveLength(10);
    expect(CABIN_DOORS.filter((door) => door.startsWith('UPPER'))).toHaveLength(6);
  });

  it('matches flight_model.cfg: points 0-9 main deck, 10-15 upper deck, 16-17 cargo', () => {
    const section = (from: string, to: string) =>
      flightModel.slice(flightModel.indexOf(from), flightModel.indexOf(to, flightModel.indexOf(from)));
    const points = (text: string) => [...text.matchAll(/^interactive_point\.(\d+) =/gm)].map((m) => Number(m[1]));
    expect(points(section('; Main Deck', '; Upper Deck'))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(points(section('; Upper Deck', '; Cargo'))).toEqual([10, 11, 12, 13, 14, 15]);
    expect(points(section('; Cargo', '; Fuel'))).toEqual([16, 17]);
  });

  it('reads the cargo doors from the Rust hydraulic door lock L:vars, as the DOOR/OXY SD page', () => {
    expect(CARGO_DOORS.map(cargoDoorLockedVariable)).toEqual([
      'L:A32NX_FWD_DOOR_CARGO_LOCKED',
      'L:A32NX_AFT_DOOR_CARGO_LOCKED',
    ]);
  });
});

/* DOOR ... NOT CLOSED: the door is not closed and not locked */
describe('DOOR ... NOT CLOSED triggers', () => {
  it('a passenger door is not closed as soon as it moves off closed', () => {
    expect(isCabinDoorNotClosed(0)).toBe(false);
    expect(isCabinDoorNotClosed(0.01)).toBe(true);
    expect(isCabinDoorNotClosed(1)).toBe(true);
  });

  it('a cargo door is not closed unless its locked L:var is set', () => {
    expect(isCargoDoorNotClosed(1)).toBe(false);
    expect(isCargoDoorNotClosed(0)).toBe(true);
  });
});

/* CAB PRESS INHIBITED BY DOORS: at least one door is not closed and locked when takeoff power is applied */
describe('CAB PRESS INHIBITED BY DOORS door input', () => {
  const allClosed = () => CABIN_DOORS.map(() => false);

  it('is off with every door closed', () => {
    expect(isAnyDoorNotClosed(allClosed(), [false, false])).toBe(false);
  });

  it.each(CABIN_DOORS.map((door, index) => [door, index]))('is on with only %s open', (_door, index) => {
    const doors = allClosed();
    doors[index] = true;
    expect(isAnyDoorNotClosed(doors, [false, false])).toBe(true);
  });

  it.each(CARGO_DOORS.map((door, index) => [door, index]))('is on with only the %s cargo door open', (_door, index) => {
    const cargo = [false, false];
    cargo[index] = true;
    expect(isAnyDoorNotClosed(allClosed(), cargo)).toBe(true);
  });

  it('FwsCore feeds every passenger and cargo door to the CAB PRESS INHIBITED BY DOORS condition', () => {
    expect(fwsCore).toMatch(
      /this\.anyDoorNotClosed\.set\(\s*isAnyDoorNotClosed\(\s*this\.cabinDoorNotClosed\.map\([^)]*\)[^,]*,\s*this\.cargoDoorNotClosed\.map/,
    );
    expect(fwsCore).toMatch(/this\.inhibitedByDoors\.set\(\s*this\.anyDoorNotClosed\.get\(\)/);
    expect(fwsCore).toContain('CABIN_DOORS.map((_, point) =>');
  });
});

/*
 * The takeoff configuration test can trigger DOOR MAIN 1(2)(3)(4)(5) R(L) NOT CLOSED, DOOR UPPER 1(2)(3)(4) R(L) NOT
 * CLOSED, DOOR FWD(AFT)(MAIN)(UPPER)(BULK) CARGO NOT CLOSED and DOOR CKPT SLIDING WINDOW NOT CLOSED.
 */
describe('T.O CONFIG test door input', () => {
  const allClosed = () => CABIN_DOORS.map(() => false);

  it('is normal with every door and both sliding windows closed', () => {
    expect(areDoorsInTakeoffConfig(allClosed(), [false, false], false)).toBe(true);
  });

  it.each(CABIN_DOORS.map((door, index) => [door, index]))('is not normal with only %s open', (_door, index) => {
    const doors = allClosed();
    doors[index] = true;
    expect(areDoorsInTakeoffConfig(doors, [false, false], false)).toBe(false);
  });

  it.each(CARGO_DOORS.map((door, index) => [door, index]))(
    'is not normal with only the %s cargo door open',
    (_door, index) => {
      const cargo = [false, false];
      cargo[index] = true;
      expect(areDoorsInTakeoffConfig(allClosed(), cargo, false)).toBe(false);
    },
  );

  it('is not normal with a cockpit sliding window open', () => {
    expect(areDoorsInTakeoffConfig(allClosed(), [false, false], true)).toBe(false);
  });

  it('FwsCore T.O CONFIG NORMAL reads every door, not only interactive points 0 and 3', () => {
    const toConfigCheck = fwsCore.slice(
      fwsCore.indexOf('/* T.O. CONFIG CHECK */'),
      fwsCore.indexOf('this.toConfigNormal.set(', fwsCore.indexOf('/* T.O. CONFIG CHECK */')),
    );
    expect(toConfigCheck).toMatch(
      /const doors = areDoorsInTakeoffConfig\(\s*this\.cabinDoorNotClosed\.map\([^)]*\)[^,]*,\s*this\.cargoDoorNotClosed\.map\([^)]*\)[^,]*,\s*this\.cockpitWindowOpen\.get\(\),?\s*\);/,
    );
    expect(toConfigCheck).not.toContain('INTERACTIVE POINT OPEN');
    // The doors reach T.O CONFIG NORMAL either as a term of the condition or as its doorsInTakeoffConfig input.
    expect(toConfigCheck).toMatch(/const toConfigNormal =[^;]*(&& doors &&|doorsInTakeoffConfig: doors,)/);
  });
});

describe('DOOR ... NOT CLOSED alerts', () => {
  it.each(CABIN_DOORS.map((door, index) => [cabinDoorNotClosedAlertId(index), door]))(
    '%s is the text of DOOR %s NOT CLOSED',
    (id, door) => {
      expect(textBlock(id)).toContain(`DOOR\\x1bm ${door} NOT CLOSED'`);
    },
  );

  it.each(CARGO_DOORS.map((door, index) => [cargoDoorNotClosedAlertId(index), door]))(
    '%s is the text of DOOR %s CARGO NOT CLOSED',
    (id, door) => {
      expect(textBlock(id)).toContain(`DOOR\\x1bm ${door} CARGO NOT CLOSED'`);
    },
  );

  const allDoorAlertIds = [
    ...CABIN_DOORS.map((_, index) => cabinDoorNotClosedAlertId(index)),
    ...CARGO_DOORS.map((_, index) => cargoDoorNotClosedAlertId(index)),
  ];

  /*
   * In flight, IF ABNORM CAB V/S is followed by MAX FL 100/MEA, CABIN CREW ADVISE, ATC NOTIFY and DESCENT TO FL
   * 100/MEA INITIATE. The condition is confirmed by the crew (not sensed) and gates the four lines under it; it is also
   * what the FWS limitation MAX FL 100/MEA reads (checked[1]).
   */
  it.each(allDoorAlertIds)('%s: IF ABNORM CAB V/S is a crew-confirmed condition above its four lines', (id) => {
    expect(textBlock(id)).toMatch(
      /name: 'ABNORM CAB V\/S',\r?\n\s+sensed: false,\r?\n\s+condition: true,\r?\n\s+\},\r?\n\s+\{\r?\n\s+name: 'MAX FL : 100\/MEA-MORA',\r?\n\s+sensed: false,\r?\n\s+level: 1,/,
    );
    expect(textBlock(id)).toContain("name: 'DESCENT TO FL 100/MEA-MORA'");
  });

  it('FwsAbnormalSensed builds one alert per passenger and cargo door', () => {
    const generator = abnormalSensed.slice(abnormalSensed.indexOf('private doorNotClosedAlerts(): EwdAbnormalDict'));
    expect(generator).toMatch(
      /this\.fws\.cabinDoorNotClosed\.forEach\(\(doorNotClosed, index\) => \{\s+alerts\[cabinDoorNotClosedAlertId\(index\)\]/,
    );
    expect(generator).toMatch(
      /this\.fws\.cargoDoorNotClosed\.forEach\(\(doorNotClosed, index\) => \{\s+alerts\[cargoDoorNotClosedAlertId\(index\)\]/,
    );
    expect(abnormalSensed).toContain('...this.doorNotClosedAlerts(),');
    // No hand-written entry left that would override a generated one
    allDoorAlertIds.forEach((id) => expect(abnormalSensed).not.toContain(`    ${id}: {`));
  });
});
