// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
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

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) OIL TEMP LO, a380_fcom.txt l.172611-172614 */
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

  it('is shown in phases 2 and 3 only (FCOM PDF page 5802)', () => {
    expect(OIL_TEMP_LO_PHASE_INHIBITION).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

const allRunning = [1, 2, 3, 4].map(() => FadecEngineState.On);

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG THR LEVERS NOT SET, a380_fcom.txt l.175152-175181 */
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

  it('is shown in phases 2 and 3 only (FCOM PDF page 5860)', () => {
    expect(THR_LEVERS_NOT_SET_PHASE_INHIBITION).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

/* The alerts in the FWS, read from the source text (see EngineFuelFilterAlerts.spec.ts) */
describe('FWS take-off engine alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  ).replace(/\r\n/g, '\n');

  /** The source of one entry, from its id to the end of its object, at the indentation of its table */
  function block(source: string, id: number): string {
    const indent = source === abnormalSensed ? '    ' : '  ';
    const start = source.indexOf(`\n${indent}${id}: {`);
    expect(start, `alert ${id}`).toBeGreaterThan(0);
    return source.slice(start, source.indexOf(`\n${indent}},`, start));
  }

  it.each([1, 2, 3, 4])('ENG %d OIL TEMP LO: amber, ENGINE SD page, THR LEVER IDLE and DELAY T.O', (engine) => {
    const id = 701800097 + engine - 1;
    const alert = block(abnormalSensed, id);
    expect(alert).toContain(`simVarIsActive: this.fws.engineOilTempLo[${engine - 1}],`);
    expect(alert).toContain('flightPhaseInhib: OIL_TEMP_LO_PHASE_INHIBITION,');
    expect(alert).toContain(`whichItemsChecked: () => [this.fws.thrustLever${engine}Idle.get(), false],`);
    expect(alert).toContain('failure: 2,');
    expect(alert).toContain('sysPage: SdPages.Eng,');
    const message = block(ata70, id);
    expect(message).toContain(`{ name: 'THR LEVER ${engine}', sensed: true, labelNotCompleted: 'IDLE' },`);
    expect(message).toContain("{ name: 'DELAY T.O FOR WARM UP', sensed: false },");
  });

  it('ENG THR LEVERS NOT SET: amber, TOGA or MCT/FLEX line', () => {
    const alert = block(abnormalSensed, 701800157);
    expect(alert).toContain('simVarIsActive: this.fws.thrustLeverNotSet,');
    expect(alert).toContain('flightPhaseInhib: THR_LEVERS_NOT_SET_PHASE_INHIBITION,');
    expect(alert).toContain('whichItemsToShow: () => thrLeversNotSetItemsShown(this.fws.flexTakeoffMode.get()),');
    expect(alert).toContain('failure: 2,');
    const message = block(ata70, 701800157);
    expect(message).toContain("{ name: 'ALL THR LEVERS', sensed: true, labelNotCompleted: 'TOGA' },");
    expect(message).toContain("{ name: 'THR LEVERS', sensed: true, labelNotCompleted: 'MCT/FLEX' },");
  });

  it('FwsCore computes the alerts from the FADEC oil temperature, the levers and the FLEX TEMP', () => {
    expect(core).toContain('this.engineOilTempLo[index].set(this.oilTemperatureLowMonitors[index].isActive);');
    expect(core).toContain('this.thrustLeverNotSet.set(\n      isThrustLeversNotSet({');
    expect(core).toContain("SimVar.GetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'number'),");
  });

  it('each alert id is defined once', () => {
    for (const id of [701800097, 701800098, 701800099, 701800100, 701800157]) {
      expect(abnormalSensed.split(`\n    ${id}: {`).length - 1, `${id}`).toBe(1);
    }
  });
});
