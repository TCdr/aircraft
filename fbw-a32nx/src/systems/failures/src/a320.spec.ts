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
  it('lists the tyre slow leak and burst failures in ATA 32 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.MainTyre1Deflated)).toEqual([32, 32300, 'Main wheel 1 tyre slow leak (left outer)']);
    expect(label(A320Failure.MainTyre4Deflated)).toEqual([32, 32303, 'Main wheel 4 tyre slow leak (right outer)']);
    expect(label(A320Failure.NoseTyreLeftDeflated)).toEqual([32, 32304, 'Nose wheel left tyre slow leak']);
    expect(label(A320Failure.NoseTyreRightDeflated)).toEqual([32, 32305, 'Nose wheel right tyre slow leak']);
    expect(label(A320Failure.MainTyre1Burst)).toEqual([32, 32306, 'Main wheel 1 tyre burst (left outer)']);
    expect(label(A320Failure.NoseTyreRightBurst)).toEqual([32, 32311, 'Nose wheel right tyre burst']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (let tyre = 1; tyre <= 6; tyre++) {
      expect(wasm).toContain(`(32_${299 + tyre}, FailureType::TyreDeflated(${tyre})),`);
      expect(wasm).toContain(`(32_${305 + tyre}, FailureType::TyreBurst(${tyre})),`);
    }
  });

  // The id is the Rust failure id of a320_systems_wasm, used by a320_systems cargo_ventilation.rs: the valves model
  // gives the FAULT light of the AFT ISOL VALVE pb-sw, which the FWC reads for COND AFT CRG ISOL VALVE
  it('lists the aft cargo isolation valves failure in ATA 21 with the Rust failure it triggers', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.AftCargoIsolationValvesStuckClosed)).toEqual([
      21,
      21026,
      'AFT cargo ventilation isolation valves stuck closed',
    ]);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(21_026, FailureType::AftCargoIsolationValvesStuckClosed),');
  });

  // TS only: the FWC reads it (FWC/Logic/PredictiveWindshearAlerts.ts), no Rust failure
  it('lists the predictive windshear failure of the weather radar in ATA 34', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.WxrPredictiveWindshear)).toEqual([34, 34120, 'Weather radar predictive windshear (PWS)']);
  });

  // TS only: the FWC reads them (FWC/Logic/NavSensorAlerts.ts), no Rust failure
  it('lists the ADS-B reporting and static probe failures in ATA 34', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.AdsbReporting1)).toEqual([34, 34052, 'ADS-B RPTG 1 (ADS-B out of ATC/XPDR 1)']);
    expect(label(A320Failure.AdsbReporting2)).toEqual([34, 34053, 'ADS-B RPTG 2 (ADS-B out of ATC/XPDR 2)']);
    expect(label(A320Failure.CaptLeftStaticProbe)).toEqual([34, 34170, 'CAPT left static probe']);
    expect(label(A320Failure.CaptRightStaticProbe)).toEqual([34, 34171, 'CAPT right static probe']);
    expect(label(A320Failure.FoLeftStaticProbe)).toEqual([34, 34172, 'F/O left static probe']);
    expect(label(A320Failure.FoRightStaticProbe)).toEqual([34, 34173, 'F/O right static probe']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const rustId of ['34_052', '34_053', '34_170', '34_171', '34_172', '34_173']) {
      expect(wasm).not.toContain(`(${rustId},`);
    }
  });

  // The systems host (Navigation/NavigationReceiverFailures.ts) applies them, the ILS ones also the Rust MMR shims
  it('lists the radio navigation receiver failures in ATA 34 with the Rust ILS receiver failures', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Vor1Receiver)).toEqual([34, 34130, 'VOR 1 receiver (no bearing)']);
    expect(label(A320Failure.Vor2Receiver)).toEqual([34, 34131, 'VOR 2 receiver (no bearing)']);
    expect(label(A320Failure.Dme1Receiver)).toEqual([34, 34140, 'DME 1 receiver (no distance)']);
    expect(label(A320Failure.Dme2Receiver)).toEqual([34, 34141, 'DME 2 receiver (no distance)']);
    expect(label(A320Failure.Adf1Receiver)).toEqual([34, 34150, 'ADF 1 receiver (no bearing)']);
    expect(label(A320Failure.Adf2Receiver)).toEqual([34, 34151, 'ADF 2 receiver (no bearing)']);
    expect(label(A320Failure.Ils1Receiver)).toEqual([34, 34160, 'ILS 1 receiver (no LOC/GS on PFD 1)']);
    expect(label(A320Failure.Ils2Receiver)).toEqual([34, 34161, 'ILS 2 receiver (no LOC/GS on PFD 2)']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(34_160, FailureType::IlsReceiver(1)),');
    expect(wasm).toContain('(34_161, FailureType::IlsReceiver(2)),');
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
    expect(label(A320Failure.Eng1Eiu)).toEqual([73, 73400, 'Engine 1 EIU']);
    expect(label(A320Failure.Eng2Eiu)).toEqual([73, 73401, 'Engine 2 EIU']);
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

  // The ATA 35 id is the Rust failure of a320_systems oxygen.rs, registered in a320_systems_wasm
  it('lists the crew oxygen bottle leak in ATA 35 with the Rust failure it triggers', () => {
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(entry(A320Failure.CrewOxygenBottleLeak)).toEqual([35, 35000, 'Crew oxygen bottle leak (100 PSI/min)']);
    expect(wasm).toContain('(35_000, FailureType::CockpitOxygenBottleLeak),');
  });

  // TS only: systems-host Doors/DoorFailures.ts publishes them for the DOOR cautions, the DOOR/OXY page and the CDLS
  // lights
  it('lists the door proximity sensor and cockpit door locking system failures in ATA 52', () => {
    const entry = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(entry(A320Failure.LeftForwardCabinDoorProximitySensor)).toEqual([
      52,
      52000,
      'L FWD cabin door proximity sensor (door shown not closed)',
    ]);
    expect(entry(A320Failure.AftCargoDoorProximitySensor)).toEqual([
      52,
      52007,
      'AFT cargo door proximity sensor (door shown not closed)',
    ]);
    expect(entry(A320Failure.CockpitDoorUpperLatch)).toEqual([52, 52100, 'Cockpit door upper latch (strike)']);
    expect(entry(A320Failure.CockpitDoorPressureSensor2)).toEqual([52, 52111, 'Cockpit door pressure sensor 2']);
    expect(entry(A320Failure.CockpitDoorControlUnit)).toEqual([52, 52120, 'Cockpit door control unit']);
    expect(entry(A320Failure.RightAftAvionicsDoorProximitySensor)).toEqual([
      52,
      52011,
      'R AFT avionics door proximity sensor (door shown not closed)',
    ]);
    expect(A320FailureDefinitions.filter(([chapter]) => chapter === 52)).toHaveLength(18);
  });

  // TS only failures: the FWC reads them for FUEL INERTING SYS FAULT and ENG TYPE DISAGREE, no wasm id maps them
  it('lists the fuel tank inerting system and engine rating plug failures, with no Rust failure behind them', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.FuelTankInertingSystem)).toEqual([
      28,
      28030,
      'Fuel tank inerting system (inert gas generation)',
    ]);
    expect(label(A320Failure.Eng1RatingPlug)).toEqual([73, 73320, 'Engine 1 rating plug (engine type disagree)']);
    expect(label(A320Failure.Eng2RatingPlug)).toEqual([73, 73321, 'Engine 2 rating plug (engine type disagree)']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const id of ['28_030', '73_320', '73_321']) {
      expect(wasm).not.toContain(`(${id},`);
    }
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
        'Engine 1 core sensors (PS3, T25, T3, N1, N2)',
      ],
      [
        73,
        A320Failure.Eng2Sensors,
        'EngineMonitoringFault(2,EngineMonitoringFaultKind::Sensors)',
        'Engine 2 core sensors (PS3, T25, T3, N1, N2)',
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
      // ENG FUEL CTL FAULT, FUEL RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE, BLEED STATUS FAULT, REV INHIBITED,
      // REV ISOL FAULT
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

  // The labels say what systems engine/engine_monitoring_fault.rs and the E/WD do with each id: an amber CHECK under the
  // indication, the engine runs as before
  it('lists the FADEC-DMC indication discrepancy failures in ATA 77 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8')
      .replace(/\s/g, '')
      .replace(/,\)/g, ')');
    const parameters: [string, string, string, number][] = [
      ['N1', 'N1Discrepancy', 'N1', 77020],
      ['N2', 'N2Discrepancy', 'N2', 77030],
      ['Egt', 'EgtDiscrepancy', 'EGT', 77040],
      ['FuelFlow', 'FuelFlowDiscrepancy', 'fuel flow', 77050],
    ];
    for (const [name, rustKind, text, firstId] of parameters) {
      for (const engine of [1, 2]) {
        const id = A320Failure[`Eng${engine}${name}Discrepancy` as keyof typeof A320Failure];
        expect(id).toBe(firstId + engine - 1);
        expect(label(id)).toEqual([77, id, `Engine ${engine} ${text} indication discrepancy (FADEC-DMC)`]);
        const rustId = `${Math.floor(id / 1000)}_${String(id % 1000).padStart(3, '0')}`;
        expect(wasm).toContain(
          `(${rustId},FailureType::EngineMonitoringFault(${engine},EngineMonitoringFaultKind::${rustKind}))`,
        );
      }
    }
  });

  // TS only failures: the systems-host reads them (FWC Logic/EngineFadecFaultAlerts,
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

  // TS only failures: the systems-host ATSU (atsu.ts) writes them for the DCDU, its
  // screens and the MCDU print
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
      [34103, 'AdrAngleOfAttackSensorFault(1)', 'CAPT AOA sensor (ADR 1 angle of attack lost)'],
      [34104, 'AdrAngleOfAttackSensorFault(2)', 'F/O AOA sensor (ADR 2 angle of attack lost)'],
      [34105, 'AdrAngleOfAttackSensorFault(3)', 'STBY AOA sensor (ADR 3 angle of attack lost)'],
      [34113, 'IrPitchErroneous(1)', 'IR 1 pitch erroneous'],
      [34115, 'IrPitchErroneous(3)', 'IR 3 pitch erroneous'],
    ];
    for (const [id, failureType, name] of expected) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([34, id, name]);
      expect(wasm).toContain(
        `(${Math.floor(id / 1000)}_${String(id % 1000).padStart(3, '0')}, FailureType::${failureType}),`,
      );
    }
    const adirsFailures = A320FailureDefinitions.filter(([, id]) => id >= 34070 && id <= 34115);
    expect(adirsFailures.length).toBe(21);
  });
  // The labels say what a320_systems hydraulic/sfcc does with ids 27010-27013: the channel no longer drives its motor
  // (F/CTL FLAP(SLAT) SYS 1(2) FAULT)
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

  // The ventilation and communication failures are TS only (the FWC Logic module reads them), the FG TCAS mode failure
  // is read by the C++ fbw module (failures/FailureList.h, FlyByWireInterface.cpp)
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
      // 21026 (AFT cargo isolation valves stuck closed) is a Rust failure: see the ATA 21 test above
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

  // F/CTL: the Rust slat/flap transmission failures (a320_systems hydraulic/sfcc wing tip brakes), the failures the
  // fbw_a320 module applies to the ELAC and SEC inputs, and the SFCC part failures the FWC reads
  // (Logic/SlatFlapLockAlerts)
  it('lists the slat, flap, sidestick and stabilizer failures in ATA 27 with the code that consumes them', () => {
    const definition = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(definition(A320Failure.FlapTransmissionAsymmetry)).toEqual([27, 27014, 'Flap transmission asymmetry']);
    expect(definition(A320Failure.SlatTransmissionAsymmetry)).toEqual([27, 27015, 'Slat transmission asymmetry']);
    expect(definition(A320Failure.FlapWingTipBrake)).toEqual([27, 27016, 'Flap wing tip brake']);
    expect(definition(A320Failure.SlatWingTipBrake)).toEqual([27, 27017, 'Slat wing tip brake']);
    expect(definition(A320Failure.FlapAttachmentSensor)).toEqual([27, 27018, 'Flap attachment sensor']);
    expect(definition(A320Failure.CaptSidestick)).toEqual([27, 27019, 'CAPT sidestick transducers']);
    expect(definition(A320Failure.FoSidestick)).toEqual([27, 27020, 'F/O sidestick transducers']);
    expect(definition(A320Failure.SidestickPriorityLogic)).toEqual([27, 27021, 'Sidestick priority logic']);
    expect(definition(A320Failure.StabilizerElecControl)).toEqual([27, 27022, 'Stabilizer electrical control']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(27_014, FailureType::FlapTransmissionAsymmetry),');
    expect(wasm).toContain('(27_015, FailureType::SlatTransmissionAsymmetry),');
    const failureList = readFileSync(resolve(__dirname, '../../../wasm/fbw_a320/src/failures/FailureList.h'), 'utf8');
    expect(failureList).toContain('CaptSidestick = 27019,');
    expect(failureList).toContain('FoSidestick = 27020,');
    expect(failureList).toContain('SidestickPriorityLogic = 27021,');
    expect(failureList).toContain('StabilizerElecControl = 27022,');
  });

  // The FWC alerts of these failures: F/CTL SPD BRK 2 (3+4) FAULT, SPD BRK FAULT, GND SPLR 5 / 1+2 / 3+4 FAULT
  it('lists the speed brake lever and ground spoiler failures in ATA 27 with the code that consumes them', () => {
    const definition = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(definition(A320Failure.SpeedBrakeLeverSec1)).toEqual([27, 27023, 'Speed brake lever transducers SEC 1']);
    expect(definition(A320Failure.SpeedBrakeLeverSec3)).toEqual([27, 27024, 'Speed brake lever transducers SEC 3']);
    expect(definition(A320Failure.GroundSpoilerFunctionSec1)).toEqual([27, 27025, 'SEC 1 ground spoiler function']);
    expect(definition(A320Failure.GroundSpoilerFunctionSec2)).toEqual([27, 27026, 'SEC 2 ground spoiler function']);
    expect(definition(A320Failure.GroundSpoilerFunctionSec3)).toEqual([27, 27027, 'SEC 3 ground spoiler function']);
    const failureList = readFileSync(resolve(__dirname, '../../../wasm/fbw_a320/src/failures/FailureList.h'), 'utf8');
    for (const entry of [
      'SpeedBrakeLeverSec1 = 27023,',
      'SpeedBrakeLeverSec3 = 27024,',
      'GroundSpoilerFunctionSec1 = 27025,',
      'GroundSpoilerFunctionSec2 = 27026,',
      'GroundSpoilerFunctionSec3 = 27027,',
    ]) {
      expect(failureList).toContain(entry);
    }
  });

  // The FWC alerts of these failures: BRAKES RELEASED, BRAKES ALTN L(R) RELEASED, BRAKES-N/WS MINOR FAULT and
  // L/G SHOCK ABSORBER FAULT
  it('lists the brake release, steering pedal and shock absorber failures in ATA 32 with their Rust failure', () => {
    const expected: [number, number, string, string][] = [
      [
        A320Failure.MainWheel1BrakeReleased,
        32230,
        'Main wheel 1 brake released (left outer)',
        'MainWheelBrakeReleased(1)',
      ],
      [
        A320Failure.MainWheel2BrakeReleased,
        32231,
        'Main wheel 2 brake released (left inner)',
        'MainWheelBrakeReleased(2)',
      ],
      [
        A320Failure.MainWheel3BrakeReleased,
        32232,
        'Main wheel 3 brake released (right inner)',
        'MainWheelBrakeReleased(3)',
      ],
      [
        A320Failure.MainWheel4BrakeReleased,
        32233,
        'Main wheel 4 brake released (right outer)',
        'MainWheelBrakeReleased(4)',
      ],
      [
        A320Failure.AlternateBrakeLeftReleased,
        32240,
        'Alternate braking left gear released',
        'AlternateGearBrakeReleased(1)',
      ],
      [
        A320Failure.AlternateBrakeRightReleased,
        32241,
        'Alternate braking right gear released',
        'AlternateGearBrakeReleased(2)',
      ],
      [
        A320Failure.NoseWheelSteeringPedalOrders,
        32250,
        'Nose wheel steering rudder pedal orders',
        'NoseWheelSteeringPedalOrders',
      ],
      [
        A320Failure.LeftShockAbsorberStuckExtended,
        32260,
        'Main left gear shock absorber detectors stuck extended',
        'ShockAbsorberStuckExtended(1)',
      ],
      [
        A320Failure.RightShockAbsorberStuckExtended,
        32261,
        'Main right gear shock absorber detectors stuck extended',
        'ShockAbsorberStuckExtended(2)',
      ],
      [
        A320Failure.NoseShockAbsorberStuckExtended,
        32262,
        'Nose gear shock absorber detectors stuck extended',
        'ShockAbsorberStuckExtended(3)',
      ],
      [
        A320Failure.LeftShockAbsorberStuckCompressed,
        32263,
        'Main left gear shock absorber detectors stuck compressed',
        'ShockAbsorberStuckCompressed(1)',
      ],
      [
        A320Failure.RightShockAbsorberStuckCompressed,
        32264,
        'Main right gear shock absorber detectors stuck compressed',
        'ShockAbsorberStuckCompressed(2)',
      ],
      [
        A320Failure.NoseShockAbsorberStuckCompressed,
        32265,
        'Nose gear shock absorber detectors stuck compressed',
        'ShockAbsorberStuckCompressed(3)',
      ],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const [id, number, name, rustFailure] of expected) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([32, number, name]);
      expect(wasm).toContain(`(32_${String(number).slice(2)}, FailureType::${rustFailure}),`);
    }
  });

  // The FWC alerts of these failures: AIR PACK 1(2) OVHT and REGUL FAULT, SMOKE LAVATORY SMOKE / DET FAULT and SMOKE DET
  // FAULT, WING A.ICE L(R) VALVE OPEN and OPEN ON GND, L/G GEAR UPLOCK FAULT, BRAKES PARK BRK FAULT
  it('lists the pack, smoke detection, wing anti-ice, uplock and parking brake failures with their Rust failure', () => {
    const expected: [number, number, string, string, string][] = [
      [21, 21027, 'Pack1Overheat', 'PackOverheat(1)', 'Pack 1 overheat (compressor outlet)'],
      [21, 21028, 'Pack2Overheat', 'PackOverheat(2)', 'Pack 2 overheat (compressor outlet)'],
      [21, 21029, 'Pack1Regulation', 'PackRegulation(1)', 'Pack 1 temperature regulation (bypass valve)'],
      [21, 21030, 'Pack2Regulation', 'PackRegulation(2)', 'Pack 2 temperature regulation (bypass valve)'],
      [26, 26021, 'LavatorySmoke', 'Smoke(SmokeDetectionZone::Lavatory)', 'Lavatory smoke'],
      [26, 26022, 'LavatorySmokeDetector', 'SmokeDetector(SmokeDetectionZone::Lavatory,1)', 'Lavatory smoke detector'],
      [
        26,
        26023,
        'SmokeDetectionControlUnitChannel1',
        'SmokeDetectionControlUnitChannel(1)',
        'SDCU channel 1 (smoke detection)',
      ],
      [
        26,
        26024,
        'SmokeDetectionControlUnitChannel2',
        'SmokeDetectionControlUnitChannel(2)',
        'SDCU channel 2 (smoke detection)',
      ],
      [
        30,
        30020,
        'LeftWingAntiIceValveStuckOpen',
        'WingAntiIceValveStuckOpen(1)',
        'Left wing anti-ice valve stuck open',
      ],
      [
        30,
        30021,
        'RightWingAntiIceValveStuckOpen',
        'WingAntiIceValveStuckOpen(2)',
        'Right wing anti-ice valve stuck open',
      ],
      [
        32,
        32030,
        'GearUplockStuckLockedNose',
        'GearUplockStuckLocked(GearActuatorId::GearNose)',
        'Nose gear uplock stuck locked',
      ],
      [
        32,
        32031,
        'GearUplockStuckLockedLeft',
        'GearUplockStuckLocked(GearActuatorId::GearLeft)',
        'Main left gear uplock stuck locked',
      ],
      [
        32,
        32032,
        'GearUplockStuckLockedRight',
        'GearUplockStuckLocked(GearActuatorId::GearRight)',
        'Main right gear uplock stuck locked',
      ],
      [32, 32220, 'ParkingBrakeValveJammed', 'ParkingBrakeValveJammed', 'Parking brake valve jammed'],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8')
      .replace(/\s/g, '')
      .replace(/,\)/g, ')');
    for (const [chapter, id, key, rustFailure, label] of expected) {
      expect((A320Failure as Record<string, number>)[key]).toBe(id);
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, label]);
      const rustId = `${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')}`;
      expect(wasm).toContain(`(${rustId},FailureType::${rustFailure})`);
    }
  });

  // The Rust fuel recirculation control takes the command away (fuel/fuel_recirculation.rs), the FWC reads it for
  // FUEL IDG 1(2) COOL FAULT
  it('lists the IDG fuel cooling failures with the Rust failure they trigger and the FWC module that reads them', () => {
    const host = resolve(__dirname, '../../systems-host/systems/FWC/Logic');
    const idgCooling = readFileSync(resolve(host, 'IdgCoolingAlerts.ts'), 'utf8');
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const [id, key, name, engine] of [
      [28018, 'Idg1FuelCoolingCommand', 'IDG 1 fuel cooling (fuel recirculation command)', 1],
      [28019, 'Idg2FuelCoolingCommand', 'IDG 2 fuel cooling (fuel recirculation command)', 2],
    ] as [number, string, string, number][]) {
      expect((A320Failure as Record<string, number>)[key]).toBe(id);
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([28, id, name]);
      expect(idgCooling).toContain(`A320Failure.${key}`);
      expect(wasm).toContain(`(28_0${id % 100}, FailureType::FuelRecirculationCommand(${engine})),`);
    }
  });

  // TS only failures, read by the FWC: EIS DMC 1(2)(3) FAULT, EIS DMC/FWC COM FAULT,
  // FWS SDAC 1(2) / 1+2 FAULT, RECORDER DFDR FAULT and RECORDER SYS FAULT
  it('lists the DMC, SDAC and recorder failures, TS only, with the FWC module that reads them', () => {
    const host = resolve(__dirname, '../../systems-host/systems/FWC/Logic');
    const eisRecorder = readFileSync(resolve(host, 'EisRecorderAlerts.ts'), 'utf8');
    const expected: [number, number, string, string, string][] = [
      [31, 31009, 'Dmc1', 'DMC 1', eisRecorder],
      [31, 31010, 'Dmc2', 'DMC 2', eisRecorder],
      [31, 31011, 'Dmc3', 'DMC 3', eisRecorder],
      [31, 31012, 'DmcFwcBuses', 'DMC to FWC data buses', eisRecorder],
      [31, 31013, 'Sdac1', 'SDAC 1', eisRecorder],
      [31, 31014, 'Sdac2', 'SDAC 2', eisRecorder],
      [31, 31015, 'Dfdr', 'DFDR (flight data recorder)', eisRecorder],
      [31, 31016, 'Fdiu', 'FDIU (recorder system)', eisRecorder],
    ];
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    for (const [chapter, id, key, name, consumer] of expected) {
      expect((A320Failure as Record<string, number>)[key]).toBe(id);
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)).toEqual([chapter, id, name]);
      expect(consumer).toContain(`A320Failure.${key}`);
      expect(wasm).not.toContain(`(${Math.floor(id / 1000)}_${(id % 1000).toString().padStart(3, '0')},`);
    }
  });
});
