import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { IdlePathBuilder } from '@fmgc/guidance/vnav/descent/IdlePathBuilder';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { ProfilePhase, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

const DESCENT_MACH = 0.78;
const DESCENT_CAS = 300;

function buildIdlePath(startAltitude: Feet, startSpeed: Knots, topOfDescentAltitude: Feet) {
  const parameters = {
    managedDescentSpeedMach: DESCENT_MACH,
    descentSpeedLimit: { speed: 250, underAltitude: 10000 },
    zeroFuelWeight: 140_000,
    tropoPause: 36_090,
    perfFactor: 0,
  };
  const observer = { get: () => parameters } as unknown as VerticalProfileComputationParametersObserver;
  const speedProfile = {
    getTarget: () => DESCENT_CAS,
    shouldTakeDescentSpeedLimitIntoAccount: () => false,
  } as unknown as SpeedProfile;
  const profile = { winds: { getDescentTailwind: () => 0 } } as unknown as BaseGeometryProfile;
  const atmosphericConditions = new AtmosphericConditions(observer);

  const sequence = new TemporaryCheckpointSequence({
    reason: VerticalCheckpointReason.GeometricPathStart,
    distanceFromStart: 600,
    altitude: startAltitude,
    secondsFromPresent: 3600,
    remainingFuelOnBoard: 20_000,
    speed: startSpeed,
    mach: DESCENT_MACH,
    profilePhase: ProfilePhase.Descent,
  });

  new IdlePathBuilder(observer, atmosphericConditions, A320AircraftConfig).buildIdlePath(
    profile,
    sequence,
    [],
    speedProfile,
    topOfDescentAltitude,
  );

  return {
    checkpoints: sequence.get(),
    machAsCas: atmosphericConditions.computeCasFromMach(startAltitude, DESCENT_MACH),
  };
}

describe('IdlePathBuilder', () => {
  it('does not plan a speed change above the crossover altitude when the descent Mach already limits the speed', () => {
    const { checkpoints, machAsCas } = buildIdlePath(35_000, 280, 39_000);
    expect(machAsCas).toBeLessThan(280);

    const decelerationReasons = [
      VerticalCheckpointReason.StartDecelerationToConstraint,
      VerticalCheckpointReason.StartDecelerationToLimit,
    ];
    expect(checkpoints.filter((checkpoint) => decelerationReasons.includes(checkpoint.reason))).toEqual([]);
    expect(checkpoints.at(-1).reason).toBe(VerticalCheckpointReason.TopOfDescent);
    expect(checkpoints.at(-1).altitude).toBeCloseTo(39_000, 0);
    for (const checkpoint of checkpoints) {
      expect(Number.isFinite(checkpoint.distanceFromStart)).toBe(true);
      expect(Number.isFinite(checkpoint.remainingFuelOnBoard)).toBe(true);
    }
  });

  it('still plans the speed change below the crossover altitude', () => {
    const { checkpoints } = buildIdlePath(20_000, 280, 24_000);

    expect(
      checkpoints.some((checkpoint) => checkpoint.reason === VerticalCheckpointReason.StartDecelerationToConstraint),
    ).toBe(true);
  });
});
