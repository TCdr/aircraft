// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FuelTemperatureIndication,
  fuelTemperatureIndication,
  isFuelTemperatureHigh,
  isFuelTemperatureLow,
  isFuelTemperatureSensorWet,
} from './FuelTemperature';

describe('fuel temperature limits', () => {
  it('gives the HI TEMP limits of each cell on the ground and in flight', () => {
    expect(isFuelTemperatureHigh('outer', 55, true)).toBe(false);
    expect(isFuelTemperatureHigh('outer', 55.1, true)).toBe(true);
    expect(isFuelTemperatureHigh('outer', 60, false)).toBe(false);
    expect(isFuelTemperatureHigh('outer', 60.1, false)).toBe(true);
    expect(isFuelTemperatureHigh('inner', 45, true)).toBe(false);
    expect(isFuelTemperatureHigh('inner', 45.1, true)).toBe(true);
    expect(isFuelTemperatureHigh('inner', 54, false)).toBe(false);
    expect(isFuelTemperatureHigh('inner', 54.1, false)).toBe(true);
  });

  it('gives the LO TEMP limit below -43 °C', () => {
    expect(isFuelTemperatureLow(-43)).toBe(false);
    expect(isFuelTemperatureLow(-43.1)).toBe(true);
  });

  it('measures the temperature only with a wet sensor', () => {
    expect(isFuelTemperatureSensorWet(0)).toBe(false);
    expect(isFuelTemperatureSensorWet(20)).toBe(false);
    expect(isFuelTemperatureSensorWet(21)).toBe(true);
  });
});

describe('SD FUEL page temperature indication', () => {
  it('is hidden with a dry sensor and green otherwise', () => {
    expect(fuelTemperatureIndication('inner', 15, 0, true, 2)).toBe(FuelTemperatureIndication.Hidden);
    expect(fuelTemperatureIndication('inner', 15, 3000, true, 2)).toBe(FuelTemperatureIndication.Normal);
  });

  it('gives the advisory above 45 °C (inner) or 55 °C (outer), or below -40 °C, in phases 2 and 6 only', () => {
    expect(fuelTemperatureIndication('inner', 50, 3000, false, 6)).toBe(FuelTemperatureIndication.Advisory);
    expect(fuelTemperatureIndication('outer', 50, 600, false, 6)).toBe(FuelTemperatureIndication.Normal);
    expect(fuelTemperatureIndication('outer', 58, 600, false, 6)).toBe(FuelTemperatureIndication.Advisory);
    expect(fuelTemperatureIndication('inner', -41, 3000, false, 6)).toBe(FuelTemperatureIndication.Advisory);
    expect(fuelTemperatureIndication('inner', -41, 3000, false, 5)).toBe(FuelTemperatureIndication.Normal);
  });

  it('is amber beyond the limits of the caution, in any phase', () => {
    expect(fuelTemperatureIndication('inner', 46, 3000, true, 1)).toBe(FuelTemperatureIndication.Amber);
    expect(fuelTemperatureIndication('inner', 55, 3000, false, 6)).toBe(FuelTemperatureIndication.Amber);
    expect(fuelTemperatureIndication('outer', -44, 600, false, 6)).toBe(FuelTemperatureIndication.Amber);
  });
});
