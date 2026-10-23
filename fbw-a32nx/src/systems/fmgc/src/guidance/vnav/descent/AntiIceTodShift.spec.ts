import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { IdlePathBuilder } from '@fmgc/guidance/vnav/descent/IdlePathBuilder';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { ProfilePhase, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

/** Length of the idle path from 3000 ft up to FL370, NM */
function todLength(cfg: typeof A320AircraftConfig, zfw: number, mach: number, cas: number, e: boolean, w: boolean) {
  const parameters = {
    managedDescentSpeedMach: mach,
    descentSpeedLimit: { speed: 250, underAltitude: 10000 },
    zeroFuelWeight: zfw,
    tropoPause: 36_090,
    perfFactor: 0,
    engineAntiIce: e,
    wingAntiIce: w,
  };
  const observer = { get: () => parameters } as unknown as VerticalProfileComputationParametersObserver;
  const speedProfile = {
    getTarget: () => cas,
    shouldTakeDescentSpeedLimitIntoAccount: () => false,
  } as unknown as SpeedProfile;
  const profile = { winds: { getDescentTailwind: () => 0 } } as unknown as BaseGeometryProfile;
  const atm = new AtmosphericConditions(observer);
  const seq = new TemporaryCheckpointSequence({
    reason: VerticalCheckpointReason.GeometricPathStart,
    distanceFromStart: 600,
    altitude: 3000,
    secondsFromPresent: 3600,
    remainingFuelOnBoard: 10_000,
    speed: 250,
    mach: mach,
    profilePhase: ProfilePhase.Descent,
  });
  new IdlePathBuilder(observer, atm, cfg).buildIdlePath(profile, seq, [], speedProfile, 37_000);
  const c = seq.get();
  return { len: 600 - c.at(-1).distanceFromStart, secs: c.at(-1).secondsFromPresent, alt: c.at(-1).altitude };
}

// The shift of the idle path length (about 100 NM from FL370 to 3000 ft) stays small: about 2 NM for the engine anti-ice,
// about 5 NM with the wing anti-ice too
describe.each([
  ['A320', A320AircraftConfig, 140_000, 0.78],
  ['A380', A380AircraftConfig, 800_000, 0.85],
])('%s top of descent shift', (_name, cfg, zfw, mach) => {
  it('moves out by a few NM with the engine anti-ice and by more with the wing anti-ice', () => {
    const off = todLength(cfg, zfw, mach, 300, false, false).len;
    const engine = todLength(cfg, zfw, mach, 300, true, false).len - off;
    const both = todLength(cfg, zfw, mach, 300, true, true).len - off;

    expect(engine).toBeGreaterThan(1);
    expect(engine).toBeLessThan(4);
    expect(both).toBeGreaterThan(engine + 2);
    expect(both).toBeLessThan(8);
  });
});
