// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { appendDriftDownPath } from '@fmgc/guidance/vnav/engineout/DriftDownProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { ProfilePhase, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParameters } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { a380EngineOut, A380EngineOutInputs } from './A380EngineOut';

const inputs = (overrides: Partial<A380EngineOutInputs> = {}): A380EngineOutInputs => ({
  grossWeight: 450,
  isaDeviation: 0,
  tropopause: 36_090,
  recMaxAltitude: 41_000,
  runningEngines: 3,
  cruiseFlightLevel: 380,
  cruiseMode: 'EO-LRC',
  costIndex: 30,
  ...overrides,
});

describe('a380EngineOut', () => {
  it('has an EO MAX near FL210 at 450 t, below the drift down altitude', () => {
    const { profile } = a380EngineOut(inputs());
    expect(profile.maximumAltitude).toBeGreaterThan(18_000);
    expect(profile.maximumAltitude).toBeLessThan(24_000);
    expect(profile.driftDownAltitude).toBeGreaterThan(profile.maximumAltitude);
  });

  it('lets a 338.7 t aircraft hold FL352 as the simulated one does, not the old 0.8 x REC MAX value', () => {
    const { profile } = a380EngineOut(inputs({ grossWeight: 338.7, isaDeviation: 14.8, recMaxAltitude: 42_000 }));
    expect(profile.maximumAltitude).toBeGreaterThan(35_200);
    expect(profile.maximumAltitude).toBeLessThan(40_000);
  });

  it('never goes above REC MAX', () => {
    const { profile } = a380EngineOut(inputs({ grossWeight: 300, recMaxAltitude: 31_000 }));
    expect(profile.maximumAltitude).toBeLessThanOrEqual(31_000);
  });

  it('lowers the EO MAX with a second failed engine', () => {
    const one = a380EngineOut(inputs({ runningEngines: 3 })).profile.maximumAltitude;
    const two = a380EngineOut(inputs({ runningEngines: 2 })).profile.maximumAltitude;
    expect(two).toBeLessThan(one);
  });

  it('flies green dot in the climb and a cruise Mach not below the green dot Mach', () => {
    const { speeds } = a380EngineOut(inputs({ costIndex: 100, cruiseFlightLevel: 180 }));
    expect(speeds.greenDotSpeed).toBeGreaterThan(200);
    expect(speeds.cruiseMach).toBeGreaterThan(speeds.greenDotMach - 0.01);
  });

  it('flies the current cost index in EO-ECON and cost index 65 in EO-LRC', () => {
    const economic = a380EngineOut(inputs({ cruiseMode: 'EO-ECON', costIndex: 200, cruiseFlightLevel: 150 }));
    const lrc = a380EngineOut(inputs({ cruiseMode: 'EO-LRC', costIndex: 200, cruiseFlightLevel: 150 }));
    expect(economic.speeds.cruiseMach).toBeGreaterThan(lrc.speeds.cruiseMach);
    expect(economic.econSpeeds.cruiseMach).toBe(economic.speeds.cruiseMach);
  });

  describe('drift down trigger', () => {
    const profileAt = (altitude: number): BaseGeometryProfile =>
      ({
        checkpoints: [
          {
            reason: VerticalCheckpointReason.PresentPosition,
            distanceFromStart: 0,
            secondsFromPresent: 0,
            altitude,
            remainingFuelOnBoard: 66_000,
            speed: 270,
            mach: 0.85,
            profilePhase: ProfilePhase.Cruise,
          },
        ],
        get lastCheckpoint() {
          return (this as unknown as BaseGeometryProfile).checkpoints.slice(-1)[0];
        },
        winds: { getClimbTailwind: () => 0 },
      }) as unknown as BaseGeometryProfile;

    const parameters = (maximumAltitude: number, driftDownAltitude: number, engineOutOverride = {}) => {
      const { profile } = a380EngineOut(inputs({ grossWeight: 338.7, isaDeviation: 14.8, recMaxAltitude: 42_000 }));
      return {
        cruiseAltitude: 34_000,
        tropoPause: 36_090,
        managedCruiseSpeed: 280,
        managedCruiseSpeedMach: 0.85,
        zeroFuelWeight: 680_000,
        engineOut: { ...profile, maximumAltitude, driftDownAltitude, ...engineOutOverride },
      } as unknown as VerticalProfileComputationParameters;
    };

    it('marks the drift down at FL352 with CRZ FL340 and EO MAX FL339, when FL352 is above the drift down altitude', () => {
      const profile = profileAt(35_238);
      appendDriftDownPath(profile, parameters(33_900, 35_000));
      expect(profile.checkpoints.some((c) => c.reason === VerticalCheckpointReason.DriftDown)).toBe(true);
      expect(profile.lastCheckpoint!.reason).toBe(VerticalCheckpointReason.DriftDownLevelOff);
      expect(profile.lastCheckpoint!.altitude).toBeCloseTo(33_900, -1);
    });

    it('does not mark it below the drift down altitude, but still descends to EO MAX', () => {
      const profile = profileAt(35_238);
      appendDriftDownPath(profile, parameters(33_900, 39_000));
      expect(profile.checkpoints.some((c) => c.reason === VerticalCheckpointReason.DriftDown)).toBe(false);
      expect(profile.lastCheckpoint!.altitude).toBeCloseTo(33_900, -1);
    });
  });
});
