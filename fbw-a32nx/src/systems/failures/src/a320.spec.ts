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
