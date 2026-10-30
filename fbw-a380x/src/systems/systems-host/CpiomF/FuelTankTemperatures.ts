// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A380FuelTankName, fuelTankTemperatureVar } from '@shared/FuelTankIndications';

/*
 * The fuel temperature of the eleven tanks, measured by the FQMS (the FPMUs of feed tanks 1, 2 and 3, one PCT sensor in
 * each wing tank and two in the trim tank), for the FUEL SD page and the FUEL TEMP LO / FUEL FEED TK 1(2)(3)(4) TEMP HI
 * alerts. MSFS has no fuel temperature: it is modelled here.
 *
 * Design choices (no published thermal data):
 * - Each tank temperature follows a first order lag towards the temperature around the tank: the outside air
 *   temperature on ground, the total air temperature in flight (the wing and THS skins are heated by the air flow up to
 *   about the total air temperature).
 * - The time constant is the one of the tank when full (TANK_TIME_CONSTANTS_H: the thin outer tanks and the trim tank
 *   in the THS cool faster than the deep inner tanks), times the tank fill ratio (less fuel cools faster), never less
 *   than MIN_FILL_RATIO times. With a full inner tank (6 h) at a TAT of -45 °C, the fuel goes from +15 °C to about
 *   -26 °C in 7 h.
 * - The temperature of fuel moved from one tank to another, the heat of the hydraulic fuel heat exchangers (FUEL FEED
 *   TK 1(4) TEMP HI) and the sun are not simulated.
 * - At flight load, the fuel is at the outside air temperature on ground, at ISA sea level (15 °C) in flight.
 */

/** A fuel tank: its name, MSFS tank (flight_model.cfg Tank.N) and capacity in gallons */
export interface A380FuelTank {
  name: A380FuelTankName;
  msfsTank: number;
  capacityGal: number;
}

/** The tanks, with their flight_model.cfg capacities */
export const A380_FUEL_TANKS: readonly A380FuelTank[] = [
  { name: 'LEFT_OUTER', msfsTank: 1, capacityGal: 2731.5 },
  { name: 'FEED_1', msfsTank: 2, capacityGal: 7299.6 },
  { name: 'LEFT_MID', msfsTank: 3, capacityGal: 9632 },
  { name: 'LEFT_INNER', msfsTank: 4, capacityGal: 12189.4 },
  { name: 'FEED_2', msfsTank: 5, capacityGal: 7753.2 },
  { name: 'FEED_3', msfsTank: 6, capacityGal: 7753.2 },
  { name: 'RIGHT_INNER', msfsTank: 7, capacityGal: 12189.4 },
  { name: 'RIGHT_MID', msfsTank: 8, capacityGal: 9632 },
  { name: 'FEED_4', msfsTank: 9, capacityGal: 7299.6 },
  { name: 'RIGHT_OUTER', msfsTank: 10, capacityGal: 2731.5 },
  { name: 'TRIM', msfsTank: 11, capacityGal: 6260.3 },
];

/** Design choice: the time constant of each tank when full, in hours */
const TANK_TIME_CONSTANTS_H: Readonly<Record<A380FuelTankName, number>> = {
  LEFT_OUTER: 2.5,
  RIGHT_OUTER: 2.5,
  TRIM: 2.5,
  FEED_1: 4,
  FEED_4: 4,
  FEED_2: 5,
  FEED_3: 5,
  LEFT_MID: 5,
  RIGHT_MID: 5,
  LEFT_INNER: 6,
  RIGHT_INNER: 6,
};

/** Design choice: the time constant never goes below this ratio of the full tank one */
const MIN_FILL_RATIO = 0.2;

/** Design choice: the fuel temperature at a flight load in flight, ISA sea level */
export const IN_FLIGHT_LOAD_FUEL_TEMPERATURE_C = 15;

