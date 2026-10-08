// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure, A380FailureDefinitions } from './a380';

// The flyPad failures page lists exactly A380FailureDefinitions; a definition is [ATA chapter, id, name].
const listedIds = A380FailureDefinitions.map(([, id]) => id);
const enumIds: number[] = Object.values(A380Failure);

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

describe('A380X flyPad failure definitions', () => {
  it('lists every failure id only once', () => {
    const duplicates = listedIds.filter((id, index) => listedIds.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('only lists ids that exist in the A380Failure enum', () => {
    expect(listedIds.filter((id) => !enumIds.includes(id))).toEqual([]);
  });

  it('files every failure under the ATA chapter of its id', () => {
    const misfiled = A380FailureDefinitions.filter(([ata, id]) => Math.floor(id / 1000) !== ata);
    expect(misfiled).toEqual([]);
  });

  it('lists all landing gear proximity sensor (32004-32015) and jammed actuator (32020-32025) failures', () => {
    // The Rust map in a380_systems_wasm/src/lib.rs reacts to all of these ids.
    const gearIds = [
      32004, 32005, 32006, 32007, 32008, 32009, 32010, 32011, 32012, 32013, 32014, 32015, 32020, 32021, 32022, 32023,
      32024, 32025,
    ];
    expect(gearIds.filter((id) => !listedIds.includes(id))).toEqual([]);
  });

  it('names the gear failures after the sensor or actuator the Rust map fails', () => {
    // a380_systems_wasm/src/lib.rs: 32_004 = UplockGearNose1, 32_006 = UplockGearRight1, 32_013 = DownlockDoorRight1, 32_022 = GearRight.
    expect(A380Failure.GearProxSensorDamageGearUplockNose1).toBe(32004);
    expect(A380Failure.GearProxSensorDamageGearUplockRight1).toBe(32006);
    expect(A380Failure.GearProxSensorDamageGearDoorOpenedRight1).toBe(32013);
    expect(A380Failure.GearActuatorJammedGearRight).toBe(32022);

    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id)?.[2];
    expect(nameOf(32004)).toBe('Proximity sensor damage uplock nose gear #1');
    expect(nameOf(32006)).toBe('Proximity sensor damage uplock right gear #1');
  });

  it('names the buses, TRs and controllers as the A380 FCOM and SD do (failure names audit 2026-10-03)', () => {
    const label = (id: number) => A380FailureDefinitions.find(([, i]) => i === id)?.[2];
    expect(label(24002)).toBe('ESS TR');
    expect(label(24003)).toBe('APU TR');
    expect(label(24104)).toBe('AC EMER');
    expect(label(24105)).toBe('AC ESS');
    expect(label(24106)).toBe('AC EHA (247XP)');
    expect(label(24112)).toBe('DC APU (309PP)');
    expect(label(32000)).toBe('LGCIS 1 power supply');
    expect(label(32021)).toBe('Left main gears (body + wing) jammed actuator');
    expect(label(34003)).toBe('XPDR 1');
    expect(label(34004)).toBe('XPDR 2');
    expect(A380FailureDefinitions.every(([, , name]) => !name.includes('Foward') && !name.includes('LGCIU'))).toBe(
      true,
    );
  });

  it('does not list ROLLOUT (22001), which no system reacts to', () => {
    expect(listedIds).not.toContain(22001);
  });

  it('lists the brake and trim air failures the Rust model simulates, under the ids the Rust map uses', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [21050, 'TrimAirFault(ZoneType::Cockpit)', 'Cockpit trim air valve jammed'],
      [21051, 'TrimAirFault(ZoneType::Cabin(11))', 'Main deck zone 1 trim air valve jammed'],
      [21052, 'TrimAirFault(ZoneType::Cabin(21))', 'Upper deck zone 1 trim air valve jammed'],
      [21053, 'TrimAirFault(ZoneType::Cargo(1))', 'Forward cargo trim air valve jammed'],
      [21054, 'TrimAirOverheat(ZoneType::Cockpit)', 'Cockpit duct overheat (hot trim air)'],
      [21055, 'TrimAirOverheat(ZoneType::Cabin(11))', 'Main deck zone 1 duct overheat (hot trim air)'],
      [21056, 'TrimAirOverheat(ZoneType::Cabin(21))', 'Upper deck zone 1 duct overheat (hot trim air)'],
      [21057, 'TrimAirOverheat(ZoneType::Cargo(1))', 'Forward cargo duct overheat (hot trim air)'],
      [32100, 'BrakeHydraulicLeak(HydraulicColor::Green)', 'Brakes NORM circuit leak (green hydraulic)'],
      [32101, 'BrakeHydraulicLeak(HydraulicColor::Yellow)', 'Brakes ALTN circuit leak (yellow hydraulic)'],
      [32150, 'BrakeAccumulatorGasLeak', 'Brakes ALTN accumulator gas leak'],
    ];
    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id)?.[2];

    expect(expected.map(([id]) => [id, rustMap.get(id), nameOf(id)])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name]),
    );
  });

  // The labels say what a380_systems engine_failure.rs does with ids 72000-72013 (failure names audit rule)
  it('lists the engine flameout and seizure failures of the four engines in ATA 72 Engine', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [1, 2, 3, 4].flatMap((engine): [number, string, string][] => [
      [72000 + engine - 1, `EngineFlameout(${engine})`, `Engine ${engine} flameout (crew relight possible)`],
      [72010 + engine - 1, `EngineSeizure(${engine})`, `Engine ${engine} seizure (no relight)`],
    ]);
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 72]),
    );
    expect(A380Failure.Eng1Flameout).toBe(72000);
    expect(A380Failure.Eng4Seizure).toBe(72013);
  });

  // The labels say what systems engine/oil_failure.rs and the FADEC (EngineOilFailures.hpp) do with ids 79000-79033
  it('lists the engine oil failures of the four engines in ATA 79 Oil', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [1, 2, 3, 4].flatMap((engine): [number, string, string][] => [
      [79000 + engine - 1, `EngineOilLeak(${engine})`, `Engine ${engine} oil leak`],
      [79020 + engine - 1, `EngineOilFilterClog(${engine})`, `Engine ${engine} oil filter clog`],
      [79030 + engine - 1, `EngineOilOverheat(${engine})`, `Engine ${engine} oil overheat`],
    ]);
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 79]),
    );
  });

  // The labels say what systems::engine::engine_start does with ids 74000-74013 and 80000-80053 (failure names audit rule)
  it('lists the ignition and starting failures of the four engines in ATA 74 and ATA 80', () => {
    const rustMap = readRustFailureMap();
    const kinds: [number, number, string, string][] = [
      [74, 74000, 'EngineIgniterA', 'igniter A'],
      [74, 74010, 'EngineIgniterB', 'igniter B'],
      [80, 80000, 'EngineStartValveStuckClosed', 'start valve stuck closed'],
      [80, 80010, 'EngineStartValveStuckOpen', 'start valve stuck open'],
      [80, 80020, 'EngineHotStart', 'hot start (start EGT over limit)'],
      [80, 80030, 'EngineHungStart', 'hung start (N3 stops below idle)'],
      [80, 80040, 'EngineStartStall', 'stall during the start'],
      [80, 80050, 'EngineStarter', 'starter shaft shear'],
    ];
    const expected = kinds.flatMap(([ata, base, failureType, label]) =>
      [1, 2, 3, 4].map((engine) => [base + engine - 1, `${failureType}(${engine})`, `Engine ${engine} ${label}`, ata]),
    );
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(
      expected.map(([id]) => [
        id,
        rustMap.get(id as number),
        definitionOf(id as number)?.[2],
        definitionOf(id as number)?.[0],
      ]),
    ).toEqual(expected);
  });

  // The labels say what a380_systems engine_malfunction.rs does with ids 72100-72113 and 77000-77003
  it('lists the stall, EGT overtemperature and vibration failures of the four engines', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string, number][] = [1, 2, 3, 4].flatMap(
      (engine): [number, string, string, number][] => [
        [
          72100 + engine - 1,
          `EngineCompressorStall(${engine})`,
          `Engine ${engine} compressor stall (above 60 % N1)`,
          72,
        ],
        [72110 + engine - 1, `EngineEgtOvertemperature(${engine})`, `Engine ${engine} EGT overtemperature`, 72],
        [77000 + engine - 1, `EngineHighVibration(${engine})`, `Engine ${engine} high vibration`, 77],
      ],
    );
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name, chapter]) => [id, failureType, name, chapter]),
    );
    // No overspeed failure on the A380X (engine_malfunction.rs): the FCOM red limits are out of reach
    expect(rustMap.has(72120)).toBe(false);
  });

  it('lists every failure the Rust systems map reacts to', () => {
    const rustIds = [...readRustFailureMap().keys()];
    // Sanity check of the parser: the map holds well over a hundred failures.
    expect(rustIds.length).toBeGreaterThan(100);
    expect(rustIds.filter((id) => !listedIds.includes(id))).toEqual([]);
  });
});

