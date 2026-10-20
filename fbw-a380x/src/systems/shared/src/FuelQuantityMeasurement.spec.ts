// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  FUEL_QUANTITY_TANK_ORDER,
  degradedQuantityLeadingDigits,
  fuelQuantitySystemFaults,
  isFqmsMonitoringLost,
  isTankBitSet,
} from './FuelQuantityMeasurement';

describe('A380 fuel quantity measurement words', () => {
  it('decodes FQMS 1-2, FQDC 1-2 and AGP 1-2 from bits 0-5', () => {
    expect(fuelQuantitySystemFaults(0b100110)).toEqual({
      fqms: [false, true],
      fqdc: [true, false],
      alternateGauging: [false, true],
    });
  });

  it('numbers the tanks as the Rust fuel system (A380FuelTankType)', () => {
    const rust = readFileSync(resolve(__dirname, '../../../wasm/systems/a380_systems/src/fuel/mod.rs'), 'utf-8');
    const names = Array.from(rust.matchAll(/A380FuelTankType::\w+ => "(\w+)_TANK"/g)).map((m) => m[1]);
    expect(names).toEqual(FUEL_QUANTITY_TANK_ORDER);
    expect(isTankBitSet(1 << 10, 'TRIM')).toBe(true);
    expect(isTankBitSet(1 << 10, 'FEED_1')).toBe(false);
  });

  it('loses the FQMS monitoring with both FQMS, both FQDCs or both AGPs failed', () => {
    const none = fuelQuantitySystemFaults(0);
    expect(isFqmsMonitoringLost(none)).toBe(false);
    expect(isFqmsMonitoringLost({ ...none, fqms: [true, true] })).toBe(true);
    expect(isFqmsMonitoringLost({ ...none, fqdc: [true, true] })).toBe(true);
    expect(isFqmsMonitoringLost({ ...none, alternateGauging: [true, true] })).toBe(true);
    expect(isFqmsMonitoringLost({ fqms: [true, false], fqdc: [false, true], alternateGauging: [true, false] })).toBe(
      false,
    );
  });

  it('keeps all but the last two digits of a degraded quantity', () => {
    expect(degradedQuantityLeadingDigits(12_340)).toBe('123');
    expect(degradedQuantityLeadingDigits(80)).toBe('');
  });
});
