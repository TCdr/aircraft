// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../Localization/data/en.json';
import { A380SeatOutlineBg } from '../../../../Assets/A380SeatOutlineBg';
import { A380_FWD_CARGO_DOOR, A380_SERVICE_DOORS, A380ServiceDoor } from './A380ServiceDoors';

/* The model and the flight model are read as data files (the repo root is ten folders up) */
const fromRoot = (path: string) => readFileSync(resolve(__dirname, '../../../../../../../../../..', path), 'utf-8');
const a380Base = 'fbw-a380x/src/base/flybywire-aircraft-a380-842';
const doorAnimations = fromRoot(`${a380Base}/ModelBehaviorDefs/fbw_a380x/Templates/Anims_Door.xml`);
const flightModel = fromRoot(`${a380Base}/SimObjects/AirPlanes/FlyByWire_A380X/common/config/flight_model.cfg`);
// the Payload page drawing, as the SVG markup of the component
const payloadDrawing = renderToStaticMarkup(
  React.createElement(A380SeatOutlineBg, { stroke: 'black', highlight: 'red' }),
);
const gsxProfile = fromRoot(
  `${a380Base}/SimObjects/AirPlanes/FlyByWire_A380X/presets/flybywire/FlyByWire_A380_842/config/GSX.cfg`,
);
const servicesLabels: Record<string, unknown> = en.Ground.Services;

const doors = Object.entries(A380_SERVICE_DOORS) as [string, A380ServiceDoor][];

/** Deck, number and side of a door name such as M5R */
function parseDoor(door: string): { upperDeck: boolean; doorNumber: number; side: string } {
  const match = /^([MU])(\d)([LR])$/.exec(door);
  expect(match, door).not.toBeNull();
  return { upperDeck: match[1] === 'U', doorNumber: Number(match[2]), side: match[3] };
}

/** An interactive point of flight_model.cfg: Z (ft, + forward), X (ft, + right) and type (0 = main exit) */
function interactivePoint(index: number): { index: number; z: number; x: number; type: number } {
  const point = new RegExp(
    `^interactive_point\\.${index} = [^,]+, ([-\\d.]+), ([-\\d.]+), [-\\d.]+, (\\d+),`,
    'm',
  ).exec(flightModel);
  expect(point, `interactive_point.${index}`).not.toBeNull();
  return { index, z: Number(point[1]), x: Number(point[2]), type: Number(point[3]) };
}

