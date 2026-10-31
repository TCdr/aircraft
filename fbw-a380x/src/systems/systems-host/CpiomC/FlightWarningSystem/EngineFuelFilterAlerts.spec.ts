// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FadecEngineState } from './EngineFailAlerts';
import {
  EngineFuelFilterInputs,
  FUEL_FILTER_CLOGGED_LEVEL,
  FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
  engineFuelFilterClogged,
} from './EngineFuelFilterAlerts';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const running: EngineFuelFilterInputs = { masterOn: true, engineState: FadecEngineState.On, fuelFilterClogged: false };

describe('ENG FUEL FILTER CLOGGED', () => {
  it('triggers when the fuel filter of a running engine is clogged', () => {
    expect(engineFuelFilterClogged({ ...running, fuelFilterClogged: true })).toBe(true);
  });

  it('does not trigger without the failure, on an engine that does not run or with the ENG MASTER OFF', () => {
    expect(engineFuelFilterClogged(running)).toBe(false);
    expect(
      engineFuelFilterClogged({ ...running, fuelFilterClogged: true, engineState: FadecEngineState.Starting }),
    ).toBe(false);
    expect(engineFuelFilterClogged({ ...running, fuelFilterClogged: true, masterOn: false })).toBe(false);
  });

  it('is inhibited in phases 3 to 10', () => {
    expect(FUEL_FILTER_CLOGGED_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('FWS fuel filter alerts', () => {
  const { core, simVars } = createFws();

  /* The only indication is the ENGINE SD page (no aural, no MASTER CAUT) */
  it.each([1, 2, 3, 4])('ENG %d FUEL FILTER CLOGGED: amber, crew awareness, ENGINE SD page', (engine) => {
    const id = 701800033 + engine - 1;
    const entry = core.abnormalSensed.ewdAbnormalSensed[id];
    expect(entry.simVarIsActive).toBe(core.engineFuelFilterClogged[engine - 1]);
    expect(entry.flightPhaseInhib).toEqual(FUEL_FILTER_CLOGGED_PHASE_INHIBITION);
    expect(entry.failure).toBe(FUEL_FILTER_CLOGGED_LEVEL);
    expect(FUEL_FILTER_CLOGGED_LEVEL).toBe(1);
    expect(entry.sysPage).toBe(SdPages.Eng);
    expect(entry.whichItemsToShow()).toEqual([]);
    const message = EcamAbnormalProcedures[id];
    expect(message.title).toBe(`\x1b<4m\x1b4mENG\x1bm ${engine} FUEL FILTER CLOGGED`);
    expect(message.items).toEqual([]);
  });

  it('follows the clogged fuel filter simvar of a running engine', () => {
    core.bus.getPublisher<any>().pub('engine_master_3', true, true);
    simVars.set('L:A32NX_ENGINE_STATE:3', FadecEngineState.On);
    simVars.set('L:A32NX_ENGINE_3_FUEL_FILTER_CLOGGED', 1);
    runFwsCycle(core);
    expect(core.engineFuelFilterClogged.map((alert) => alert.get())).toEqual([false, false, true, false]);
    simVars.set('L:A32NX_ENGINE_3_FUEL_FILTER_CLOGGED', 0);
    runFwsCycle(core);
    expect(core.engineFuelFilterClogged[2].get()).toBe(false);
  });
});