export interface FuelTemperatureInputs {
  onGround: boolean;
  /** The outside (static) air temperature, °C */
  outsideAirTemperatureC: number;
  /** The total air temperature, °C */
  totalAirTemperatureC: number;
  /** The fill ratio (0 to 1) of each tank, in the order of A380_FUEL_TANKS */
  fillRatios: readonly number[];
}

/** The temperature around the tanks: the outside air temperature on ground, the total air temperature in flight */
export function surroundingTemperatureC(inputs: FuelTemperatureInputs): number {
  return inputs.onGround ? inputs.outsideAirTemperatureC : inputs.totalAirTemperatureC;
}

export class FuelTankTemperatures {
  private temperaturesC: number[] | null = null;

  /**
   * @param inputs what the model reads
   * @param deltaTimeS the time since the last update, in seconds
   * @returns the temperature of each tank, °C, in the order of A380_FUEL_TANKS
   */
  public update(inputs: FuelTemperatureInputs, deltaTimeS: number): readonly number[] {
    const surroundingC = surroundingTemperatureC(inputs);
    if (this.temperaturesC === null) {
      const initialC = inputs.onGround ? inputs.outsideAirTemperatureC : IN_FLIGHT_LOAD_FUEL_TEMPERATURE_C;
      this.temperaturesC = A380_FUEL_TANKS.map(() => initialC);
      return this.temperaturesC;
    }
    const dtH = Math.max(deltaTimeS, 0) / 3600;
    const temperaturesC = this.temperaturesC;
    for (let index = 0; index < temperaturesC.length; index++) {
      const fillRatio = Math.min(Math.max(inputs.fillRatios[index] ?? 0, MIN_FILL_RATIO), 1);
      const timeConstantH = TANK_TIME_CONSTANTS_H[A380_FUEL_TANKS[index].name] * fillRatio;
      temperaturesC[index] += (surroundingC - temperaturesC[index]) * (1 - Math.exp(-dtH / timeConstantH));
    }
    return temperaturesC;
  }
}

/** Writes the tank temperatures (A380X_FUEL_{tank}_TANK_TEMPERATURE) */
export class FuelTemperatures implements Instrument {
  private readonly model = new FuelTankTemperatures();

  private readonly onGround = RegisteredSimVar.createBoolean('SIM ON GROUND');

  private readonly outsideAirTemperatureC = RegisteredSimVar.create('AMBIENT TEMPERATURE', SimVarValueType.Celsius);

  private readonly totalAirTemperatureC = RegisteredSimVar.create('TOTAL AIR TEMPERATURE', SimVarValueType.Celsius);

  private readonly tankQuantities = A380_FUEL_TANKS.map(({ msfsTank }) =>
    RegisteredSimVar.create(`FUELSYSTEM TANK QUANTITY:${msfsTank}`, SimVarValueType.GAL),
  );

  private readonly temperatureOutputs = A380_FUEL_TANKS.map(({ name }) =>
    RegisteredSimVar.create(fuelTankTemperatureVar(name), SimVarValueType.Number),
  );

  /** Refilled at each update, to avoid a new array */
  private readonly fillRatios = A380_FUEL_TANKS.map(() => 0);

  constructor(private readonly sysHost: { deltaTime: number }) {}

  public init(): void {
    // nothing to initialise: the model starts on the first update
  }

  public onUpdate(): void {
    const onGround = this.onGround.get();
    const outsideAirTemperatureC = this.outsideAirTemperatureC.get();
    const totalAirTemperatureC = this.totalAirTemperatureC.get();
    for (let index = 0; index < A380_FUEL_TANKS.length; index++) {
      this.fillRatios[index] = this.tankQuantities[index].get() / A380_FUEL_TANKS[index].capacityGal;
    }
    const temperatures = this.model.update(
      { onGround, outsideAirTemperatureC, totalAirTemperatureC, fillRatios: this.fillRatios },
      this.sysHost.deltaTime / 1000,
    );
    for (let index = 0; index < temperatures.length; index++) {
      this.temperatureOutputs[index].set(temperatures[index]);
    }
  }
}
