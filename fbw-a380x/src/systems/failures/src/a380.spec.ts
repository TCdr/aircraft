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

  it('keeps every definition list literal under 1 000 failures, which tsc can still type (TS2590 above)', () => {
    const source = readFileSync(resolve(__dirname, 'a380.ts'), 'utf8');
    const literals = source.split(': FailureDefinition[] = [').slice(1);
    const sizes = literals.map(
      (literal) => (literal.split('\n];')[0].match(/^\s*\[\d+, A380Failure\./gm) ?? []).length,
    );
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(listedIds.length);
    expect(sizes.filter((size) => size >= 1000)).toEqual([]);
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

  it('names the buses, TRs and controllers as the aircraft and its SD do', () => {
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

  it('lists the BCS gear group and brake pair failures under the Rust failures of brake_anti_skid_faults.rs', () => {
    const rustMap = readRustFailureMap();
    const pairs = [
      '1/2 (left wing gear)',
      '3/4 (right wing gear)',
      '5/6 (left wing gear)',
      '7/8 (right wing gear)',
      '9/10 (left body gear)',
      '11/12 (right body gear)',
      '13/14 (left body gear)',
      '15/16 (right body gear)',
    ];
    const expected: [number, string, string][] = [
      [32120, 'BrakingControlSystem(1)', 'Brakes control system 1 (BCS 1)'],
      [32121, 'BrakingControlSystem(2)', 'Brakes control system 2 (BCS 2)'],
      [32122, 'BrakeRemoteDataConcentratorChannel(1,1)', 'Brakes RDC 1 channel A (wing gears anti-skid)'],
      [32123, 'BrakeRemoteDataConcentratorChannel(1,2)', 'Brakes RDC 1 channel B (wing gears anti-skid)'],
      [32124, 'BrakeRemoteDataConcentratorChannel(2,1)', 'Brakes RDC 2 channel A (right body gear anti-skid)'],
      [32125, 'BrakeRemoteDataConcentratorChannel(2,2)', 'Brakes RDC 2 channel B (right body gear anti-skid)'],
      [32126, 'BrakeRemoteDataConcentratorChannel(3,1)', 'Brakes RDC 3 channel A (left body gear anti-skid)'],
      [32127, 'BrakeRemoteDataConcentratorChannel(3,2)', 'Brakes RDC 3 channel B (left body gear anti-skid)'],
      ...pairs.map((pair, index): [number, string, string] => [
        32160 + index,
        `BrakePairTachometer(${index + 1})`,
        `Brakes ${pair.replace(' (', ' wheel tachometer (')}`,
      ]),
      ...pairs.map((pair, index): [number, string, string] => [
        32170 + index,
        `BrakePairServoValveLeak(${index + 1})`,
        `Brakes ${pair.replace(' (', ' normal servo valve leak (')}`,
      ]),
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[0], definitionOf(id)?.[2]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, 32, name]),
    );
  });

  it('lists the FWS-only brake failures in ATA 32 without a Rust failure', () => {
    const rustMap = readRustFailureMap();
    const ids = [32130, 32131, 32132, 32133, 32134];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(ids.map((id) => [rustMap.has(id), definitionOf(id)?.[0]])).toEqual(ids.map(() => [false, 32]));
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

  it('lists the AICU, ice detector, probe, window and drain mast heating failures in ATA 30 with their Rust failures', () => {
    const rustMap = readRustFailureMap();
    const perAdr = (firstId: number, failureType: (adr: number) => string, name: string): [number, string, string][] =>
      [1, 2, 3].map((adr) => [firstId + adr - 1, failureType(adr), `ADR ${adr} ${name}`]);
    const expected: [number, string, string][] = [
      ...[1, 2, 3, 4].map((engine): [number, string, string] => [
        30119 + engine,
        `EngineAntiIceValveMonitoring(${engine})`,
        `Engine ${engine} anti-ice valve position monitoring`,
      ]),
      [30200, 'AntiIceControlUnitChannel(1,1)', 'Anti-ice control unit 1 channel A'],
      [30201, 'AntiIceControlUnitChannel(1,2)', 'Anti-ice control unit 1 channel B'],
      [30202, 'AntiIceControlUnitChannel(2,1)', 'Anti-ice control unit 2 channel A'],
      [30203, 'AntiIceControlUnitChannel(2,2)', 'Anti-ice control unit 2 channel B'],
      [30210, 'IceDetector(1)', 'Ice detector 1'],
      [30211, 'IceDetector(2)', 'Ice detector 2'],
      ...perAdr(30300, (adr) => `ProbeHeatComputer(${adr})`, 'probes automatic heating command'),
      ...perAdr(30310, (adr) => `ProbeHeater(${adr},1)`, 'pitot TAT AOA probe heater'),
      ...perAdr(30320, (adr) => `ProbeHeater(${adr},2)`, 'left static probe heater'),
      ...perAdr(30330, (adr) => `ProbeHeater(${adr},3)`, 'right static probe heater'),
      ...perAdr(30340, (adr) => `ProbeHeater(${adr},6)`, 'sideslip probe heater'),
      [30350, 'ProbeHeater(4,1)', 'Standby pitot probe heater'],
      [30351, 'ProbeHeater(4,2)', 'Standby static probes heater'],
      [30400, 'WindshieldHeat(1)', 'Left windshield heating'],
      [30401, 'WindshieldHeat(2)', 'Right windshield heating'],
      [30410, 'WindowHeat(1)', 'Left sliding window heating'],
      [30411, 'WindowHeat(2)', 'Right sliding window heating'],
      [30420, 'WindowHeat(3)', 'Left fixed window heating'],
      [30421, 'WindowHeat(4)', 'Right fixed window heating'],
      [30500, 'DrainMastHeat', 'Cabin drain masts heating'],
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

  it('lists the SFCC control unit, FLAPS lever and wing tip brake failures in ATA 27 with the Rust failures of sfcc', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [27200, 'SlatFlapControlComputerFlapControlUnit(1)', 'SFCC 1 flap control unit'],
      [27201, 'SlatFlapControlComputerFlapControlUnit(2)', 'SFCC 2 flap control unit'],
      [27202, 'SlatFlapControlComputerSlatControlUnit(1)', 'SFCC 1 slat control unit'],
      [27203, 'SlatFlapControlComputerSlatControlUnit(2)', 'SFCC 2 slat control unit'],
      [27204, 'FlapsLeverLink(1)', 'FLAPS lever link to SFCC 1'],
      [27205, 'FlapsLeverLink(2)', 'FLAPS lever link to SFCC 2'],
      [27206, 'FlapsLeverOutOfDetent', 'FLAPS lever jammed out of detent'],
      [27207, 'FlapTransmissionAsymmetry', 'Flap transmission asymmetry'],
      [27208, 'SlatTransmissionAsymmetry', 'Slat transmission asymmetry'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 27]),
    );
  });

  // The FWS reads these failures itself (FwsSlatFlapAlerts): no Rust system reacts to them
  it('lists the overdue slat and flap maintenance tests in ATA 27, outside the Rust map', () => {
    const rustMap = readRustFailureMap();
    const ids = [27210, 27211, 27212, 27213, 27214, 27215];
    expect(ids.filter((id) => !listedIds.includes(id) || rustMap.has(id))).toEqual([]);
  });

  // The labels say what a380_systems engine_failure.rs does with ids 72000-72013
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

  // The fan does not turn at a start on the ground (a380_systems engine_failure.rs, fadec_a380x FanBlockedStart_A380X.hpp)
  it('lists the N1 rotor jam of the four engines in ATA 72 Engine', () => {
    const rustMap = readRustFailureMap();
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    const expected = [1, 2, 3, 4].map((engine) => [
      72020 + engine - 1,
      `EngineFanBlocked(${engine})`,
      `Engine ${engine} N1 rotor jammed (no N1 rotation at start)`,
      72,
    ]);

    expect(
      expected.map(([id]) => [
        id,
        rustMap.get(id as number),
        definitionOf(id as number)?.[2],
        definitionOf(id as number)?.[0],
      ]),
    ).toEqual(expected);
    expect(A380Failure.Eng1N1RotorJammed).toBe(72020);
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

  // The labels say what systems::engine::engine_start does with ids 74000-74013 and 80000-80053
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

  // The labels say what a380_systems engine_malfunction.rs does with ids 72100-72123 and 77000-77003
  it('lists the stall, EGT overtemperature, overspeed and vibration failures of the four engines', () => {
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
        [72120 + engine - 1, `EngineOverspeed(${engine})`, `Engine ${engine} overspeed (HMU shutdown)`, 72],
        [77000 + engine - 1, `EngineHighVibration(${engine})`, `Engine ${engine} high vibration`, 77],
      ],
    );
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name, chapter]) => [id, failureType, name, chapter]),
    );
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
  // The labels say what a380_systems engine_control_failure.rs and the reversers do with each id: the reversers are on
  // engines 2 and 3 only
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

  // The EEC channels and EIPMs of a380_systems fadec_power.rs
  it('lists the FADEC channel and EIPM failures in ATA 73 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      ...[1, 2, 3, 4].flatMap((engine): [number, string, string][] => [
        [73400 + engine - 1, `FadecChannelA(${engine})`, `Engine ${engine} FADEC channel A`],
        [73410 + engine - 1, `FadecChannelB(${engine})`, `Engine ${engine} FADEC channel B`],
      ]),
      [73420, 'EngineInterfacePowerManagement(1)', 'EIPM 1 (engines 2 and 4 FADEC and reverser 2 supply)'],
      [73421, 'EngineInterfacePowerManagement(2)', 'EIPM 2 (engines 1 and 3 FADEC and reverser 3 supply)'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);
    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, [73, id, name]]),
    );
  });

  // The labels say what systems engine/fuel_filter_failure.rs does with ids 73100-73103
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

  // electrical/distribution.rs consumes 24200-24204; 24210-24225 are read by the FWS only (FwsElecSupplyCentreAlerts)
  it('lists the supply centre, network management and C/B monitoring failures in ATA 24', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string | undefined, string][] = [
      [24200, 'ElectricalPrimarySupplyCentre(1)', 'Primary Supply Center 1'],
      [24201, 'ElectricalPrimarySupplyCentre(2)', 'Primary Supply Center 2'],
      [24202, 'ElectricalNetworkManagementUnit(1)', 'ENMU 1'],
      [24203, 'ElectricalNetworkManagementUnit(2)', 'ENMU 2'],
      [24204, 'ElectricalLoadManagementUnit', 'ELMU'],
      [24210, undefined, 'Secondary Supply Center 1'],
      [24211, undefined, 'Secondary Supply Center 2'],
      [24212, undefined, 'Secondary Supply Center 1 Communication'],
      [24213, undefined, 'Secondary Supply Center 2 Communication'],
      [24214, undefined, 'Secondary Supply Center 1 Redundancy'],
      [24215, undefined, 'Secondary Supply Center 2 Redundancy'],
      [24216, undefined, 'Secondary Supply Center 1 Fan'],
      [24217, undefined, 'Secondary Supply Center 2 Fan'],
      [24218, undefined, 'Cabin L Supply Center Overheat'],
      [24219, undefined, 'Cabin R Supply Center Overheat'],
      [24220, undefined, 'Cabin L Supply Center Overheat Detection'],
      [24221, undefined, 'Cabin R Supply Center Overheat Detection'],
      [24222, undefined, 'C/B Monitoring'],
      [24223, undefined, 'EMER C/B Monitoring'],
      [24224, undefined, 'C/B Tripped'],
      [24225, undefined, 'DC ESS Part'],
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

  // a380_systems pneumatic.rs: the HP, fan air and crossbleed valves, and the leak detection dual loops and systems
  it('lists the HP, fan air and crossbleed valve and leak detection failures in ATA 36 under the ids of the Rust map', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [];
    for (const engine of [1, 2, 3, 4]) {
      expected.push(
        [36020 + engine - 1, `EngineHpValveStuckClosed(${engine})`, `Engine ${engine} HP valve stuck closed`],
        [36040 + engine - 1, `EngineFanAirValveStuckOpen(${engine})`, `Engine ${engine} fan air valve stuck open`],
        [
          36090 + engine - 1,
          `EngineLeakDetectionDualLoop(${engine})`,
          `Engine ${engine} pylon leak detection dual loop`,
        ],
      );
    }
    ['Left', 'Center', 'Right'].forEach((side, index) => {
      expected.push(
        [36050 + index, `CrossBleedValveNumberStuckClosed(${index + 1})`, `${side} crossbleed valve stuck closed`],
        [36055 + index, `CrossBleedValveNumberStuckOpen(${index + 1})`, `${side} crossbleed valve stuck open`],
      );
    });
    ['Left outer', 'Left inner', 'Right inner', 'Right outer'].forEach((zone, index) => {
      expected.push([
        36094 + index,
        `WingLeakDetectionDualLoop(${index + 1})`,
        `${zone} wing leak detection dual loop`,
      ]);
    });
    expected.push(
      [36100, 'ApuLeakDetectionDualLoop', 'APU bleed duct leak detection dual loop'],
      [36101, 'PackBayLeakDetectionDualLoop(1)', 'Pack 1 bay leak detection dual loop'],
      [36102, 'PackBayLeakDetectionDualLoop(2)', 'Pack 2 bay leak detection dual loop'],
      [36103, 'HotAirLeakDetectionDualLoop(1)', 'Hot air 1 duct leak detection dual loop'],
      [36104, 'HotAirLeakDetectionDualLoop(2)', 'Hot air 2 duct leak detection dual loop'],
      [36105, 'FwdCargoLeakDetectionDualLoop', 'Forward cargo duct leak detection dual loop'],
      [36106, 'AftCargoLeakDetectionDualLoop', 'Aft cargo duct leak detection dual loop'],
      [36110, 'BleedLeakDetectionSystem(1)', 'Bleed leak detection system 1'],
      [36111, 'BleedLeakDetectionSystem(2)', 'Bleed leak detection system 2'],
    );
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 36]),
    );
  });

  // The labels say what systems engine/hp_fuel_valve_failure.rs and engine/engine_monitoring_fault.rs do with each id:
  // the HP fuel valve sticks, the other faults only raise their FWS alert
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

  it('lists the MMR and ILS receiver failures in ATA 34 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string][] = [
      [34100, 'MultiModeReceiver(1)', 'MMR 1 (ILS 1 and GPS 1 receivers)'],
      [34101, 'MultiModeReceiver(2)', 'MMR 2 (ILS 2 and GPS 2 receivers)'],
      [34102, 'IlsReceiver(1)', 'ILS 1 receiver'],
      [34103, 'IlsReceiver(2)', 'ILS 2 receiver'],
    ];
    const definitionOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id);

    expect(expected.map(([id]) => [id, rustMap.get(id), definitionOf(id)?.[2], definitionOf(id)?.[0]])).toEqual(
      expected.map(([id, failureType, name]) => [id, failureType, name, 34]),
    );
  });

  it('lists the probe and SURV function failures the systems host and the FWS read in ATA 34', () => {
    const ids = [
      A380Failure.Adr1LeftStaticProbe,
      A380Failure.Adr3RightStaticProbe,
      A380Failure.SideslipProbe1,
      A380Failure.SideslipProbe3,
      A380Failure.SurvSystem1,
      A380Failure.SurvSystem2,
      A380Failure.WxrDisplay1,
      A380Failure.WxrTurbulence2,
      A380Failure.WxrPredictiveWindshear1,
      A380Failure.SurvSystemLink,
      A380Failure.ReactiveWindshearDetection,
    ];
    expect(ids.map((id) => A380FailureDefinitions.find(([, listedId]) => listedId === id)?.[0])).toEqual(
      ids.map(() => 34),
    );
  });
});