describe('A380X FADEC, thrust lever and reverser failures', () => {
  // The labels say what a380_systems engine_control_failure.rs and the reversers do with ids 73010-78042 (failure names
  // audit rule): the reversers are on engines 2 and 3 only (A380 FCOM DSC-70-70)
  it('lists them in ATA 73 and 78 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const fadec: [number, string, string][] = [1, 2, 3, 4].flatMap((engine): [number, string, string][] => [
      [73010 + engine - 1, `FadecNetworkLink(${engine})`, `Engine ${engine} FADEC network link`],
      [73020 + engine - 1, `FadecSystem(${engine})`, `Engine ${engine} FADEC system fault`],
      [73030 + engine - 1, `FadecOverheat(${engine})`, `Engine ${engine} FADEC overheat`],
      [73040 + engine - 1, `ThrustLeverResolvers(${engine})`, `Thrust lever ${engine} resolvers (both)`],
    ]);
    const reversers: [number, string, string][] = [2, 3].flatMap((engine): [number, string, string][] => [
      [78000 + engine - 1, `ReverserFault(${engine})`, `Reverser ${engine} fault (does not deploy)`],
      [78010 + engine - 1, `ReverserUnlocked(${engine})`, `Reverser ${engine} unlocked (engine at idle)`],
      [78020 + engine - 1, `ReverserPressurized(${engine})`, `Reverser ${engine} energized (tertiary lock unlocked)`],
      [78030 + engine - 1, `ReverserLocked(${engine})`, `Reverser ${engine} failed locked (does not deploy)`],
      [78040 + engine - 1, `ReverserControlFault(${engine})`, `Reverser ${engine} control fault (ETRAC)`],
    ]);
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    for (const [chapter, expected] of [
      [73, fadec],
      [78, reversers],
    ] as [number, [number, string, string][]][]) {
      expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
        expected.map(([id, failureType, name]) => [id, failureType, name, chapter]),
      );
    }
    expect(A380Failure.Reverser2Fault).toBe(78001);
    expect(A380Failure.Reverser3ControlFault).toBe(78042);
  });

  // The labels say what systems engine/fuel_filter_failure.rs does with ids 73100-73103 (failure names audit rule)
  it('lists the engine fuel filter clog failures of the four engines in ATA 73', () => {
    const rustMap = readRustFailureMap();
    const expected = [1, 2, 3, 4].map((engine) => [
      73100 + engine - 1,
      `EngineFuelFilterClog(${engine})`,
      `Engine ${engine} fuel filter clog`,
      73,
    ]);
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    expect(
      expected.map(([id]) => [
        id,
        rustMap.get(id as number),
        definitionOf(id as number)?.[2],
        definitionOf(id as number)?.[0],
      ]),
    ).toEqual(expected);
  });
});
