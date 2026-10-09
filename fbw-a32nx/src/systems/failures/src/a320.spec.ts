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

  // The labels say what systems engine/fuel_filter_failure.rs does with ids 73100-73101 (failure names audit rule)
  it('lists the engine fuel filter clog failures in ATA 73 with the Rust failure they trigger', () => {
    const label = (id: number) => A320FailureDefinitions.find(([, failureId]) => failureId === id);
    expect(label(A320Failure.Eng1FuelFilterClog)).toEqual([73, 73100, 'Engine 1 fuel filter clog']);
    expect(label(A320Failure.Eng2FuelFilterClog)).toEqual([73, 73101, 'Engine 2 fuel filter clog']);
    const wasm = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems_wasm/src/lib.rs'), 'utf8');
    expect(wasm).toContain('(73_100, FailureType::EngineFuelFilterClog(1)),');
    expect(wasm).toContain('(73_101, FailureType::EngineFuelFilterClog(2)),');
  });
});