describe('A380X flyPad Services doors', () => {
  it.each(doors)('%s: the model animates and toggles the same door from its interactive point and exit', (_, door) => {
    // FBW_A380X_Components_Door: <DOOR_ID> is the door, <ID> its interactive point, <TOGGLE_ID> its exit
    const block = new RegExp(
      `<DOOR_ID>${door.door}</DOOR_ID>\\s*<ID>(\\d+)</ID>\\s*<TOGGLE_ID>(\\d+)</TOGGLE_ID>`,
    ).exec(doorAnimations);
    expect(block, `${door.door} in Anims_Door.xml`).not.toBeNull();
    expect(Number(block[1])).toBe(door.interactivePoint);
    expect(Number(block[2])).toBe(door.exit);
  });

  it.each(doors)('%s: the button label names the door of its interactive point', (_, door) => {
    const { upperDeck, doorNumber, side } = parseDoor(door.door);
    const label = servicesLabels[door.labelKey.replace('Ground.Services.', '')];
    expect(label).toBe(`${upperDeck ? 'Upper deck' : 'Main'} ${doorNumber} ${side}`);
  });

  it.each(doors)('%s: the planform label and drawing are those of the door', (_, door) => {
    const { upperDeck, doorNumber, side } = parseDoor(door.door);
    expect(door.planformLabel).toBe(upperDeck ? `U${doorNumber}${side}` : `${doorNumber} ${side}`);
    if (!upperDeck) {
      // The Payload page drawing has main deck doors 1, 2, 4 and 5 (FWD, MID-FWD, MID-AFT, AFT)
      const drawing = { 1: 'FWD', 2: 'MID-FWD', 4: 'MID-AFT', 5: 'AFT' }[doorNumber];
      expect(door.planformArtId).toBe(`${drawing}_${side}_Door`);
      // the marker sits on the drawn door: its path starts at the door's aft edge, about 8 units long
      const path = new RegExp(`id="${door.planformArtId}"\\s*d="M(\\d+\\.?\\d*),`).exec(payloadDrawing);
      expect(path, door.planformArtId).not.toBeNull();
      expect(Math.abs(Number(path[1]) - 4 - door.planformAt)).toBeLessThan(3);
    }
  });

  it('point 9 is MAIN 5R, the aftmost main deck door on the right (flight_model.cfg)', () => {
    const mainDeckZ = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => interactivePoint(index).z);
    expect(interactivePoint(9).z).toBe(Math.min(...mainDeckZ));
    expect(interactivePoint(9).x).toBeGreaterThan(0);
    expect(A380_SERVICE_DOORS.main5R.interactivePoint).toBe(9);
  });

  it.each(doors)('%s: its point is door n from the nose on its deck and side (flight_model.cfg)', (_, door) => {
    const { upperDeck, doorNumber, side } = parseDoor(door.door);
    // [INTERACTIVE POINTS]: points 0-9 are the main deck, 10-15 the upper deck; X > 0 is the right side
    const deckPoints = upperDeck ? [10, 11, 12, 13, 14, 15] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const sidePointsNoseFirst = deckPoints
      .map(interactivePoint)
      .filter((point) => (side === 'R' ? point.x > 0 : point.x < 0))
      .sort((a, b) => b.z - a.z);
    expect(sidePointsNoseFirst[doorNumber - 1].index).toBe(door.interactivePoint);
  });

  it('MAIN 4R (point 7, exit 8) has its own switch, listed just before MAIN 5R', () => {
    const keys = Object.keys(A380_SERVICE_DOORS);
    const main4R = doors.find(([, door]) => door.door === 'M4R');
    expect(main4R, 'a MAIN 4R switch').toBeDefined();
    expect(main4R[1]).toMatchObject({ interactivePoint: 7, exit: 8, labelKey: 'Ground.Services.DoorMain4R' });
    expect(keys.indexOf(main4R[0]) + 1).toBe(keys.indexOf('main5R'));
    expect(servicesLabels.DoorMain4R).toBe('Main 4 R');
    // a main exit (type 0) on the right at Z = -32 ft, 28 ft forward of MAIN 5R
    const point7 = interactivePoint(7);
    expect([point7.z, point7.x > 0, point7.type]).toEqual([-32, true, 0]);
  });

  it('every passenger door GSX boards at has a switch, so a door GSX opened can be closed from the page', () => {
    // GSX.cfg [exitN]: the code is the K:TOGGLE_AIRCRAFT_EXIT exit GSX opens, the name the door
    const gsxExits = [...gsxProfile.matchAll(/^\[exit\d+\][^[]*?^code = (\d+)\s*^name = Door (\w+)/gm)].map(
      ([, code, door]) => ({ door, exit: Number(code) }),
    );
    expect(gsxExits.map((exit) => exit.door)).toEqual(['M1L', 'M2L', 'M4L', 'M5L']);
    for (const gsxExit of gsxExits) {
      const door = doors.find(([, serviceDoor]) => serviceDoor.door === gsxExit.door);
      expect(door, `a ${gsxExit.door} switch`).toBeDefined();
      expect(door[1].exit).toBe(gsxExit.exit);
    }
  });

  it('the forward cargo door is the first cargo point of flight_model.cfg, exit = point + 1', () => {
    const cargo = flightModel.slice(flightModel.indexOf('; Cargo'));
    expect(Number(/^interactive_point\.(\d+) =/m.exec(cargo)[1])).toBe(A380_FWD_CARGO_DOOR.interactivePoint);
    expect(A380_FWD_CARGO_DOOR.exit).toBe(A380_FWD_CARGO_DOOR.interactivePoint + 1);
  });
});
