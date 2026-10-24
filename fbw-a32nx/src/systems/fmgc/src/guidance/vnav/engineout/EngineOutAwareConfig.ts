// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';

/**
 * The aircraft configuration of the vertical profile builders. They keep one reference for their lifetime, so the
 * engine model and the flight model are looked up at each access: with engines failed they are the ones of the
 * remaining engines, otherwise the nominal ones.
 * @param nominal the configuration with all engines
 * @param failedEngineConfig the configuration with failed engines, or null when all engines run
 */
export function engineOutAwareConfig(
  nominal: AircraftConfig,
  failedEngineConfig: () => AircraftConfig | null,
): AircraftConfig {
  return {
    lnavConfig: nominal.lnavConfig,
    vnavConfig: nominal.vnavConfig,
    fmSymbolConfig: nominal.fmSymbolConfig,
    fpmConfig: nominal.fpmConfig,
    get engineModelParameters() {
      return (failedEngineConfig() ?? nominal).engineModelParameters;
    },
    get flightModelParameters() {
      return (failedEngineConfig() ?? nominal).flightModelParameters;
    },
  };
}
