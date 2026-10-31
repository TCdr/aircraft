// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import { FadecEngineState } from './EngineFailAlerts';
import {
  OIL_TEMP_LO_PHASE_INHIBITION,
  OilTemperatureLowInputs,
  OilTemperatureLowMonitor,
  THR_LEVERS_NOT_SET_PHASE_INHIBITION,
  isFlexTakeoffMode,
  isThrustLeversNotSet,
  thrLeversNotSetItemsShown,
} from './EngineTakeoffAlerts';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const coldRunning: OilTemperatureLowInputs = {
  onGround: true,
  engineState: FadecEngineState.On,
  oilTemperatureCelsius: 40,
  toConfigPressed: false,
  takeoffPowerSet: false,
};

/** A monitor after the given number of 1 s frames with the same inputs */
function oilMonitorAfter(seconds: number, inputs: OilTemperatureLowInputs, monitor = new OilTemperatureLowMonitor()) {
  for (let i = 0; i < seconds; i++) {
    monitor.update(inputs, 1000);
  }
  return monitor;
}

describe('ENG OIL TEMP LO', () => {
  it('triggers on ground below 50 °C once the engine has run for 30 s', () => {
    expect(oilMonitorAfter(29, coldRunning).isActive).toBe(false);
    expect(oilMonitorAfter(30, coldRunning).isActive).toBe(true);
  });

  it('triggers earlier after a T.O CONFIG press or with the take-off power set', () => {
    const pressed = oilMonitorAfter(1, { ...coldRunning, toConfigPressed: true });
    expect(pressed.isActive).toBe(true);
    // the press is remembered after the pb is released
    expect(oilMonitorAfter(1, coldRunning, pressed).isActive).toBe(true);
    expect(oilMonitorAfter(1, { ...coldRunning, takeoffPowerSet: true }).isActive).toBe(true);
  });

  it('does not trigger at or above 50 °C, in flight, or on an engine that does not run', () => {
    expect(oilMonitorAfter(60, { ...coldRunning, oilTemperatureCelsius: 50 }).isActive).toBe(false);
    expect(oilMonitorAfter(60, { ...coldRunning, onGround: false }).isActive).toBe(false);
    expect(oilMonitorAfter(60, { ...coldRunning, engineState: FadecEngineState.Starting }).isActive).toBe(false);
  });

  it('restarts the 30 s and forgets the T.O CONFIG press when the engine stops', () => {
    const monitor = oilMonitorAfter(60, { ...coldRunning, toConfigPressed: true });
    oilMonitorAfter(1, { ...coldRunning, engineState: FadecEngineState.Off }, monitor);
    expect(oilMonitorAfter(10, coldRunning, monitor).isActive).toBe(false);
  });

  it('is shown in phases 2 and 3 only', () => {
    expect(OIL_TEMP_LO_PHASE_INHIBITION).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

const allRunning = [1, 2, 3, 4].map(() => FadecEngineState.On);

describe('ENG THR LEVERS NOT SET', () => {
  it('triggers with one lever at or between CL and FLX/MCT', () => {
    for (const flexTakeoffMode of [true, false]) {
      expect(isThrustLeversNotSet({ tlaDegrees: [35, 35, 30, 35], engineStates: allRunning, flexTakeoffMode })).toBe(
        true,
      );
      expect(isThrustLeversNotSet({ tlaDegrees: [45, 25, 45, 45], engineStates: allRunning, flexTakeoffMode })).toBe(
        true,
      );
    }
  });

  it('triggers with the levers at FLX/MCT when the FADECs are in TOGA mode only', () => {
    const atFlx = [35, 35, 35, 35];
    expect(isThrustLeversNotSet({ tlaDegrees: atFlx, engineStates: allRunning, flexTakeoffMode: false })).toBe(true);
    expect(isThrustLeversNotSet({ tlaDegrees: atFlx, engineStates: allRunning, flexTakeoffMode: true })).toBe(false);
  });

  it('does not trigger with the levers set, at idle, or for the lever of an engine that does not run', () => {
    expect(
      isThrustLeversNotSet({ tlaDegrees: [45, 45, 45, 45], engineStates: allRunning, flexTakeoffMode: false }),
    ).toBe(false);
    expect(
      isThrustLeversNotSet({ tlaDegrees: [45, 45, 45, 45], engineStates: allRunning, flexTakeoffMode: true }),
    ).toBe(false);
    expect(isThrustLeversNotSet({ tlaDegrees: [0, 0, 0, 0], engineStates: allRunning, flexTakeoffMode: false })).toBe(
      false,
    );
    const engine2Off = [FadecEngineState.On, FadecEngineState.Off, FadecEngineState.On, FadecEngineState.On];
    expect(
      isThrustLeversNotSet({ tlaDegrees: [35, 30, 35, 35], engineStates: engine2Off, flexTakeoffMode: true }),
    ).toBe(false);
  });

  // A derated takeoff asks for THR LEVERS MCT/FLEX, like a FLEX takeoff: TOGA thrust is not allowed with a derate
  it('takes the derated takeoff: levers at FLX/MCT are set, levers at TOGA are not', () => {
    const derated = { engineStates: allRunning, flexTakeoffMode: false, derateTakeoffMode: true };
    expect(isThrustLeversNotSet({ ...derated, tlaDegrees: [35, 35, 35, 35] })).toBe(false);
    expect(isThrustLeversNotSet({ ...derated, tlaDegrees: [45, 45, 45, 45] })).toBe(true);
    expect(isThrustLeversNotSet({ ...derated, tlaDegrees: [35, 35, 45, 35] })).toBe(true);
    expect(isThrustLeversNotSet({ ...derated, tlaDegrees: [35, 30, 35, 35] })).toBe(true);
    expect(thrLeversNotSetItemsShown(true)).toEqual([false, true]);
  });

  it('takes the FADEC take-off mode: FLEX with a FLEX TEMP above the TAT, otherwise TOGA', () => {
    expect(isFlexTakeoffMode(50, 15)).toBe(true);
    expect(isFlexTakeoffMode(0, 15)).toBe(false);
    expect(isFlexTakeoffMode(10, 15)).toBe(false);
    // a 0 °C FLEX TEMP is written as 0.1 by the FMS
    expect(isFlexTakeoffMode(0.1, -5)).toBe(true);
  });

  it('shows ALL THR LEVERS TOGA in TOGA mode and THR LEVERS MCT/FLEX in FLEX mode', () => {
    expect(thrLeversNotSetItemsShown(false)).toEqual([true, false]);
    expect(thrLeversNotSetItemsShown(true)).toEqual([false, true]);
  });

  it('is shown in phases 2 and 3 only', () => {
    expect(THR_LEVERS_NOT_SET_PHASE_INHIBITION).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('FWS take-off engine alerts', () => {
  const { core, simVars } = createFws();
  const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];

  it.each([1, 2, 3, 4])('ENG %d OIL TEMP LO: amber, ENGINE SD page, THR LEVER IDLE and DELAY T.O', (engine) => {
    const id = 701800097 + engine - 1;
    const entry = sensed(id);
    expect(entry.simVarIsActive).toBe(core.engineOilTempLo[engine - 1]);
    expect(entry.flightPhaseInhib).toEqual(OIL_TEMP_LO_PHASE_INHIBITION);
    expect(entry.whichItemsChecked()).toEqual([(core as any)[`thrustLever${engine}Idle`].get(), false]);
    expect(entry.failure).toBe(2);
    expect(entry.sysPage).toBe(SdPages.Eng);
    const items = EcamAbnormalProcedures[id].items;
    expect(items).toContainEqual({ name: `THR LEVER ${engine}`, sensed: true, labelNotCompleted: 'IDLE' });
    expect(items).toContainEqual({ name: 'DELAY T.O FOR WARM UP', sensed: false });
  });

  it('ENG THR LEVERS NOT SET: amber, TOGA or MCT/FLEX line', () => {
    const entry = sensed(701800157);
    expect(entry.simVarIsActive).toBe(core.thrustLeverNotSet);
    expect(entry.flightPhaseInhib).toEqual(THR_LEVERS_NOT_SET_PHASE_INHIBITION);
    expect(entry.failure).toBe(2);
    // the MCT/FLEX line for a FLEX or a derated takeoff
    core.flexTakeoffMode.set(false);
    core.derateTakeoffMode.set(false);
    expect(entry.whichItemsToShow()).toEqual(thrLeversNotSetItemsShown(false));
    core.derateTakeoffMode.set(true);
    expect(entry.whichItemsToShow()).toEqual(thrLeversNotSetItemsShown(true));
    core.derateTakeoffMode.set(false);
    core.flexTakeoffMode.set(true);
    expect(entry.whichItemsToShow()).toEqual(thrLeversNotSetItemsShown(true));
    const items = EcamAbnormalProcedures[701800157].items;
    expect(items).toContainEqual({ name: 'ALL THR LEVERS', sensed: true, labelNotCompleted: 'TOGA' });
    expect(items).toContainEqual({ name: 'THR LEVERS', sensed: true, labelNotCompleted: 'MCT/FLEX' });
  });

  it('computes THR LEVERS NOT SET from the engine states, the levers and the derate setting', () => {
    for (const engine of [1, 2, 3, 4]) {
      simVars.set(`L:A32NX_ENGINE_STATE:${engine}`, FadecEngineState.On);
      simVars.set(`L:A32NX_AUTOTHRUST_TLA:${engine}`, 35);
    }
    simVars.set('L:A32NX_AIRLINER_TO_DERATE', 1);
    runFwsCycle(core);
    expect(core.thrustLeverNotSet.get()).toBe(false);
    // a derated takeoff does not allow TOGA
    simVars.set('L:A32NX_AUTOTHRUST_TLA:3', 45);
    runFwsCycle(core);
    expect(core.thrustLeverNotSet.get()).toBe(true);
  });

  it('each alert id is defined once', () => {
    for (const id of [701800097, 701800098, 701800099, 701800100, 701800157]) {
      expect(sensed(id), `${id}`).toBeDefined();
    }
  });
});