describe('A380X slat/flap channel and avionics network failures', () => {
  // The labels say what a380_systems hydraulic/sfcc does with each id (F/CTL FLAP(SLAT) SYS 1(2) FAULT)
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

  // 16 AFDX switches (8 per network), 4 pairs of IOMs, 22 CPIOMs in 7 groups. The Rust model names them as the
  // AFDX_SWITCH_n / IOM_xn / CPIOM_xn L:vars.
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

  // TS only: read by the FWS (FwsTailStrikeAlerts), TAIL STRIKE DET FAULT
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
      [26049, 'Smoke(SmokeDetectionZone::NetworkServerSystem)', 'Network server system (NSS) smoke', 26],
      [
        26050,
        'SmokeDetector(SmokeDetectionZone::NetworkServerSystem,1)',
        'Network server system (NSS) smoke detector 1',
        26,
      ],
      [
        26051,
        'SmokeDetector(SmokeDetectionZone::NetworkServerSystem,2)',
        'Network server system (NSS) smoke detector 2',
        26,
      ],
      [26052, 'Smoke(SmokeDetectionZone::MainDeckLavatory)', 'Main deck lavatory smoke', 26],
      [26053, 'SmokeDetector(SmokeDetectionZone::MainDeckLavatory,1)', 'Main deck lavatory smoke detector', 26],
      [26054, 'Smoke(SmokeDetectionZone::UpperDeckLavatory)', 'Upper deck lavatory smoke', 26],
      [26055, 'SmokeDetector(SmokeDetectionZone::UpperDeckLavatory,1)', 'Upper deck lavatory smoke detector', 26],
      [26056, 'Smoke(SmokeDetectionZone::LowerDeckLavatory)', 'Lower deck lavatory smoke', 26],
      [26057, 'SmokeDetector(SmokeDetectionZone::LowerDeckLavatory,1)', 'Lower deck lavatory smoke detector', 26],
      [26058, 'Smoke(SmokeDetectionZone::FlightCrewRest1)', 'Flight crew rest 1 smoke', 26],
      [26059, 'SmokeDetector(SmokeDetectionZone::FlightCrewRest1,1)', 'Flight crew rest 1 smoke detector 1', 26],
      [26060, 'SmokeDetector(SmokeDetectionZone::FlightCrewRest1,2)', 'Flight crew rest 1 smoke detector 2', 26],
      [26061, 'Smoke(SmokeDetectionZone::FlightCrewRest2)', 'Flight crew rest 2 smoke', 26],
      [26062, 'SmokeDetector(SmokeDetectionZone::FlightCrewRest2,1)', 'Flight crew rest 2 smoke detector 1', 26],
      [26063, 'SmokeDetector(SmokeDetectionZone::FlightCrewRest2,2)', 'Flight crew rest 2 smoke detector 2', 26],
      [26064, 'Smoke(SmokeDetectionZone::AftLowerDeckCabinCrewRest)', 'Aft lower deck cabin crew rest smoke', 26],
      [
        26065,
        'SmokeDetector(SmokeDetectionZone::AftLowerDeckCabinCrewRest,1)',
        'Aft lower deck cabin crew rest smoke detector 1',
        26,
      ],
      [
        26066,
        'SmokeDetector(SmokeDetectionZone::AftLowerDeckCabinCrewRest,2)',
        'Aft lower deck cabin crew rest smoke detector 2',
        26,
      ],
      [26067, 'CrewRestFireBottle(1)', 'Aft lower deck cabin crew rest fire bottle 1', 26],
      [26068, 'CrewRestFireBottle(2)', 'Aft lower deck cabin crew rest fire bottle 2', 26],
      [
        26069,
        'Smoke(SmokeDetectionZone::MainDeck1LCabinWorkStation)',
        'Main deck 1L cabin work station (CWS) smoke',
        26,
      ],
      [
        26070,
        'SmokeDetector(SmokeDetectionZone::MainDeck1LCabinWorkStation,1)',
        'Main deck 1L cabin work station (CWS) smoke detector 1',
        26,
      ],
      [
        26071,
        'SmokeDetector(SmokeDetectionZone::MainDeck1LCabinWorkStation,2)',
        'Main deck 1L cabin work station (CWS) smoke detector 2',
        26,
      ],
      [
        26072,
        'Smoke(SmokeDetectionZone::UpperDeck1LCabinWorkStation)',
        'Upper deck 1L cabin work station (CWS) smoke',
        26,
      ],
      [
        26073,
        'SmokeDetector(SmokeDetectionZone::UpperDeck1LCabinWorkStation,1)',
        'Upper deck 1L cabin work station (CWS) smoke detector 1',
        26,
      ],
      [
        26074,
        'SmokeDetector(SmokeDetectionZone::UpperDeck1LCabinWorkStation,2)',
        'Upper deck 1L cabin work station (CWS) smoke detector 2',
        26,
      ],
      [
        26075,
        'Smoke(SmokeDetectionZone::UpperDeck3RRemoteControlCenter)',
        'Upper deck 3R remote control center (RCC) smoke',
        26,
      ],
      [
        26076,
        'SmokeDetector(SmokeDetectionZone::UpperDeck3RRemoteControlCenter,1)',
        'Upper deck 3R remote control center (RCC) smoke detector 1',
        26,
      ],
      [
        26077,
        'SmokeDetector(SmokeDetectionZone::UpperDeck3RRemoteControlCenter,2)',
        'Upper deck 3R remote control center (RCC) smoke detector 2',
        26,
      ],
      [26078, 'CargoFireDiverterValvePosition(1)', 'Cargo fire bottles diverter valve FWD position', 26],
      [26079, 'CargoFireDiverterValvePosition(2)', 'Cargo fire bottles diverter valve AFT position', 26],
      [26080, 'CargoFireBottleControl', 'Cargo fire bottles control', 26],
      [26081, 'SmokeDetectionFacilities', 'Smoke detection facilities (cabin configuration) of the SDF', 26],
      [26082, 'SmokeDetectionSafetyTestOverdue', 'SDF automatic safety test overdue', 26],
      [49000, 'ApuElectronicControlBox', 'APU electronic control box (ECB)', 49],
      [49001, 'ApuOverspeed', 'APU overspeed (automatic shutdown)', 49],
      [49002, 'ApuOilLowPressure', 'APU low oil pressure (automatic shutdown)', 49],
      [49003, 'ApuOilHighTemperature', 'APU high oil temperature (automatic shutdown on ground)', 49],
      [49005, 'ApuOilLevelLow', 'APU oil level low (OIL LVL LO on the APU page)', 49],
    ];
    for (const [id, failureType, name, chapter] of expected) {
      expect(A380FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, name]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId},FailureType::${failureType}),`);
    }
  });

  // The failures of the FADEC alerts without engine model effect (systems engine/engine_monitoring_fault.rs) and
  // the reverser minor fault and maintenance inhibition (a380_systems reverser): CTL SYS FAULT, CTL VLV FAULT, FADEC
  // IDENT FAULT, FUEL SYS CONTAMINATION, OIL SYS CONTAMINATION, ENG TYPE DISAGREE, REVERSER INHIBITED, REVERSER MINOR
  // FAULT
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
      ...monitoring('ControlSystem', 73270, 'control system fault', 73),
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

// The FADEC shutdowns (a380_systems fadec_automatic_shutdown.rs) and the APU bleed valve stuck failures (a380_systems
// pneumatic.rs ApuBleedAirValve, AIR APU BLEED FAULT); the names say what the Rust does
describe('A380X FADEC shutdown and APU bleed valve failures', () => {
  it('lists them with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string, string, number][] = [
      ...[1, 2, 3, 4].map((engine): [number, string, string, number] => [
        73310 + engine - 1,
        `FadecOverheatShutdown(${engine})`,
        `Engine ${engine} FADEC overheat (engine shutdown)`,
        73,
      ]),
      ...[1, 2, 3, 4].map((engine): [number, string, string, number] => [
        73320 + engine - 1,
        `EngineOverthrust(${engine})`,
        `Engine ${engine} overthrust (thrust control lost)`,
        73,
      ]),
      [36060, 'ApuBleedValveStuckClosed', 'APU bleed valve stuck closed', 36],
      [36061, 'ApuBleedValveStuckOpen', 'APU bleed valve stuck open', 36],
    ];
    expect(
      expected.map(([id]) => [id, rustMap.get(id), A380FailureDefinitions.find(([, listed]) => listed === id)]),
    ).toEqual(expected.map(([id, failureType, name, chapter]) => [id, failureType, [chapter, id, name]]));
  });
});

// The primary flight control actuators (a380_systems hydraulic/flight_control_actuator_failures.rs): actuator 1 and 2 of
// each surface in the order of the Rust surface controllers, named after the hydraulic system or EHA of each actuator
describe('A380X flight control actuator failures', () => {
  it('lists them in ATA 27 with the Rust failure they trigger', () => {
    const rustMap = readRustFailureMap();
    const actuators: [string, string, string, string][] = [
      ['LeftOuterAileron', 'L outer aileron', 'green actuator', 'yellow actuator'],
      ['LeftMidAileron', 'L mid aileron', 'yellow actuator', 'EHA'],
      ['LeftInnerAileron', 'L inner aileron', 'green actuator', 'EHA'],
      ['RightInnerAileron', 'R inner aileron', 'green actuator', 'EHA'],
      ['RightMidAileron', 'R mid aileron', 'yellow actuator', 'EHA'],
      ['RightOuterAileron', 'R outer aileron', 'green actuator', 'yellow actuator'],
      ['LeftOuterElevator', 'L outer elevator', 'green actuator', 'EHA'],
      ['LeftInnerElevator', 'L inner elevator', 'green actuator', 'EHA'],
      ['RightInnerElevator', 'R inner elevator', 'yellow actuator', 'EHA'],
      ['RightOuterElevator', 'R outer elevator', 'yellow actuator', 'EHA'],
      ['UpperRudder', 'Upper rudder', 'yellow EBHA', 'green EBHA'],
      ['LowerRudder', 'Lower rudder', 'green EBHA', 'yellow EBHA'],
    ];
    const expected: [number, string, string][] = [
      ...actuators.flatMap(([surface, label, first, second], index): [number, string, string][] => [
        [27100 + 2 * index, `FlightControlActuator(FlightControlSurface::${surface},1)`, `${label} ${first}`],
        [27101 + 2 * index, `FlightControlActuator(FlightControlSurface::${surface},2)`, `${label} ${second}`],
      ]),
      [
        27124,
        'FlightControlActuatorElectricalPart(FlightControlSurface::UpperRudder,1)',
        'Upper rudder yellow EBHA electrical part',
      ],
      [
        27125,
        'FlightControlActuatorElectricalPart(FlightControlSurface::UpperRudder,2)',
        'Upper rudder green EBHA electrical part',
      ],
      [
        27126,
        'FlightControlActuatorElectricalPart(FlightControlSurface::LowerRudder,1)',
        'Lower rudder green EBHA electrical part',
      ],
      [
        27127,
        'FlightControlActuatorElectricalPart(FlightControlSurface::LowerRudder,2)',
        'Lower rudder yellow EBHA electrical part',
      ],
      [27128, 'FlightControlActuator(FlightControlSurface::Stabilizer,1)', 'Stabilizer green hydraulic motor'],
      [27129, 'FlightControlActuator(FlightControlSurface::Stabilizer,2)', 'Stabilizer yellow hydraulic motor'],
      [27130, 'StabilizerJammed', 'Stabilizer jammed'],
    ];
    expect(
      expected.map(([id]) => [id, rustMap.get(id), A380FailureDefinitions.find(([, listed]) => listed === id)]),
    ).toEqual(expected.map(([id, failureType, name]) => [id, failureType, [27, id, name]]));
  });

  it('lists the PRIM actuator control failures in ATA 27 with the ids of the fbw module', () => {
    const failureList = readFileSync(resolve(__dirname, '../../../wasm/fbw_a380/src/failures/FailureList.h'), 'utf8');
    const primFailures: [string, number][] = [
      ['Prim1ElevatorActuatorControl', A380Failure.Prim1ElevatorActuatorControl],
      ['Prim2ElevatorActuatorControl', A380Failure.Prim2ElevatorActuatorControl],
      ['Prim3ElevatorActuatorControl', A380Failure.Prim3ElevatorActuatorControl],
      ['Prim1RudderActuatorControl', A380Failure.Prim1RudderActuatorControl],
      ['Prim2RudderActuatorControl', A380Failure.Prim2RudderActuatorControl],
      ['Prim3RudderActuatorControl', A380Failure.Prim3RudderActuatorControl],
    ];
    for (const [name, id] of primFailures) {
      expect(failureList).toContain(`${name} = ${id},`);
      expect(A380FailureDefinitions.find(([, listed]) => listed === id)?.[0]).toBe(27);
    }
  });
});

// The L/G and steering monitoring failures: the Rust ones under the ids of the a380_systems_wasm map, the others read
// by the FWS only (no Rust failure)
describe('A380X L/G and steering monitoring failures', () => {
  it('lists the Rust failures under their FailureType', () => {
    const rustMap = readRustFailureMap();
    const expected: [number, string][] = [
      [32030, 'GearUplockClosed(1)'],
      [32031, 'GearUplockClosed(2)'],
      [32032, 'GearUplockClosed(3)'],
      [32033, 'GearBogiePosition'],
      [32034, 'GearGravityExtension'],
      [32210, 'BodyWheelSteeringLock(1)'],
      [32211, 'BodyWheelSteeringLock(2)'],
      [32212, 'PedalSteeringControl'],
    ];
    expect(expected.map(([id]) => [id, rustMap.get(id), listedIds.includes(id)])).toEqual(
      expected.map(([id, failureType]) => [id, failureType, true]),
    );
  });

  it('lists the FWS-only failures in ATA 32 without a Rust failure', () => {
    const rustMap = readRustFailureMap();
    const fwsOnly = [
      A380Failure.GearWeightOnWheels,
      A380Failure.GearOleoPressureAbnormalNose,
      A380Failure.GearOleoPressureAbnormalRightBody,
      A380Failure.GearOleoPressureMonitoringNose,
      A380Failure.GearOleoPressureMonitoringRightBody,
      A380Failure.SteeringCaptTiller,
      A380Failure.SteeringFoTiller,
      A380Failure.SteeringLehgsOverheat,
      A380Failure.SteeringNoseWheelDisconnection,
      A380Failure.SteeringNormalSelectorValveJammedOpen,
      A380Failure.SteeringAlternateSelectorValveJammedOpen,
      A380Failure.SteeringBodyWheelSelectorValveJammedOpen,
    ];
    const chapterOf = (id: number) => A380FailureDefinitions.find(([, listed]) => listed === id)?.[0];

    expect(fwsOnly.map((id) => [id, rustMap.has(id), chapterOf(id)])).toEqual(fwsOnly.map((id) => [id, false, 32]));
  });
});
