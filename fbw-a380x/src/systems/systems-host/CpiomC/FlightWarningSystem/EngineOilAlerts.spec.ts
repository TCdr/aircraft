// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FadecEngineState } from './EngineFailAlerts';
import {
  EngineOilInputs,
  engineOilAlerts,
  OIL_FILTER_CLOGGED_LEVEL,
  OIL_FILTER_CLOGGED_PHASE_INHIBITION,
  OIL_PRESS_LO_PHASE_INHIBITION,
  OIL_TEMP_HI_PHASE_INHIBITION,
} from './EngineOilAlerts';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const running: EngineOilInputs = {
  masterOn: true,
  engineState: FadecEngineState.On,
  oilPressurePsi: 60,
  oilTemperatureCelsius: 90,
  oilFilterClogged: false,
};

describe('ENG OIL PRESS LO', () => {
  it('triggers below 25 PSI', () => {
    expect(engineOilAlerts({ ...running, oilPressurePsi: 24.9 }).pressureLow).toBe(true);
    expect(engineOilAlerts({ ...running, oilPressurePsi: 25 }).pressureLow).toBe(false);
  });

  it('is not monitored on an engine that is not running, nor after the ENG MASTER OFF of its procedure', () => {
    expect(engineOilAlerts({ ...running, engineState: FadecEngineState.Shutting, oilPressurePsi: 0 }).pressureLow).toBe(
      false,
    );
    expect(engineOilAlerts({ ...running, engineState: FadecEngineState.Starting, oilPressurePsi: 5 }).pressureLow).toBe(
      false,
    );
    expect(engineOilAlerts({ ...running, masterOn: false, oilPressurePsi: 5 }).pressureLow).toBe(false);
  });
});

describe('ENG OIL TEMP HI', () => {
  it('triggers above 196 °C', () => {
    expect(engineOilAlerts({ ...running, oilTemperatureCelsius: 197 }).temperatureHigh).toBe(true);
    expect(engineOilAlerts({ ...running, oilTemperatureCelsius: 196 }).temperatureHigh).toBe(false);
  });

  it('ends with the ENG MASTER OFF', () => {
    expect(engineOilAlerts({ ...running, masterOn: false, oilTemperatureCelsius: 210 }).temperatureHigh).toBe(false);
  });
});

/* The oil filter of the feed line or of the return line is clogged */
describe('ENG OIL FILTER CLOGGED', () => {
  it('triggers with a clogged filter on a running engine only', () => {
    expect(engineOilAlerts({ ...running, oilFilterClogged: true }).filterClogged).toBe(true);
    expect(
      engineOilAlerts({ ...running, engineState: FadecEngineState.Off, oilFilterClogged: true }).filterClogged,
    ).toBe(false);
    expect(engineOilAlerts(running).filterClogged).toBe(false);
  });
});

describe('FWS oil alerts', () => {
  const { core, simVars } = createFws();
  const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];

  it.each([1, 2, 3, 4])(
    'ENG %d OIL PRESS LO: red warning, inhibited in phases 1, 5, 6 and 12, THR LEVER IDLE, MASTER OFF',
    (engine) => {
      const id = 701800085 + engine - 1;
      const entry = sensed(id);
      expect(entry.simVarIsActive).toBe(core.engineOilPressLo[engine - 1]);
      expect(entry.flightPhaseInhib).toEqual(OIL_PRESS_LO_PHASE_INHIBITION);
      expect(entry.failure).toBe(3);
      expect(entry.sysPage).toBe(SdPages.Eng);
      expect(entry.whichItemsToShow()).toEqual([true, true]);
      const thrustLeverIdle = (core as any)[`thrustLever${engine}Idle`].get();
      const masterOn = (core as any)[`engine${engine}Master`].get();
      expect(entry.whichItemsChecked()).toEqual([thrustLeverIdle, !masterOn]);
      const message = EcamAbnormalProcedures[id];
      // red title
      expect(message.title).toBe(`\x1b<2m\x1b4mENG\x1bm ${engine} OIL PRESS LO`);
      expect(message.items).toEqual([
        { name: `THR LEVER ${engine}`, sensed: true, labelNotCompleted: 'IDLE' },
        { name: `ENG ${engine} MASTER`, sensed: true, labelNotCompleted: 'OFF' },
      ]);
    },
  );

  it.each([1, 2, 3, 4])('ENG %d OIL TEMP HI: amber, THR LEVER REDUCE, IF HI TEMP PERSISTS MASTER OFF', (engine) => {
    const id = 701800093 + engine - 1;
    const entry = sensed(id);
    expect(entry.simVarIsActive).toBe(core.engineOilTempHi[engine - 1]);
    expect(entry.flightPhaseInhib).toEqual(OIL_TEMP_HI_PHASE_INHIBITION);
    expect(entry.failure).toBe(2);
    expect(entry.whichItemsToShow()).toEqual([true, true, true]);
    const message = EcamAbnormalProcedures[id];
    expect(message.title).toBe(`\x1b<4m\x1b4mENG\x1bm ${engine} OIL TEMP HI`);
    const items = message.items as any[];
    expect(items).toHaveLength(3);
    expect(items[2]).toEqual({ name: `ENG ${engine} MASTER`, sensed: true, labelNotCompleted: 'OFF', level: 1 });
    // the line fits the 39 characters of the WD (WdAbnormalNonSensed / ProcedureLinesGenerator)
    expect(items[0].name.length + items[0].labelNotCompleted.length + 2).toBeLessThanOrEqual(39);
  });

  /* The only indication is the ENGINE SD page (no aural, no MASTER CAUT) */
  it.each([1, 2, 3, 4])('ENG %d OIL FILTER CLOGGED: amber, crew awareness, inhibited in phases 3 to 10', (engine) => {
    const id = 701800081 + engine - 1;
    const entry = sensed(id);
    expect(entry.simVarIsActive).toBe(core.engineOilFilterClogged[engine - 1]);
    expect(entry.flightPhaseInhib).toEqual(OIL_FILTER_CLOGGED_PHASE_INHIBITION);
    expect(entry.failure).toBe(OIL_FILTER_CLOGGED_LEVEL);
    expect(entry.sysPage).toBe(SdPages.Eng);
    expect(OIL_FILTER_CLOGGED_LEVEL).toBe(1);
    expect(EcamAbnormalProcedures[id].items).toEqual([]);
  });

  it('follows the FADEC oil pressure, temperature and the clogged filter of a running engine', () => {
    core.bus.getPublisher<any>().pub('engine_master_2', true, true);
    simVars.set('L:A32NX_ENGINE_STATE:2', FadecEngineState.On);
    simVars.set('GENERAL ENG OIL PRESSURE:2', 10);
    simVars.set('GENERAL ENG OIL TEMPERATURE:2', 200);
    simVars.set('L:A32NX_ENGINE_2_OIL_FILTER_CLOGGED', 1);
    runFwsCycle(core);
    expect(core.engineOilPressLo.map((a) => a.get())).toEqual([false, true, false, false]);
    expect(core.engineOilTempHi.map((a) => a.get())).toEqual([false, true, false, false]);
    expect(core.engineOilFilterClogged.map((a) => a.get())).toEqual([false, true, false, false]);
  });
});
