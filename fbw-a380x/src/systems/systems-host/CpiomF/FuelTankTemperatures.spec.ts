// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  A380_FUEL_TANKS,
  FuelTankTemperatures,
  FuelTemperatureInputs,
  IN_FLIGHT_LOAD_FUEL_TEMPERATURE_C,
  surroundingTemperatureC,
} from './FuelTankTemperatures';

const index = (name: string) => A380_FUEL_TANKS.findIndex((tank) => tank.name === name);

/** Cruise at TAT -45 °C (SAT -60 °C), every tank full */
const cruise = (fillRatio = 1): FuelTemperatureInputs => ({
  onGround: false,
  outsideAirTemperatureC: -60,
  totalAirTemperatureC: -45,
  fillRatios: A380_FUEL_TANKS.map(() => fillRatio),
});

/** Runs the model for some hours, one update a minute */
function runHours(model: FuelTankTemperatures, inputs: FuelTemperatureInputs, hours: number): readonly number[] {
  let temperatures: readonly number[] = [];
  for (let minute = 0; minute < hours * 60; minute++) {
    temperatures = model.update(inputs, 60);
  }
  return temperatures;
}

describe('A380 fuel tank temperatures (design choices)', () => {
  it('has the eleven tanks', () => {
    expect(A380_FUEL_TANKS.map((tank) => tank.name)).toEqual([
      'LEFT_OUTER',
      'FEED_1',
      'LEFT_MID',
      'LEFT_INNER',
      'FEED_2',
      'FEED_3',
      'RIGHT_INNER',
      'RIGHT_MID',
      'FEED_4',
      'RIGHT_OUTER',
      'TRIM',
    ]);
  });

  it('the surrounding temperature is the OAT on ground, the TAT in flight', () => {
    expect(surroundingTemperatureC({ ...cruise(), onGround: true })).toBe(-60);
    expect(surroundingTemperatureC(cruise())).toBe(-45);
  });

  it('starts at the OAT on ground, at 15 °C in flight', () => {
    expect(new FuelTankTemperatures().update({ ...cruise(), onGround: true, outsideAirTemperatureC: 30 }, 0)[0]).toBe(
      30,
    );
    expect(new FuelTankTemperatures().update(cruise(), 0)[0]).toBe(IN_FLIGHT_LOAD_FUEL_TEMPERATURE_C);
  });

  it('cools towards the TAT in cruise, the outer tanks faster than the inner tanks', () => {
    const model = new FuelTankTemperatures();
    model.update(cruise(), 0);
    const temperatures = runHours(model, cruise(), 7);
    // Full inner tank, 6 h time constant: 15 °C -> about -26 °C in 7 h
    expect(temperatures[index('LEFT_INNER')]).toBeCloseTo(-45 + 60 * Math.exp(-7 / 6), 0);
    expect(temperatures[index('LEFT_OUTER')]).toBeLessThan(temperatures[index('LEFT_INNER')]);
    expect(temperatures[index('TRIM')]).toBeLessThan(-40);
    expect(temperatures[index('FEED_2')]).toBeGreaterThan(-40);
  });

  it('a nearly empty tank cools faster than a full one', () => {
    const full = new FuelTankTemperatures();
    const low = new FuelTankTemperatures();
    full.update(cruise(1), 0);
    low.update(cruise(0.2), 0);
    expect(runHours(low, cruise(0.2), 2)[index('FEED_1')]).toBeLessThan(runHours(full, cruise(1), 2)[index('FEED_1')]);
  });

  it('warms back towards the OAT on ground', () => {
    const model = new FuelTankTemperatures();
    model.update(cruise(), 0);
    runHours(model, cruise(), 8);
    const warmGround = { ...cruise(), onGround: true, outsideAirTemperatureC: 20 };
    const afterLanding = model.update(warmGround, 60)[index('FEED_1')];
    expect(runHours(model, warmGround, 3)[index('FEED_1')]).toBeGreaterThan(afterLanding);
  });
});
