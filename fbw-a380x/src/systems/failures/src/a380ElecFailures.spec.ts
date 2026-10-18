// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380FailureDefinitions } from './a380';

// The electrical failures checks of the A380X failure list, in their own spec file.

/**
 * Reads the failure id -> Rust FailureType map from the `.with_failures([...])` call of the A380 systems wasm, as
 * a map of id (e.g. 32100) to the FailureType without its prefix (e.g. 'BrakeHydraulicLeak(HydraulicColor::Green)').
 */
function readRustFailureMap(): Map<number, string> {
  const source = readFileSync(resolve(__dirname, '../../../wasm/systems/a380_systems_wasm/src/lib.rs'), 'utf8');
  const start = source.indexOf('.with_failures([');
  const block = source
    .slice(start, source.indexOf('])', start))
    .replace(/\/\/.*/g, '')
    .replace(/\s+/g, '');
  const map = new Map<number, string>();
  // After removing the whitespace an entry reads (32_100,FailureType::BrakeHydraulicLeak(HydraulicColor::Green)),
  for (const [, thousands, units, failureType] of block.matchAll(/\((\d+)_(\d+),FailureType::(.+?),?\),(?=\(\d|$)/g)) {
    map.set(Number(thousands + units), failureType);
  }
  return map;
}

describe('A380X electrical failures', () => {
  // The labels say what a380_systems electrical (direct_current.rs, alternating_current.rs, mod.rs) does with ids
  // 24040-24060 and 24080-24083; 24070-24072 are read by the FWS only (FwsElecSystemAlerts), so they are not in the
  // Rust map
  it('lists the battery, external power, RAT generator, TR monitoring and drive disconnect failures in ATA 24', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string | undefined, string][] = [
      [24040, 'Battery(1)', 'BAT 1'],
      [24041, 'Battery(2)', 'BAT 2'],
      [24042, 'Battery(3)', 'BAT ESS'],
      [24043, 'Battery(4)', 'APU BAT'],
      [24050, 'ExternalPower(1)', 'EXT PWR 1'],
      [24051, 'ExternalPower(2)', 'EXT PWR 2'],
      [24052, 'ExternalPower(3)', 'EXT PWR 3'],
      [24053, 'ExternalPower(4)', 'EXT PWR 4'],
      [24060, 'EmergencyGenerator', 'RAT Generator'],
      [24070, undefined, 'TR 1 Monitoring'],
      [24071, undefined, 'TR 2 Monitoring'],
      [24072, undefined, 'ESS TR Monitoring'],
      [24080, 'GeneratorDriveDisconnect(1)', 'DRIVE 1 Disconnect Function'],
      [24081, 'GeneratorDriveDisconnect(2)', 'DRIVE 2 Disconnect Function'],
      [24082, 'GeneratorDriveDisconnect(3)', 'DRIVE 3 Disconnect Function'],
      [24083, 'GeneratorDriveDisconnect(4)', 'DRIVE 4 Disconnect Function'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 24]),
    );
  });
});
