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
});
