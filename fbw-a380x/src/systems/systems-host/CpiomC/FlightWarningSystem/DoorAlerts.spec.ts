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
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import type { FwsCore } from './FwsCore';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/*
 * flight_model.cfg is an aircraft configuration file, not importable code: it is read as text.
 */
const flightModel = readFileSync(
  resolve(
    __dirname,
    '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/config/flight_model.cfg',
  ),
  'utf-8',
);

/** The CAB PRESS door condition reads the door signals of the previous cycle, so it needs two cycles to follow */
function cycleTwice(core: FwsCore) {
  runFwsCycle(core);
  runFwsCycle(core);
}

/** The simvars that put every cabin door closed and both cargo doors closed and locked */
function closeAllDoors(simVars: Map<string, number | boolean | string>) {
  CABIN_DOORS.forEach((_, point) => simVars.set(`INTERACTIVE POINT OPEN:${point}`, 0));
  CARGO_DOORS.forEach((door) => simVars.set(cargoDoorLockedVariable(door), 1));
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

  it('a passenger door whose position the DSMS does not know has no NOT CLOSED alert (POS DET FAULT instead)', () => {
    expect(isCabinDoorNotClosed(1, true)).toBe(false);
    expect(isCabinDoorNotClosed(1, false)).toBe(true);
  });

  it('a cargo door is not closed unless its locked L:var is set', () => {
    expect(isCargoDoorNotClosed(1)).toBe(false);
    expect(isCargoDoorNotClosed(0)).toBe(true);
  });

  it('a cargo door has no NOT CLOSED alert with the three DSMS channels lost (DOOR POS DET FAULT inhibits it)', () => {
    expect(isCargoDoorNotClosed(0, true)).toBe(false);
    expect(isCargoDoorNotClosed(0, false)).toBe(true);
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
    const { core, simVars } = createFws(new Set());
    closeAllDoors(simVars);
    cycleTwice(core);
    expect(core.anyDoorNotClosed.get()).toBe(false);

    CABIN_DOORS.forEach((_, point) => {
      simVars.set(`INTERACTIVE POINT OPEN:${point}`, 1);
      cycleTwice(core);
      expect(core.anyDoorNotClosed.get(), CABIN_DOORS[point]).toBe(true);
      simVars.set(`INTERACTIVE POINT OPEN:${point}`, 0);
    });
    CARGO_DOORS.forEach((door) => {
      simVars.set(cargoDoorLockedVariable(door), 0);
      cycleTwice(core);
      expect(core.anyDoorNotClosed.get(), door).toBe(true);
      simVars.set(cargoDoorLockedVariable(door), 1);
    });
    cycleTwice(core);
    expect(core.anyDoorNotClosed.get()).toBe(false);
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

  it('FwsCore T.O CONFIG NORMAL reads every door and both sliding windows', () => {
    const { core, simVars } = createFws(new Set());
    closeAllDoors(simVars);
    runFwsCycle(core);
    expect(core.doorsInTakeoffConfig()).toBe(true);

    CABIN_DOORS.forEach((_, point) => {
      simVars.set(`INTERACTIVE POINT OPEN:${point}`, 1);
      runFwsCycle(core);
      expect(core.doorsInTakeoffConfig(), CABIN_DOORS[point]).toBe(false);
      simVars.set(`INTERACTIVE POINT OPEN:${point}`, 0);
    });
    simVars.set('L:FO_SLIDING_WINDOW', 1);
    runFwsCycle(core);
    expect(core.doorsInTakeoffConfig()).toBe(false);
  });
});

describe('DOOR ... NOT CLOSED alerts', () => {
  it.each(CABIN_DOORS.map((door, index) => [cabinDoorNotClosedAlertId(index), door]))(
    '%s is the text of DOOR %s NOT CLOSED',
    (id, door) => {
      expect(EcamAbnormalProcedures[id].title).toContain(`DOOR\x1bm ${door} NOT CLOSED`);
    },
  );

  it.each(CARGO_DOORS.map((door, index) => [cargoDoorNotClosedAlertId(index), door]))(
    '%s is the text of DOOR %s CARGO NOT CLOSED',
    (id, door) => {
      expect(EcamAbnormalProcedures[id].title).toContain(`DOOR\x1bm ${door} CARGO NOT CLOSED`);
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
    const items = EcamAbnormalProcedures[id].items;
    const condition = items.findIndex((item) => item.name === 'ABNORM CAB V/S');
    expect(condition).toBeGreaterThanOrEqual(0);
    expect(items[condition]).toMatchObject({ sensed: false, condition: true });
    expect(items[condition + 1]).toMatchObject({ name: 'MAX FL : 100/MEA-MORA', sensed: false, level: 1 });
    expect(items.some((item) => item.name === 'DESCENT TO FL 100/MEA-MORA')).toBe(true);
  });

  it('FwsAbnormalSensed builds one alert per passenger and cargo door', () => {
    const { core } = createFws(new Set());
    const alerts = core.abnormalSensed.ewdAbnormalSensed;
    core.cabinDoorNotClosed.forEach((doorNotClosed, index) => {
      expect(alerts[cabinDoorNotClosedAlertId(index)].simVarIsActive).toBe(doorNotClosed);
    });
    core.cargoDoorNotClosed.forEach((doorNotClosed, index) => {
      expect(alerts[cargoDoorNotClosedAlertId(index)].simVarIsActive).toBe(doorNotClosed);
    });
  });
});
