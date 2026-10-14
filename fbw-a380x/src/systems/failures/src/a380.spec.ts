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

  it('lists the pack, bulk cargo duct, cabin air extract and manual pressurization failures in ATA 21', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [21058, 'PackFlowValveJammed(1)', 'Pack 1 flow valve 1 jammed'],
      [21059, 'PackFlowValveJammed(2)', 'Pack 1 flow valve 2 jammed'],
      [21060, 'PackFlowValveJammed(3)', 'Pack 2 flow valve 1 jammed'],
      [21061, 'PackFlowValveJammed(4)', 'Pack 2 flow valve 2 jammed'],
      [21062, 'PackOverheat(1)', 'Pack 1 overheat'],
      [21063, 'PackOverheat(2)', 'Pack 2 overheat'],
      [21064, 'PackRegulation(1)', 'Pack 1 regulation fault (bypass mode)'],
      [21065, 'PackRegulation(2)', 'Pack 2 regulation fault (bypass mode)'],
      [21066, 'BulkCargoDuctOverheat', 'Bulk cargo duct overheat (heater)'],
      [21067, 'CabinAirExtractValve', 'Cabin air extract valve failed'],
      [21068, 'CabinPressureManualControl', 'Cabin pressure manual control failed'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[0], definitionOf(id)?.[2]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, 21, name]),
    );
  });

  it('lists the braking and steering control failures under the ids and Rust failures of brake_steer_faults.rs', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [32110, 'BrakeNormalBraking', 'Brakes normal braking (BCS NORM BRK)'],
      [32111, 'BrakeAlternateBraking', 'Brakes alternate braking (BCS ALTN BRK)'],
      [32112, 'BrakeEmergencyBraking', 'Brakes emergency braking (EBCU)'],
      [32200, 'NoseWheelSteeringNormal', 'Steering normal nose wheel steering (NORM N/W STEER)'],
      [32201, 'NoseWheelSteeringAlternate', 'Steering alternate nose wheel steering (steering LEHGS)'],
      [32202, 'BodyWheelSteering', 'Steering body wheel steering (B/W STEER)'],
      [32203, 'SteeringControlSystem(1)', 'Steering control system 1 (STEER CTL 1)'],
      [32204, 'SteeringControlSystem(2)', 'Steering control system 2 (STEER CTL 2)'],
    ];
    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), nameOf(id)?.[2], nameOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 32]),
    );
  });

  it('lists the wing and engine anti-ice valve failures in ATA 30 with the Rust failures of ice_rain_protection.rs', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [30000, 'WingAntiIceValvesStuckClosed(1)', 'Left wing anti-ice valves stuck closed'],
      [30001, 'WingAntiIceValvesStuckClosed(2)', 'Right wing anti-ice valves stuck closed'],
      [30010, 'WingAntiIceOuterValveStuckOpen(1)', 'Left wing outer anti-ice valve stuck open'],
      [30011, 'WingAntiIceOuterValveStuckOpen(2)', 'Right wing outer anti-ice valve stuck open'],
      ...[1, 2, 3, 4].map((engine): [number, string, string] => [
        30099 + engine,
        `EngineAntiIceValveStuckClosed(${engine})`,
        `Engine ${engine} anti-ice valve stuck closed`,
      ]),
      ...[1, 2, 3, 4].map((engine): [number, string, string] => [
        30109 + engine,
        `EngineAntiIceValveStuckOpen(${engine})`,
        `Engine ${engine} anti-ice valve stuck open`,
      ]),
    ];
    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), nameOf(id)?.[2], nameOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 30]),
    );
  });

  it('lists the oxygen failures in ATA 35 with the Rust failures of oxygen.rs', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [35000, 'CockpitOxygenBottleLeak', 'Cockpit oxygen bottle leak'],
      [35001, 'CabinOxygenBottleLeak', 'Cabin oxygen bottles leak'],
      [35010, 'CabinOxygenValveStuckClosed', 'Cabin oxygen regulator supply valve stuck closed'],
    ];
    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), nameOf(id)?.[2], nameOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 35]),
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

  // The labels say what the FADEC models of fbw_a380 (FadecThrustFailures.h) do with ids 73050-73063: they are consumed
  // by the fbw WASM (failures/FailureList.h), not by the Rust systems
  it('lists the FADEC thrust failures of the four engines in ATA 73 under the ids of the fbw WASM', () => {
    const failureList = readFileSync(resolve(__dirname, '../../../wasm/fbw_a380/src/failures/FailureList.h'), 'utf8');
    const consumer = readFileSync(
      resolve(__dirname, '../../../wasm/fbw_a380/src/failures/FailuresConsumer.cpp'),
      'utf8',
    );
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    for (const engine of [1, 2, 3, 4]) {
      const maxThrust = 73050 + engine - 1;
      const flexTemp = 73060 + engine - 1;
      expect(definitionOf(maxThrust)).toEqual([
        73,
        maxThrust,
        `Engine ${engine} max thrust miscalculated (thrust loss)`,
      ]);
      expect(definitionOf(flexTemp)).toEqual([73, flexTemp, `FADEC ${engine} FLEX TEMP not received (T.O mode TOGA)`]);
      expect(failureList).toContain(`Eng${engine}MaxThrustMiscalculated = ${maxThrust},`);
      expect(failureList).toContain(`Fadec${engine}FlexTempNotReceived = ${flexTemp},`);
      expect(consumer).toContain(`(Failures::Eng${engine}MaxThrustMiscalculated, false)`);
      expect(consumer).toContain(`(Failures::Fadec${engine}FlexTempNotReceived, false)`);
    }
    expect(readRustFailureMap().has(73050)).toBe(false);
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

  // a380_systems pneumatic.rs: the stuck bleed valves and the bleed duct leaks of the four engines, wing zone n being the
  // wing section of engine n
  it('lists the bleed valve and bleed leak failures in ATA 36 under the ids of the Rust map', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string][] = [];
    for (const engine of [1, 2, 3, 4]) {
      expected.push(
        [36000 + engine - 1, `EngineBleedValveStuckClosed(${engine})`],
        [36010 + engine - 1, `EngineBleedValveStuckOpen(${engine})`],
        [36070 + engine - 1, `EngineBleedLeak(${engine})`],
        [36074 + engine - 1, `WingBleedLeak(${engine})`],
      );
    }
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType]) => [id, failureType, 36]),
    );
    expect(definitionOf(A380Failure.LeftOuterWingBleedLeak)?.[2]).toBe('Left outer wing bleed duct leak');
    expect(definitionOf(A380Failure.RightOuterWingBleedLeak)?.[2]).toBe('Right outer wing bleed duct leak');
  });

  // a380_systems pneumatic.rs: the leaks of the APU duct, the pack bays, the hot-air ducts and the forward cargo duct
  // (FCOM DSC-36-10-60)
  it('lists the APU, pack bay, hot air and forward cargo duct leaks in ATA 36 under the ids of the Rust map', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [36080, 'ApuBleedLeak', 'APU bleed duct leak'],
      [36081, 'PackBayLeak(1)', 'Pack 1 bay bleed duct leak'],
      [36082, 'PackBayLeak(2)', 'Pack 2 bay bleed duct leak'],
      [36083, 'HotAirDuctLeak(1)', 'Hot air 1 duct leak'],
      [36084, 'HotAirDuctLeak(2)', 'Hot air 2 duct leak'],
      [36085, 'FwdCargoBleedDuctLeak', 'Forward cargo bleed duct leak'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 36]),
    );
  });

  // The labels say what systems engine/hp_fuel_valve_failure.rs and engine/engine_monitoring_fault.rs do with each id
  // (failure names audit rule): the HP fuel valve sticks, the other faults only raise their FWS alert
  it('lists the HP fuel valve and FADEC monitoring failures with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string, number][] = [
      [73200, 'EngineHpFuelValveStuck(1)', 'Engine 1 HP fuel valve stuck', 73],
      [73201, 'EngineHpFuelValveStuck(2)', 'Engine 2 HP fuel valve stuck', 73],
      [73202, 'EngineHpFuelValveStuck(3)', 'Engine 3 HP fuel valve stuck', 73],
      [73203, 'EngineHpFuelValveStuck(4)', 'Engine 4 HP fuel valve stuck', 73],
      [
        73110,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::FuelStrainerClog)',
        'Engine 1 fuel strainer clog',
        73,
      ],
      [
        73111,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::FuelStrainerClog)',
        'Engine 2 fuel strainer clog',
        73,
      ],
      [
        73112,
        'EngineMonitoringFault(3,EngineMonitoringFaultKind::FuelStrainerClog)',
        'Engine 3 fuel strainer clog',
        73,
      ],
      [
        73113,
        'EngineMonitoringFault(4,EngineMonitoringFaultKind::FuelStrainerClog)',
        'Engine 4 fuel strainer clog',
        73,
      ],
      [
        73120,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::FuelFilterMonitoring)',
        'Engine 1 fuel filter monitoring',
        73,
      ],
      [
        73121,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::FuelFilterMonitoring)',
        'Engine 2 fuel filter monitoring',
        73,
      ],
      [
        73122,
        'EngineMonitoringFault(3,EngineMonitoringFaultKind::FuelFilterMonitoring)',
        'Engine 3 fuel filter monitoring',
        73,
      ],
      [
        73123,
        'EngineMonitoringFault(4,EngineMonitoringFaultKind::FuelFilterMonitoring)',
        'Engine 4 fuel filter monitoring',
        73,
      ],
      [
        73240,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::Sensors)',
        'Engine 1 pressure and temperature probes',
        73,
      ],
      [
        73241,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::Sensors)',
        'Engine 2 pressure and temperature probes',
        73,
      ],
      [
        73242,
        'EngineMonitoringFault(3,EngineMonitoringFaultKind::Sensors)',
        'Engine 3 pressure and temperature probes',
        73,
      ],
      [
        73243,
        'EngineMonitoringFault(4,EngineMonitoringFaultKind::Sensors)',
        'Engine 4 pressure and temperature probes',
        73,
      ],
      [
        73250,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::OverthrustProtection)',
        'Engine 1 overthrust protection',
        73,
      ],
      [
        73251,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::OverthrustProtection)',
        'Engine 2 overthrust protection',
        73,
      ],
      [
        73252,
        'EngineMonitoringFault(3,EngineMonitoringFaultKind::OverthrustProtection)',
        'Engine 3 overthrust protection',
        73,
      ],
      [
        73253,
        'EngineMonitoringFault(4,EngineMonitoringFaultKind::OverthrustProtection)',
        'Engine 4 overthrust protection',
        73,
      ],
      [
        73260,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::MinorFault)',
        'Engine 1 FADEC minor fault (internal sensor)',
        73,
      ],
      [
        73261,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::MinorFault)',
        'Engine 2 FADEC minor fault (internal sensor)',
        73,
      ],
      [
        73262,
        'EngineMonitoringFault(3,EngineMonitoringFaultKind::MinorFault)',
        'Engine 3 FADEC minor fault (internal sensor)',
        73,
      ],
      [
        73263,
        'EngineMonitoringFault(4,EngineMonitoringFaultKind::MinorFault)',
        'Engine 4 FADEC minor fault (internal sensor)',
        73,
      ],
      [79040, 'EngineMonitoringFault(1,EngineMonitoringFaultKind::OilChip)', 'Engine 1 oil chip (metal particles)', 79],
      [79041, 'EngineMonitoringFault(2,EngineMonitoringFaultKind::OilChip)', 'Engine 2 oil chip (metal particles)', 79],
      [79042, 'EngineMonitoringFault(3,EngineMonitoringFaultKind::OilChip)', 'Engine 3 oil chip (metal particles)', 79],
      [79043, 'EngineMonitoringFault(4,EngineMonitoringFaultKind::OilChip)', 'Engine 4 oil chip (metal particles)', 79],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name, chapter]) => [id, failureType, name, chapter]),
    );
  });

  // The labels say what systems navigation/adirs.rs does with ids 34070-34082: the FWS reads the ADR discrete word and
  // the IR maintenance word (FwsCore adr1Fault, ir1Fault)
  it('lists the ADR and IR fault failures in ATA 34 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [34070, 'AdrFault(1)', 'ADR 1 (air data lost, FAULT light)'],
      [34071, 'AdrFault(2)', 'ADR 2 (air data lost, FAULT light)'],
      [34072, 'AdrFault(3)', 'ADR 3 (air data lost, FAULT light)'],
      [34080, 'IrFault(1)', 'IR 1 (inertial data lost, FAULT light)'],
      [34081, 'IrFault(2)', 'IR 2 (inertial data lost, FAULT light)'],
      [34082, 'IrFault(3)', 'IR 3 (inertial data lost, FAULT light)'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 34]),
    );
  });
});

