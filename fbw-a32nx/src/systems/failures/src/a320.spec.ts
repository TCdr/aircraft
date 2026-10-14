// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { AtaChaptersDescription, AtaChaptersTitle } from '@flybywiresim/fbw-sdk';
import { A320Failure, A320FailureDefinitions } from './a320';

describe('A320 flyPad failures', () => {
  it('has a title and a description for every ATA chapter of the failures page', () => {
    const chapters = [...new Set(A320FailureDefinitions.map(([chapter]) => chapter))];
    for (const chapter of chapters) {
      expect(AtaChaptersTitle[chapter], `ATA ${chapter} title`).toBeTruthy();
      expect(AtaChaptersDescription[chapter], `ATA ${chapter} description`).toBeTruthy();
    }
  });

  // The engine failure labels say what a320_systems engine_failure.rs does with ids 72000-72011
  it('lists the engine flameout and seizure failures in ATA 72 Engine', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1Flameout)).toEqual([72, 72000, 'Engine 1 flameout (crew relight possible)']);
    expect(label(A320Failure.Eng2Flameout)).toEqual([72, 72001, 'Engine 2 flameout (crew relight possible)']);
    expect(label(A320Failure.Eng1Seizure)).toEqual([72, 72010, 'Engine 1 seizure (no relight)']);
    expect(label(A320Failure.Eng2Seizure)).toEqual([72, 72011, 'Engine 2 seizure (no relight)']);
  });

  // The labels say what a320_systems engine_failure.rs and the FADEC (FanBlockedStart_A32NX.hpp) do with ids 72020-72021
  it('lists the fan blocked failures in ATA 72 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1FanBlocked)).toEqual([72, 72020, 'Engine 1 fan blocked (no N1 rotation at start)']);
    expect(label(A320Failure.Eng2FanBlocked)).toEqual([72, 72021, 'Engine 2 fan blocked (no N1 rotation at start)']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(72_020, FailureType::EngineFanBlocked(1)),');
    expect(wasm).toContain('(72_021, FailureType::EngineFanBlocked(2)),');
  });

  // The ids are the Rust failure ids of a320_systems_wasm, used by a320_systems hydraulic/brake_control_units.rs
  it('lists the brake and steering control unit failures in ATA 32 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.BscuChannel1)).toEqual([32, 32200, 'BSCU channel 1']);
    expect(label(A320Failure.BscuChannel2)).toEqual([32, 32201, 'BSCU channel 2']);
    expect(label(A320Failure.AlternateBrakingControlUnit)).toEqual([32, 32202, 'ABCU (alternate braking)']);
    expect(label(A320Failure.NormalBraking)).toEqual([32, 32203, 'Normal braking (servo valves)']);
    expect(label(A320Failure.Autobrake)).toEqual([32, 32204, 'Autobrake']);
    expect(label(A320Failure.NoseWheelSteering)).toEqual([32, 32205, 'Nose wheel steering']);
    expect(label(A320Failure.BrakeNormalSelectorValve)).toEqual([32, 32210, 'Brake normal selector valve failed open']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(32_200, FailureType::BrakeSteeringControlUnitChannel(1)),');
    expect(wasm).toContain('(32_201, FailureType::BrakeSteeringControlUnitChannel(2)),');
    expect(wasm).toContain('(32_202, FailureType::AlternateBrakingControlUnit),');
    expect(wasm).toContain('(32_203, FailureType::BrakeNormalBraking),');
    expect(wasm).toContain('(32_204, FailureType::Autobrake),');
    expect(wasm).toContain('(32_205, FailureType::NoseWheelSteeringNormal),');
    expect(wasm).toContain('(32_210, FailureType::BrakeNormalSelectorValve),');
  });

  // The ids are the Rust failure ids of a320_systems_wasm, used by a320_systems tyre_pressure.rs (TPIS)
  it('lists the tyre deflation failures in ATA 32 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.MainTyre1Deflated)).toEqual([32, 32300, 'Main wheel 1 tyre deflated (left outer)']);
    expect(label(A320Failure.MainTyre4Deflated)).toEqual([32, 32303, 'Main wheel 4 tyre deflated (right outer)']);
    expect(label(A320Failure.NoseTyreLeftDeflated)).toEqual([32, 32304, 'Nose wheel left tyre deflated']);
    expect(label(A320Failure.NoseTyreRightDeflated)).toEqual([32, 32305, 'Nose wheel right tyre deflated']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (let tyre = 1; tyre <= 6; tyre++) {
      expect(wasm).toContain(`(32_${299 + tyre}, FailureType::TyreDeflated(${tyre})),`);
    }
  });

  // TS only: the FWC reads it (FWC/Logic/PredictiveWindshearAlerts.ts), no Rust failure
  it('lists the predictive windshear failure of the weather radar in ATA 34', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.WxrPredictiveWindshear)).toEqual([34, 34120, 'Weather radar predictive windshear (PWS)']);
  });

  // The oil failure labels say what systems engine/oil_failure.rs and the FADEC (EngineOilFailures.hpp) do with ids 79000-79031
  it('lists the engine oil failures in ATA 79 Oil', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1OilLeak)).toEqual([79, 79000, 'Engine 1 oil leak']);
    expect(label(A320Failure.Eng2OilLeak)).toEqual([79, 79001, 'Engine 2 oil leak']);
    expect(label(A320Failure.Eng1OilFilterClog)).toEqual([79, 79020, 'Engine 1 oil filter clog']);
    expect(label(A320Failure.Eng2OilFilterClog)).toEqual([79, 79021, 'Engine 2 oil filter clog']);
    expect(label(A320Failure.Eng1OilOverheat)).toEqual([79, 79030, 'Engine 1 oil overheat']);
    expect(label(A320Failure.Eng2OilOverheat)).toEqual([79, 79031, 'Engine 2 oil overheat']);
  });

  // The ids are the Rust failure ids of a320_systems_wasm (systems::engine::engine_start, ATA 74 / 80)
  it('lists the ignition and starting failures in ATA 74 Ignition and ATA 80 Starting', () => {
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(entry(74000)).toEqual([74, 74000, 'Engine 1 igniter A']);
    expect(entry(74011)).toEqual([74, 74011, 'Engine 2 igniter B']);
    expect(entry(80000)).toEqual([80, 80000, 'Engine 1 start valve stuck closed']);
    expect(entry(80011)).toEqual([80, 80011, 'Engine 2 start valve stuck open']);
    expect(entry(80020)).toEqual([80, 80020, 'Engine 1 hot start (start EGT over limit)']);
    expect(entry(80031)).toEqual([80, 80031, 'Engine 2 hung start (N2 stops below idle)']);
    expect(entry(80040)).toEqual([80, 80040, 'Engine 1 stall during the start']);
    expect(entry(80051)).toEqual([80, 80051, 'Engine 2 starter shaft shear']);
    const startFailures = A320FailureDefinitions.filter(([chapter]) => chapter === 74 || chapter === 80);
    expect(startFailures).toHaveLength(16);
  });

  // The labels say what a320_systems engine_malfunction.rs does with ids 72100-72121 and 77000-77001
  it('lists the stall, EGT overtemperature, overspeed and vibration failures of both engines', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1CompressorStall)).toEqual([72, 72100, 'Engine 1 compressor stall (above 60 % N1)']);
    expect(label(A320Failure.Eng2CompressorStall)).toEqual([72, 72101, 'Engine 2 compressor stall (above 60 % N1)']);
    expect(label(A320Failure.Eng1EgtOvertemperature)).toEqual([72, 72110, 'Engine 1 EGT overtemperature']);
    expect(label(A320Failure.Eng2EgtOvertemperature)).toEqual([72, 72111, 'Engine 2 EGT overtemperature']);
    expect(label(A320Failure.Eng1Overspeed)).toEqual([72, 72120, 'Engine 1 N1/N2 overspeed indication']);
    expect(label(A320Failure.Eng2Overspeed)).toEqual([72, 72121, 'Engine 2 N1/N2 overspeed indication']);
    expect(label(A320Failure.Eng1HighVibration)).toEqual([77, 77000, 'Engine 1 high vibration']);
    expect(label(A320Failure.Eng2HighVibration)).toEqual([77, 77001, 'Engine 2 high vibration']);
  });

  // The labels say what a320_systems engine_control_failure.rs and the hydraulic reversers do with ids 73010-78021
  it('lists the FADEC and thrust lever failures in ATA 73 and the reverser failures in ATA 78', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1FadecChannelA)).toEqual([73, 73010, 'Engine 1 FADEC channel A']);
    expect(label(A320Failure.Eng2FadecChannelB)).toEqual([73, 73021, 'Engine 2 FADEC channel B']);
    expect(label(A320Failure.Eng1FadecOverheat)).toEqual([73, 73030, 'Engine 1 FADEC overheat']);
    expect(label(A320Failure.ThrustLever2Resolvers)).toEqual([73, 73041, 'Thrust lever 2 resolvers (both)']);
    expect(label(A320Failure.ThrustLever1ResolverDisagree)).toEqual([73, 73050, 'Thrust lever 1 resolver disagree']);
    expect(label(A320Failure.Reverser1Fault)).toEqual([78, 78000, 'Reverser 1 fault (does not deploy)']);
    expect(label(A320Failure.Reverser2Unlocked)).toEqual([78, 78011, 'Reverser 2 unlocked (engine at idle)']);
    expect(label(A320Failure.Reverser1Pressurized)).toEqual([78, 78020, 'Reverser 1 pressurized (shutoff valve open)']);
  });

  // The ATA 36 ids are the Rust failures of a320_systems pneumatic.rs, registered in a320_systems_wasm
  it('lists the pneumatic failures in ATA 36 with the Rust failure they trigger', () => {
    const rustFailureById: [number, string, string][] = [
      [A320Failure.Eng1BleedValveStuckClosed, 'EngineBleedValveStuckClosed(1)', 'Engine 1 bleed valve stuck closed'],
      [A320Failure.Eng2BleedValveStuckClosed, 'EngineBleedValveStuckClosed(2)', 'Engine 2 bleed valve stuck closed'],
      [
        A320Failure.Eng1BleedValveStuckOpen,
        'EngineBleedValveStuckOpen(1)',
        'Engine 1 bleed valve stuck open (no regulation)',
      ],
      [
        A320Failure.Eng2BleedValveStuckOpen,
        'EngineBleedValveStuckOpen(2)',
        'Engine 2 bleed valve stuck open (no regulation)',
      ],
      [A320Failure.Eng1HpValveStuckClosed, 'EngineHpValveStuckClosed(1)', 'Engine 1 HP valve stuck closed'],
      [A320Failure.Eng2HpValveStuckClosed, 'EngineHpValveStuckClosed(2)', 'Engine 2 HP valve stuck closed'],
      [
        A320Failure.Eng1FanAirValveStuckClosed,
        'EngineFanAirValveStuckClosed(1)',
        'Engine 1 precooler fan air valve stuck closed (overheat)',
      ],
      [
        A320Failure.Eng2FanAirValveStuckClosed,
        'EngineFanAirValveStuckClosed(2)',
        'Engine 2 precooler fan air valve stuck closed (overheat)',
      ],
      [
        A320Failure.Eng1FanAirValveStuckOpen,
        'EngineFanAirValveStuckOpen(1)',
        'Engine 1 precooler fan air valve stuck open (low temperature)',
      ],
      [
        A320Failure.Eng2FanAirValveStuckOpen,
        'EngineFanAirValveStuckOpen(2)',
        'Engine 2 precooler fan air valve stuck open (low temperature)',
      ],
      [A320Failure.CrossBleedValveStuckClosed, 'CrossBleedValveStuckClosed', 'X BLEED valve stuck closed'],
      [A320Failure.CrossBleedValveStuckOpen, 'CrossBleedValveStuckOpen', 'X BLEED valve stuck open'],
      [A320Failure.ApuBleedValveStuckClosed, 'ApuBleedValveStuckClosed', 'APU bleed valve stuck closed'],
      [A320Failure.ApuBleedValveStuckOpen, 'ApuBleedValveStuckOpen', 'APU bleed valve stuck open'],
      [A320Failure.Eng1PylonBleedLeak, 'EngineBleedLeak(1)', 'Engine 1 pylon bleed leak'],
      [A320Failure.Eng2PylonBleedLeak, 'EngineBleedLeak(2)', 'Engine 2 pylon bleed leak'],
      [A320Failure.LeftWingBleedLeak, 'WingBleedLeak(1)', 'Left wing bleed leak'],
      [A320Failure.RightWingBleedLeak, 'WingBleedLeak(2)', 'Right wing bleed leak'],
      [A320Failure.ApuBleedLeak, 'ApuBleedLeak', 'APU bleed duct leak'],
      [A320Failure.Eng1PylonLeakDetectionLoop, 'EngineLeakDetectionLoop(1)', 'Engine 1 pylon leak detection loop'],
      [A320Failure.Eng2PylonLeakDetectionLoop, 'EngineLeakDetectionLoop(2)', 'Engine 2 pylon leak detection loop'],
      [A320Failure.LeftWingLeakDetectionLoopA, 'WingLeakDetectionLoop(1, 1)', 'Left wing leak detection loop A'],
      [A320Failure.LeftWingLeakDetectionLoopB, 'WingLeakDetectionLoop(1, 2)', 'Left wing leak detection loop B'],
      [A320Failure.RightWingLeakDetectionLoopA, 'WingLeakDetectionLoop(2, 1)', 'Right wing leak detection loop A'],
      [A320Failure.RightWingLeakDetectionLoopB, 'WingLeakDetectionLoop(2, 2)', 'Right wing leak detection loop B'],
      [A320Failure.ApuLeakDetectionLoop, 'ApuLeakDetectionLoop', 'APU leak detection loop'],
      [A320Failure.Bmc1, 'BleedMonitoringComputer(1)', 'BMC 1 (bleed monitoring computer)'],
      [A320Failure.Bmc2, 'BleedMonitoringComputer(2)', 'BMC 2 (bleed monitoring computer)'],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    for (const [id, rustFailure, label] of rustFailureById) {
      expect(entry(id)).toEqual([36, id, label]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId}, FailureType::${rustFailure}),`);
    }
    expect(A320FailureDefinitions.filter(([chapter]) => chapter === 36)).toHaveLength(rustFailureById.length);
  });

  // The ATA 30 ids are the Rust failures of the engine anti-ice valves (systems ice_rain_protection), in a320_systems_wasm
  it('lists the engine anti-ice valve failures in ATA 30 with the Rust failure they trigger', () => {
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(entry(A320Failure.Eng1AntiIceValveStuckClosed)).toEqual([30, 30000, 'Engine 1 anti-ice valve stuck closed']);
    expect(entry(A320Failure.Eng2AntiIceValveStuckClosed)).toEqual([30, 30001, 'Engine 2 anti-ice valve stuck closed']);
    expect(entry(A320Failure.Eng1AntiIceValveStuckOpen)).toEqual([30, 30010, 'Engine 1 anti-ice valve stuck open']);
    expect(entry(A320Failure.Eng2AntiIceValveStuckOpen)).toEqual([30, 30011, 'Engine 2 anti-ice valve stuck open']);
    expect(wasm).toContain('(30_000, FailureType::EngineAntiIceValveStuckClosed(1)),');
    expect(wasm).toContain('(30_001, FailureType::EngineAntiIceValveStuckClosed(2)),');
    expect(wasm).toContain('(30_010, FailureType::EngineAntiIceValveStuckOpen(1)),');
    expect(wasm).toContain('(30_011, FailureType::EngineAntiIceValveStuckOpen(2)),');
  });

  // The labels say what systems engine/fuel_filter_failure.rs does with ids 73100-73101 (failure names audit rule)
  it('lists the engine fuel filter clog failures in ATA 73 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1FuelFilterClog)).toEqual([73, 73100, 'Engine 1 fuel filter clog']);
    expect(label(A320Failure.Eng2FuelFilterClog)).toEqual([73, 73101, 'Engine 2 fuel filter clog']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(73_100, FailureType::EngineFuelFilterClog(1)),');
    expect(wasm).toContain('(73_101, FailureType::EngineFuelFilterClog(2)),');
  });

  // The labels say what systems engine/hp_fuel_valve_failure.rs and engine/engine_monitoring_fault.rs do with each id
  // (failure names audit rule): the HP fuel valve sticks, the other faults only raise their FWC alert
  it('lists the HP fuel valve and FADEC monitoring failures with the Rust failure they trigger', () => {
    const rustFailureById: [number, number, string, string][] = [
      [73, A320Failure.Eng1HpFuelValveStuck, 'EngineHpFuelValveStuck(1)', 'Engine 1 HP fuel valve stuck'],
      [73, A320Failure.Eng2HpFuelValveStuck, 'EngineHpFuelValveStuck(2)', 'Engine 2 HP fuel valve stuck'],
      [
        73,
        A320Failure.Eng1FadecAlternator,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::FadecAlternator)',
        'Engine 1 FADEC alternator',
      ],
      [
        73,
        A320Failure.Eng2FadecAlternator,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::FadecAlternator)',
        'Engine 2 FADEC alternator',
      ],
      [
        73,
        A320Failure.Eng1OverspeedProtection,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::OverspeedProtection)',
        'Engine 1 overspeed protection',
      ],
      [
        73,
        A320Failure.Eng2OverspeedProtection,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::OverspeedProtection)',
        'Engine 2 overspeed protection',
      ],
      [
        73,
        A320Failure.Eng1InletProbes,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::InletProbes)',
        'Engine 1 inlet probes (T12, P0, PT2)',
      ],
      [
        73,
        A320Failure.Eng2InletProbes,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::InletProbes)',
        'Engine 2 inlet probes (T12, P0, PT2)',
      ],
      [
        73,
        A320Failure.Eng1Sensors,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::Sensors)',
        'Engine 1 core sensors (PS3, T25, T3)',
      ],
      [
        73,
        A320Failure.Eng2Sensors,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::Sensors)',
        'Engine 2 core sensors (PS3, T25, T3)',
      ],
      [
        73,
        A320Failure.ThrustLever1OneResolver,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::OneThrustLeverResolver)',
        'Thrust lever 1 one resolver',
      ],
      [
        73,
        A320Failure.ThrustLever2OneResolver,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::OneThrustLeverResolver)',
        'Thrust lever 2 one resolver',
      ],
      [
        78,
        A320Failure.Reverser1PermissionSwitch,
        'EngineMonitoringFault(1,EngineMonitoringFaultKind::ReverserPermissionSwitch)',
        'Reverser 1 permission switch',
      ],
      [
        78,
        A320Failure.Reverser2PermissionSwitch,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::ReverserPermissionSwitch)',
        'Reverser 2 permission switch',
      ],
      // FCOM gap batch T2-37: ENG FUEL CTL FAULT, FUEL RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE, BLEED STATUS
      // FAULT, REV INHIBITED, REV ISOL FAULT
      ...[1, 2].flatMap((engine): [number, number, string, string][] => [
        [
          73,
          engine === 1 ? A320Failure.Eng1FuelMeteringValve : A320Failure.Eng2FuelMeteringValve,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::FuelMeteringValve)`,
          `Engine ${engine} fuel metering valve control (FMV)`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1FuelReturnValveFailedClosed : A320Failure.Eng2FuelReturnValveFailedClosed,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::FuelReturnValveFailedClosed)`,
          `Engine ${engine} fuel return valve failed closed`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1FuelReturnValveFailedOpen : A320Failure.Eng2FuelReturnValveFailedOpen,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::FuelReturnValveFailedOpen)`,
          `Engine ${engine} fuel return valve failed open`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1ClearanceControlValves : A320Failure.Eng2ClearanceControlValves,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::ClearanceControlValves)`,
          `Engine ${engine} burner staging / clearance control valves`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1CompressorVanes : A320Failure.Eng2CompressorVanes,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::CompressorVanes)`,
          `Engine ${engine} compressor vanes (VBV or VSV)`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1CompressorVaneChannel : A320Failure.Eng2CompressorVaneChannel,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::CompressorVaneChannel)`,
          `Engine ${engine} compressor vane control, one channel`,
        ],
        [
          73,
          engine === 1 ? A320Failure.Eng1BleedValveStatus : A320Failure.Eng2BleedValveStatus,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::BleedValveStatus)`,
          `Engine ${engine} bleed valve status to FADEC`,
        ],
        [
          78,
          engine === 1 ? A320Failure.Reverser1InhibitedByMaintenance : A320Failure.Reverser2InhibitedByMaintenance,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::ReverserInhibited)`,
          `Reverser ${engine} inhibited by maintenance (does not deploy)`,
        ],
        [
          78,
          engine === 1 ? A320Failure.Reverser1ShutoffValveFailedOpen : A320Failure.Reverser2ShutoffValveFailedOpen,
          `EngineMonitoringFault(${engine},EngineMonitoringFaultKind::ReverserShutoffValve)`,
          `Reverser ${engine} HCU shutoff valve failed open`,
        ],
      ]),
    ];
    // rustfmt splits the long entries over several lines (with a trailing comma): compare without whitespace and
    // without that comma
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8')
      .replace(/\s/g, '')
      .replace(/,\)/g, ')');
    for (const [chapter, id, rustFailure, label] of rustFailureById) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, label]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId},FailureType::${rustFailure}),`);
    }
  });

  // TS only failures of the FCOM gap batch T2-37: the systems-host reads them (FWC Logic/EngineFadecFaultAlerts,
  // Logic/DatalinkAlerts and atsu.ts), the systems WASM does not know them
  it('lists the vibration monitoring unit in ATA 77 and the ATSU failures in ATA 46, TS only', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.EngineVibrationMonitoringUnit)).toEqual([
      77,
      77010,
      'Engine vibration monitoring unit (EVMU)',
    ]);
    expect(label(A320Failure.Atsu)).toEqual([46, 46000, 'ATSU']);
    expect(label(A320Failure.AtsuAoc)).toEqual([46, 46001, 'ATSU AOC function (company datalink)']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const rustId of ['77_010', '46_000', '46_001']) {
      expect(wasm).not.toContain(`(${rustId},`);
    }
    const host = resolve(__dirname, '../../systems-host/systems');
    expect(readFileSync(resolve(host, 'FWC/Logic/EngineFadecFaultAlerts.ts'), 'utf8')).toContain(
      'A320Failure.EngineVibrationMonitoringUnit',
    );
    const datalinkAlerts = readFileSync(resolve(host, 'FWC/Logic/DatalinkAlerts.ts'), 'utf8');
    const atsu = readFileSync(resolve(host, 'atsu.ts'), 'utf8');
    for (const source of [datalinkAlerts, atsu]) {
      expect(source).toMatch(/A320Failure\.Atsu\b/);
      expect(source).toContain('A320Failure.AtsuAoc');
    }
  });

  // TS only failures of the FCOM gap batch T2-46: the systems-host ATSU (atsu.ts) writes them for the DCDU, its
  // screens and the MCDU print (FCOM DSC-46-10-10 l.59032-59056)
  it('lists the DCDU 1, DCDU 2 and printer failures in ATA 46, TS only, read by the systems-host ATSU', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Dcdu1)).toEqual([46, 46002, 'DCDU 1 (captain)']);
    expect(label(A320Failure.Dcdu2)).toEqual([46, 46003, 'DCDU 2 (first officer)']);
    expect(label(A320Failure.Printer)).toEqual([46, 46004, 'Cockpit printer']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const rustId of ['46_002', '46_003', '46_004']) {
      expect(wasm).not.toContain(`(${rustId},`);
    }
    const atsu = readFileSync(resolve(__dirname, '../../systems-host/systems/atsu.ts'), 'utf8');
    for (const failure of ['Dcdu1', 'Dcdu2', 'Printer']) {
      expect(atsu).toContain(`this.failuresConsumer.isActive(A320Failure.${failure})`);
    }
  });

  // The ids are the Rust failure ids of a320_systems_wasm (systems navigation/adirs.rs)
  it('lists the ADIRS failures in ATA 34 Navigation with the Rust failure they trigger', () => {
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    const expected: [number, string, string][] = [
      [34070, 'AdrFault(1)', 'ADR 1 (air data lost, FAULT light)'],
      [34072, 'AdrFault(3)', 'ADR 3 (air data lost, FAULT light)'],
      [34081, 'IrFault(2)', 'IR 2 (inertial data lost, FAULT light)'],
      [34090, 'AdrAirspeedErroneous(1)', 'ADR 1 airspeed erroneous (pitot)'],
      [34102, 'AdrAngleOfAttackErroneous(3)', 'ADR 3 angle of attack erroneous'],
      [34110, 'IrHeadingErroneous(1)', 'IR 1 heading erroneous'],
    ];
    for (const [id, failureType, name] of expected) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([34, id, name]);
      expect(wasm).toContain(
        `(${Math.floor(id / 1000)}_${String(id % 1000).padStart(3, '0')}, FailureType::${failureType}),`,
      );
    }
    const adirsFailures = A320FailureDefinitions.filter(([, id]) => id >= 34070 && id <= 34112);
    expect(adirsFailures.length).toBe(15);
  });
  // The labels say what a320_systems hydraulic/sfcc does with ids 27010-27013: the channel no longer drives its motor
  // (F/CTL FLAP(SLAT) SYS 1(2) FAULT, a320_fcom.txt l.83217-83247, l.84321-84341)
  it('lists the SFCC flap and slat channel failures in ATA 27 with the Rust failure they trigger', () => {
    const expected: [number, string, string][] = [
      [A320Failure.Sfcc1FlapChannel, 'SlatFlapControlComputerFlapChannel(1)', 'SFCC 1 flap channel'],
      [A320Failure.Sfcc2FlapChannel, 'SlatFlapControlComputerFlapChannel(2)', 'SFCC 2 flap channel'],
      [A320Failure.Sfcc1SlatChannel, 'SlatFlapControlComputerSlatChannel(1)', 'SFCC 1 slat channel'],
      [A320Failure.Sfcc2SlatChannel, 'SlatFlapControlComputerSlatChannel(2)', 'SFCC 2 slat channel'],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    for (const [id, rustFailure, label] of expected) {
      expect(entry(id)).toEqual([27, id, label]);
      expect(wasm).toContain(
        `(${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}, FailureType::${rustFailure}),`,
      );
    }
  });

  // The smoke and APU failures and the Rust failure each one triggers (systems fire_protection/smoke_detection.rs,
  // cargo_fire_extinguishing.rs, apu/electronic_control_box.rs), failure names audit rule
  it('lists the smoke failures in ATA 26 and the APU ECB failures in ATA 49 with the Rust failure they trigger', () => {
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8')
      .replace(/\s+/g, '')
      .replace(/,\)/g, ')');
    const expected: [number, string, string, number][] = [
      [26012, 'Smoke(SmokeDetectionZone::ForwardCargo)', 'Forward cargo smoke', 26],
      [26013, 'Smoke(SmokeDetectionZone::AftCargo)', 'Aft cargo smoke', 26],
      [26014, 'SmokeDetector(SmokeDetectionZone::ForwardCargo,1)', 'Forward cargo smoke detection loop 1', 26],
      [26015, 'SmokeDetector(SmokeDetectionZone::ForwardCargo,2)', 'Forward cargo smoke detection loop 2', 26],
      [26016, 'SmokeDetector(SmokeDetectionZone::AftCargo,1)', 'Aft cargo smoke detection loop 1', 26],
      [26017, 'SmokeDetector(SmokeDetectionZone::AftCargo,2)', 'Aft cargo smoke detection loop 2', 26],
      [26018, 'Smoke(SmokeDetectionZone::Avionics)', 'Avionics smoke (ventilation extract duct)', 26],
      [26019, 'SmokeDetector(SmokeDetectionZone::Avionics,1)', 'Avionics smoke detector', 26],
      [26020, 'CargoFireBottleLowPressure(1)', 'Cargo fire bottle low pressure', 26],
      [49000, 'ApuElectronicControlBox', 'APU electronic control box (ECB)', 49],
      [49001, 'ApuOverspeed', 'APU overspeed (automatic shutdown)', 49],
      [49002, 'ApuOilLowPressure', 'APU low oil pressure (automatic shutdown)', 49],
      [49003, 'ApuOilHighTemperature', 'APU high oil temperature (automatic shutdown)', 49],
      [49004, 'ApuAirIntakeFlapFailedClosed', 'APU air intake flap failed closed (automatic shutdown)', 49],
      [49005, 'ApuOilLevelLow', 'APU low oil level (advisory, APU keeps running)', 49],
    ];
    for (const [id, failureType, name, chapter] of expected) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, name]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId},FailureType::${failureType}),`);
    }
  });

  // FCOM gap batch T2-42: the ventilation and communication failures are TS only (the FWC Logic module reads them), the
  // FG TCAS mode failure is read by the C++ fbw module (failures/FailureList.h, FlyByWireInterface.cpp)
  it('lists the ventilation, FG TCAS mode and communication failures with the code that reads them', () => {
    const host = resolve(__dirname, '../../systems-host/systems/FWC/Logic');
    const ventilation = readFileSync(resolve(host, 'VentilationAlerts.ts'), 'utf8');
    const communication = readFileSync(resolve(host, 'CommunicationAlerts.ts'), 'utf8');
    const tcasMode = readFileSync(resolve(host, 'TcasModeFaultAlert.ts'), 'utf8');
    const expected: [number, number, string, string, string][] = [
      [21, 21020, 'AvionicsVentilationController', 'AEVC (avionics equipment ventilation controller)', ventilation],
      [21, 21021, 'AvionicsBlowerFan', 'Avionics ventilation blower fan', ventilation],
      [21, 21022, 'AvionicsExtractFan', 'Avionics ventilation extract fan', ventilation],
      [
        21,
        21023,
        'AvionicsSkinExtractValveStuckOpen',
        'Avionics ventilation skin extract valve stuck open',
        ventilation,
      ],
      [21, 21024, 'AvionicsSkinInletValveStuckOpen', 'Avionics ventilation skin inlet valve stuck open', ventilation],
      [21, 21025, 'AftCargoExtractionFan', 'AFT cargo ventilation extraction fan', ventilation],
      [
        21,
        21026,
        'AftCargoIsolationValvesStuckClosed',
        'AFT cargo ventilation isolation valves stuck closed',
        ventilation,
      ],
      [22, 22012, 'TcasModeFailure', 'FG TCAS mode (AP/FD TCAS, both FMGCs)', tcasMode],
      [23, 23008, 'CidsDirector1', 'CIDS 1 (cabin intercommunication data system)', communication],
      [23, 23009, 'CidsDirector2', 'CIDS 2 (cabin intercommunication data system)', communication],
      [23, 23017, 'CaptPttStuck', 'CAPT push-to-talk (PTT) switch stuck in transmit', communication],
      [23, 23018, 'FoPttStuck', 'F/O push-to-talk (PTT) switch stuck in transmit', communication],
      [23, 23020, 'Vhf1StuckEmitting', 'VHF 1 transmitter stuck emitting', communication],
      [23, 23021, 'Vhf2StuckEmitting', 'VHF 2 transmitter stuck emitting', communication],
      [23, 23022, 'Vhf3StuckEmitting', 'VHF 3 transmitter stuck emitting', communication],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const [chapter, id, key, name, consumer] of expected) {
      expect((A320Failure as Record<string, number>)[key]).toBe(id);
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, name]);
      expect(consumer).toContain(`A320Failure.${key}`);
      expect(wasm).not.toContain(`(${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')},`);
    }
    const fbw = resolve(__dirname, '../../../wasm/fbw_a320/src');
    expect(readFileSync(resolve(fbw, 'failures/FailureList.h'), 'utf8')).toContain('TcasMode = 22012,');
    expect(readFileSync(resolve(fbw, 'FlyByWireInterface.cpp'), 'utf8')).toContain(
      'failuresConsumer.isActive(Failures::TcasMode)',
    );
  });
});
