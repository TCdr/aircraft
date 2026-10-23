import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { antiIceIdleCn2Increase, antiIceStateChanged } from '@fmgc/guidance/vnav/descent/AntiIceIdle';
import { IdleDescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

const config = A320AircraftConfig;

function descentFrom(
  aircraftConfig: typeof A320AircraftConfig,
  engineAntiIce: boolean,
  wingAntiIce: boolean,
  initialAltitude = 30_000,
) {
  const parameters = { zeroFuelWeight: 140_000, tropoPause: 36_090, perfFactor: 0, engineAntiIce, wingAntiIce };
  const observer = { get: () => parameters } as unknown as VerticalProfileComputationParametersObserver;
  const strategy = new IdleDescentStrategy(observer, new AtmosphericConditions(observer), aircraftConfig);
  return strategy.predictToAltitude(initialAltitude, initialAltitude - 5000, 280, 0.78, 20_000, 0);
}

describe('antiIceIdleCn2Increase', () => {
  it('adds the engine and the wing share of the sensed anti-ice', () => {
    expect(antiIceIdleCn2Increase(config.vnavConfig, false, false)).toBe(0);
    expect(antiIceIdleCn2Increase(config.vnavConfig, true, false)).toBe(
      config.vnavConfig.ENGINE_ANTI_ICE_IDLE_CN2_INCREASE,
    );
    expect(antiIceIdleCn2Increase(config.vnavConfig, true, true)).toBe(
      config.vnavConfig.ENGINE_ANTI_ICE_IDLE_CN2_INCREASE + config.vnavConfig.WING_ANTI_ICE_IDLE_CN2_INCREASE,
    );
  });
});

describe('idle N1 with anti-ice', () => {
  it('is higher with a raised corrected core speed', () => {
    const params = config.engineModelParameters;
    expect(EngineModel.getIdleCorrectedN1(params, 20_000, 0.7, 36_090, 1.5)).toBeGreaterThan(
      EngineModel.getIdleCorrectedN1(params, 20_000, 0.7, 36_090),
    );
  });
});

describe.each([
  ['A320', A320AircraftConfig],
  ['A380', A380AircraftConfig],
])('%s idle descent prediction', (_name, aircraftConfig) => {
  it('descends flatter with engine anti-ice, flatter again with the wing anti-ice', () => {
    const off = descentFrom(aircraftConfig, false, false);
    const engine = descentFrom(aircraftConfig, true, false);
    const both = descentFrom(aircraftConfig, true, true);

    expect(engine.distanceTraveled).toBeGreaterThan(off.distanceTraveled);
    expect(both.distanceTraveled).toBeGreaterThan(engine.distanceTraveled);
    expect(engine.fuelBurned).toBeGreaterThan(off.fuelBurned);
  });
});

describe('antiIceStateChanged', () => {
  it('requests a new descent profile when the engine or the wing anti-ice switches', () => {
    const off = { engineAntiIce: false, wingAntiIce: false };
    expect(antiIceStateChanged(off, { ...off })).toBe(false);
    expect(antiIceStateChanged(off, { engineAntiIce: true, wingAntiIce: false })).toBe(true);
    expect(antiIceStateChanged(off, { engineAntiIce: false, wingAntiIce: true })).toBe(true);
  });
});
