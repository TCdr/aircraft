// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

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
});
