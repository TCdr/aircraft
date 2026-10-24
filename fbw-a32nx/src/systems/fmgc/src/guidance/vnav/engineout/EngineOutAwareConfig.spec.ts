// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320AircraftConfig } from '@fmgc/flightplanning/A320AircraftConfig';
import { FlapConf } from '../common';
import { engineOutAwareConfig } from './EngineOutAwareConfig';
import { EngineOutPerformance } from './EngineOutPerformance';

describe('engineOutAwareConfig', () => {
  it('follows the failed engine configuration of the moment', () => {
    const failed = EngineOutPerformance.withFailedEngines(A320AircraftConfig, 1, 0.001);
    let current: typeof failed | null = null;
    const config = engineOutAwareConfig(A320AircraftConfig, () => current);

    expect(config.engineModelParameters.numberOfEngines).toBe(2);
    current = failed;
    expect(config.engineModelParameters.numberOfEngines).toBe(1);
    expect(config.flightModelParameters.dragPolarCoefficients[FlapConf.CLEAN][0]).toBeGreaterThan(
      A320AircraftConfig.flightModelParameters.dragPolarCoefficients[FlapConf.CLEAN][0],
    );
    current = null;
    expect(config.engineModelParameters.numberOfEngines).toBe(2);
    expect(config.vnavConfig).toBe(A320AircraftConfig.vnavConfig);
  });
});