describe('A380X slat/flap channel and avionics network failures', () => {
  // The labels say what a380_systems hydraulic/sfcc does with ids 27010-27013 (F/CTL FLAP(SLAT) SYS 1(2) FAULT,
  // a380_fcom.txt l.147527-147540, l.148380-148393)
  it('lists the SFCC flap and slat channel failures in ATA 27 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [A380Failure.Sfcc1FlapChannel, 'SlatFlapControlComputerFlapChannel(1)', 'SFCC 1 flap channel'],
      [A380Failure.Sfcc2FlapChannel, 'SlatFlapControlComputerFlapChannel(2)', 'SFCC 2 flap channel'],
      [A380Failure.Sfcc1SlatChannel, 'SlatFlapControlComputerSlatChannel(1)', 'SFCC 1 slat channel'],
      [A380Failure.Sfcc2SlatChannel, 'SlatFlapControlComputerSlatChannel(2)', 'SFCC 2 slat channel'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, [27, id, name]]),
    );
  });

  // FCOM DSC-42-10/20 (a380_fcom.txt l.94820-94960, l.94964-95066): 16 AFDX switches (8 per network), 4 pairs of IOMs,
  // 22 CPIOMs in 7 groups. The Rust model names them as the AFDX_SWITCH_n / IOM_xn / CPIOM_xn L:vars.
  it('lists a failure for every AFDX switch, IOM and CPIOM of the Rust avionics network in ATA 42', () => {
    const rustMap = readRustFailureMap();
    const networkIds = [...rustMap.keys()].filter((id) => Math.floor(id / 1000) === 42);
    expect(networkIds).toHaveLength(16 + 8 + 22);
    expect(networkIds.filter((id) => !listedIds.includes(id))).toEqual([]);

    expect(rustMap.get(A380Failure.AfdxSwitch9)).toBe('AvionicsFullDuplexSwitch(9)');
    expect(rustMap.get(A380Failure.AfdxSwitch19)).toBe('AvionicsFullDuplexSwitch(19)');
    expect(rustMap.get(A380Failure.IomA5)).toBe("InputOutputModule('A',5)");
    expect(rustMap.get(A380Failure.CpiomC1)).toBe("CoreProcessingInputOutputModule('C',1)");
    expect(rustMap.get(A380Failure.CpiomD3)).toBe("CoreProcessingInputOutputModule('D',3)");
    expect(rustMap.get(A380Failure.CpiomG4)).toBe("CoreProcessingInputOutputModule('G',4)");

    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id)?.[2];
    expect(nameOf(A380Failure.AfdxSwitch3)).toBe('AFDX switch 3 (network A)');
    expect(nameOf(A380Failure.AfdxSwitch13)).toBe('AFDX switch 13 (network B)');
    expect(nameOf(A380Failure.IomA1)).toBe('IOM A1');
    expect(nameOf(A380Failure.CpiomC2)).toBe('CPIOM C2 (FWS, FCDC)');
  });

  // TS only: read by the FWS (FwsTailStrikeAlerts), TAIL STRIKE DET FAULT (a380_fcom.txt l.147371-147385)
  it('lists the tail strike detector failure in ATA 31', () => {
    expect(A380FailureDefinitions.find(([, id]) => id === A380Failure.TailStrikeDetector)).toEqual([
      31,
      31200,
      'Tail strike detector',
    ]);
  });

  // The SDF smoke failures and the APU ECB failures and the Rust failure each one triggers (systems
  // fire_protection/smoke_detection.rs, cargo_fire_extinguishing.rs, apu/electronic_control_box.rs)
  it('lists the smoke failures in ATA 26 and the APU ECB failures in ATA 49 with the Rust failure they trigger', () => {
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a380_systems_wasm/src/lib.rs'), 'utf8')
      .replace(/\s+/g, '')
      .replace(/,\)/g, ')');
    const expected: [number, string, string, number][] = [
      [26019, 'Smoke(SmokeDetectionZone::ForwardCargo)', 'Forward cargo smoke', 26],
      [26020, 'Smoke(SmokeDetectionZone::AftCargo)', 'Aft cargo smoke', 26],
      [26021, 'Smoke(SmokeDetectionZone::BulkCargo)', 'Bulk cargo smoke', 26],
      [26022, 'Smoke(SmokeDetectionZone::LeftMainAvionics)', 'Left main avionics bay smoke', 26],
      [26023, 'Smoke(SmokeDetectionZone::RightMainAvionics)', 'Right main avionics bay smoke', 26],
      [26024, 'Smoke(SmokeDetectionZone::LeftUpperAvionics)', 'Left upper avionics bay smoke', 26],
      [26025, 'Smoke(SmokeDetectionZone::RightUpperAvionics)', 'Right upper avionics bay smoke', 26],
      [26026, 'Smoke(SmokeDetectionZone::AftAvionics)', 'Aft avionics bay smoke', 26],
      [26027, 'Smoke(SmokeDetectionZone::InFlightEntertainmentBay)', 'IFE bay smoke', 26],
      [26028, 'SmokeDetector(SmokeDetectionZone::ForwardCargo,1)', 'Forward cargo smoke detector 1', 26],
      [26029, 'SmokeDetector(SmokeDetectionZone::ForwardCargo,2)', 'Forward cargo smoke detector 2', 26],
      [26030, 'SmokeDetector(SmokeDetectionZone::AftCargo,1)', 'Aft cargo smoke detector 1', 26],
      [26031, 'SmokeDetector(SmokeDetectionZone::AftCargo,2)', 'Aft cargo smoke detector 2', 26],
      [26032, 'SmokeDetector(SmokeDetectionZone::BulkCargo,1)', 'Bulk cargo smoke detector 1', 26],
      [26033, 'SmokeDetector(SmokeDetectionZone::BulkCargo,2)', 'Bulk cargo smoke detector 2', 26],
      [26034, 'SmokeDetector(SmokeDetectionZone::LeftMainAvionics,1)', 'Left main avionics bay smoke detector 1', 26],
      [26035, 'SmokeDetector(SmokeDetectionZone::LeftMainAvionics,2)', 'Left main avionics bay smoke detector 2', 26],
      [26036, 'SmokeDetector(SmokeDetectionZone::RightMainAvionics,1)', 'Right main avionics bay smoke detector 1', 26],
      [26037, 'SmokeDetector(SmokeDetectionZone::RightMainAvionics,2)', 'Right main avionics bay smoke detector 2', 26],
      [26038, 'SmokeDetector(SmokeDetectionZone::LeftUpperAvionics,1)', 'Left upper avionics bay smoke detector 1', 26],
      [26039, 'SmokeDetector(SmokeDetectionZone::LeftUpperAvionics,2)', 'Left upper avionics bay smoke detector 2', 26],
      [
        26040,
        'SmokeDetector(SmokeDetectionZone::RightUpperAvionics,1)',
        'Right upper avionics bay smoke detector 1',
        26,
      ],
      [
        26041,
        'SmokeDetector(SmokeDetectionZone::RightUpperAvionics,2)',
        'Right upper avionics bay smoke detector 2',
        26,
      ],
      [26042, 'SmokeDetector(SmokeDetectionZone::AftAvionics,1)', 'Aft avionics bay smoke detector 1', 26],
      [26043, 'SmokeDetector(SmokeDetectionZone::AftAvionics,2)', 'Aft avionics bay smoke detector 2', 26],
      [26044, 'SmokeDetector(SmokeDetectionZone::InFlightEntertainmentBay,1)', 'IFE bay smoke detector 1', 26],
      [26045, 'SmokeDetector(SmokeDetectionZone::InFlightEntertainmentBay,2)', 'IFE bay smoke detector 2', 26],
      [26046, 'CargoFireBottleLowPressure(1)', 'Cargo fire bottle 1 low pressure', 26],
      [26047, 'CargoFireBottleLowPressure(2)', 'Cargo fire bottle 2 low pressure', 26],
      [26048, 'SmokeDetectionFunction', 'Smoke detection function (SDF) of the CIDS', 26],
      [49000, 'ApuElectronicControlBox', 'APU electronic control box (ECB)', 49],
      [49001, 'ApuOverspeed', 'APU overspeed (automatic shutdown)', 49],
      [49002, 'ApuOilLowPressure', 'APU low oil pressure (automatic shutdown)', 49],
      [49003, 'ApuOilHighTemperature', 'APU high oil temperature (automatic shutdown on ground)', 49],
    ];
    for (const [id, failureType, name, chapter] of expected) {
      expect(A380FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, name]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId},FailureType::${failureType}),`);
    }
  });

  // The failures of the B25 FADEC alerts without engine model effect (systems engine/engine_monitoring_fault.rs) and the
  // reverser minor fault and maintenance inhibition (a380_systems reverser): A380 FCOM PRO-ABN-ECAM-10-70 CTL SYS FAULT
  // l.171310, CTL VLV FAULT l.171454, FADEC IDENT FAULT l.171629, FUEL SYS CONTAMINATION l.172133, OIL SYS CONTAMINATION
  // l.172517, ENG TYPE DISAGREE l.175642, REVERSER INHIBITED l.173571, REVERSER MINOR FAULT l.173668
  it('lists the FADEC alert failures and the reverser minor fault and inhibition with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const monitoring = (kind: string, firstId: number, name: string, chapter: number) =>
      [1, 2, 3, 4].map((engine): [number, string, string, number] => [
        firstId + engine - 1,
        `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::${kind})`,
        `Engine ${engine} ${name}`,
        chapter,
      ]);
    const expected: [number, string, string, number][] = [
      ...monitoring('ControlSystem', 73270, 'control system fault (alert only)', 73),
      ...monitoring('ControlValve', 73280, 'control valve (cooling/HP turbine/discharge)', 73),
      ...monitoring('FadecIdent', 73290, 'FADEC engine identification', 73),
      ...monitoring('FuelSystemContamination', 73130, 'fuel filter bypass open (contamination)', 73),
      ...monitoring('ThrustRatingDisagree', 73300, 'thrust rating differs (type disagree)', 73),
      ...monitoring('OilSystemContamination', 79050, 'oil filter bypass open (contamination)', 79),
      [78051, 'ReverserMinorFault(2)', 'Reverser 2 minor fault (alert only)', 78],
      [78052, 'ReverserMinorFault(3)', 'Reverser 3 minor fault (alert only)', 78],
      [78061, 'ReverserInhibited(2)', 'Reverser 2 inhibited by maintenance (does not deploy)', 78],
      [78062, 'ReverserInhibited(3)', 'Reverser 3 inhibited by maintenance (does not deploy)', 78],
    ];
    // rustfmt splits the long entries over several lines with a trailing comma: (1,Kind::X,) reads as (1,Kind::X)
    const rustFailure = (id: number) => rustMap.get(id)?.replace(/,\)/g, ')');
    expect(
      expected.map(([id]) => [id, rustFailure(id), A380FailureDefinitions.find(([, listed]) => listed === id)]),
    ).toEqual(expected.map(([id, failureType, name, chapter]) => [id, failureType, [chapter, id, name]]));
  });
});
