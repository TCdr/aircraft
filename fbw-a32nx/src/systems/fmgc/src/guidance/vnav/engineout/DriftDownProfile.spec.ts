// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { FlightModel } from '../FlightModel';
import { tonnesToPounds } from '../EconSpeeds';
import { BaseGeometryProfile } from '../profile/BaseGeometryProfile';
import { ProfilePhase, VerticalCheckpoint, VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { VerticalProfileComputationParameters } from '../VerticalProfileComputationParameters';
import { appendDriftDownPath } from './DriftDownProfile';
import { EngineOutPerformance } from './EngineOutPerformance';

const performance = new EngineOutPerformance({
  config: A320AircraftConfig,
  econ: A320EconParameters,
  greenDotSpeedAt: (altitude) => FlightModel.getGreenDotSpeedCas(altitude, 65_000),
  lrcCostIndex: null,
  windmillingDragFraction: 0.4,
});
const engineOut = performance.profileParameters({
  altitude: 0,
  weight: tonnesToPounds(65),
  isaDeviation: 0,
  headwind: 0,
  tropopause: 36_090,
});

const parameters = (withEngineOut: boolean) =>
  ({
    cruiseAltitude: 35_000,
    tropoPause: 36_090,
    managedCruiseSpeed: 280,
    managedCruiseSpeedMach: 0.78,
    zeroFuelWeight: tonnesToPounds(55),
    engineOut: withEngineOut ? engineOut : null,
  }) as VerticalProfileComputationParameters;

const profileAt = (altitude: number) => {
  const present: VerticalCheckpoint = {
    reason: VerticalCheckpointReason.PresentPosition,
    distanceFromStart: 100,
    secondsFromPresent: 0,
    altitude,
    remainingFuelOnBoard: tonnesToPounds(10),
    speed: 280,
    mach: 0.78,
    profilePhase: ProfilePhase.Cruise,
  };
  return {
    checkpoints: [present],
    get lastCheckpoint() {
      return this.checkpoints[this.checkpoints.length - 1];
    },
    winds: { getClimbTailwind: () => 0 },
  } as unknown as BaseGeometryProfile;
};

describe('appendDriftDownPath', () => {
  it('leaves the profile alone while all engines run', () => {
    const profile = profileAt(35_000);
    appendDriftDownPath(profile, parameters(false));
    expect(profile.checkpoints).toHaveLength(1);
  });

  it('continues the profile from the present position down to EO MAX', () => {
    const profile = profileAt(35_000);
    appendDriftDownPath(profile, parameters(true));

    expect(profile.checkpoints.length).toBeGreaterThan(3);
    const last = profile.lastCheckpoint!;
    expect(last.reason).toBe(VerticalCheckpointReason.DriftDownLevelOff);
    expect(last.altitude).toBeCloseTo(engineOut.maximumAltitude, -1);
    expect(last.distanceFromStart).toBeGreaterThan(100);
    expect(last.remainingFuelOnBoard).toBeLessThan(tonnesToPounds(10));
    expect(profile.checkpoints.some((c) => c.reason === VerticalCheckpointReason.DriftDown)).toBe(true);
  });

  it('adds nothing at EO MAX', () => {
    const profile = profileAt(engineOut.maximumAltitude);
    appendDriftDownPath(profile, parameters(true));
    expect(profile.checkpoints).toHaveLength(1);
  });
});
