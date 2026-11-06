// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { a32nxFuelOnBoardKg } from './logic/fuelOnBoard';
import { numberReader } from './registeredReads';

/** The fuel vars of both aircraft, read in one go: the A32NX counts its tanks, the A380X publishes a total */
export interface FuelQuantities {
  a380TotalKg: number;
  centerGallons: number;
  leftMainGallons: number;
  leftAuxGallons: number;
  rightMainGallons: number;
  rightAuxGallons: number;
  kilogramsPerGallon: number;
}

const readA380TotalKg = numberReader('L:A32NX_TOTAL_FUEL_QUANTITY', 'Number');
const readCenterGallons = numberReader('FUEL TANK CENTER QUANTITY', 'Gallons');
const readLeftMainGallons = numberReader('FUEL TANK LEFT MAIN QUANTITY', 'Gallons');
const readLeftAuxGallons = numberReader('FUEL TANK LEFT AUX QUANTITY', 'Gallons');
const readRightMainGallons = numberReader('FUEL TANK RIGHT MAIN QUANTITY', 'Gallons');
const readRightAuxGallons = numberReader('FUEL TANK RIGHT AUX QUANTITY', 'Gallons');
const readKilogramsPerGallon = numberReader('FUEL WEIGHT PER GALLON', 'kilograms');

export const readFuelQuantities = (): FuelQuantities => ({
  a380TotalKg: readA380TotalKg(),
  centerGallons: readCenterGallons(),
  leftMainGallons: readLeftMainGallons(),
  leftAuxGallons: readLeftAuxGallons(),
  rightMainGallons: readRightMainGallons(),
  rightAuxGallons: readRightAuxGallons(),
  kilogramsPerGallon: readKilogramsPerGallon(),
});

/** As the Fuel pages count it: the A380X systems publish the total in kilograms, the A32NX uses the sim tanks */
export const fuelOnBoardKg = (isA380: boolean, fuel: FuelQuantities): number =>
  isA380
    ? fuel.a380TotalKg
    : a32nxFuelOnBoardKg(
        [fuel.centerGallons, fuel.leftMainGallons, fuel.leftAuxGallons, fuel.rightMainGallons, fuel.rightAuxGallons],
        fuel.kilogramsPerGallon,
      );
