// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  COLLECTOR_CELL_CAPACITY_KG,
  COLLECTOR_CELL_FULL_AGAIN_KG,
  COLLECTOR_CELL_NOT_FULL_KG,
  collectorCellQuantityVar,
  fuelTankTemperatureVar,
  isCollectorCellNotFull,
  isFeedTankTemperatureAbnormal,
  isTemperatureSensorImmersed,
} from './FuelTankIndications';

const KG_PER_LB = 0.45359237;

describe('A380 fuel tank indications', () => {
  it('names the L:vars written by the FQMS simulation', () => {
    expect(fuelTankTemperatureVar('FEED_1')).toBe('L:A380X_FUEL_FEED_1_TANK_TEMPERATURE');
    expect(fuelTankTemperatureVar('TRIM')).toBe('L:A380X_FUEL_TRIM_TANK_TEMPERATURE');
    expect(collectorCellQuantityVar(3)).toBe('L:A380X_FUEL_COLLECTOR_CELL_3_QUANTITY');
  });

  it('has the collector cell capacity and thresholds', () => {
    expect(COLLECTOR_CELL_CAPACITY_KG).toBeCloseTo(2_866 * KG_PER_LB, 3);
    expect(COLLECTOR_CELL_NOT_FULL_KG).toBeCloseTo(1_735 * KG_PER_LB, 3);
    expect(COLLECTOR_CELL_FULL_AGAIN_KG).toBeCloseTo(2_076 * KG_PER_LB, 3);
  });

  it('a collector cell is not full below 1 735 lb and full again above 2 076 lb', () => {
    expect(isCollectorCellNotFull(COLLECTOR_CELL_CAPACITY_KG, false)).toBe(false);
    expect(isCollectorCellNotFull(1_740 * KG_PER_LB, false)).toBe(false);
    expect(isCollectorCellNotFull(1_730 * KG_PER_LB, false)).toBe(true);
    // Hysteresis: still not full between the two thresholds
    expect(isCollectorCellNotFull(2_000 * KG_PER_LB, true)).toBe(true);
    expect(isCollectorCellNotFull(2_080 * KG_PER_LB, true)).toBe(false);
  });

  it('outer and trim tank temperature sensors are immersed above 8 819 lb and 13 890 lb', () => {
    expect(isTemperatureSensorImmersed('LEFT_OUTER', 8_800 * KG_PER_LB)).toBe(false);
    expect(isTemperatureSensorImmersed('RIGHT_OUTER', 8_850 * KG_PER_LB)).toBe(true);
    expect(isTemperatureSensorImmersed('TRIM', 13_800 * KG_PER_LB)).toBe(false);
    expect(isTemperatureSensorImmersed('TRIM', 14_000 * KG_PER_LB)).toBe(true);
    expect(isTemperatureSensorImmersed('FEED_2', 10)).toBe(true);
    expect(isTemperatureSensorImmersed('FEED_2', 0)).toBe(false);
  });

  it('a feed tank temperature is abnormal above 53 °C or below -40 °C', () => {
    expect(isFeedTankTemperatureAbnormal(53)).toBe(false);
    expect(isFeedTankTemperatureAbnormal(53.5)).toBe(true);
    expect(isFeedTankTemperatureAbnormal(-40)).toBe(false);
    expect(isFeedTankTemperatureAbnormal(-40.5)).toBe(true);
  });
});
