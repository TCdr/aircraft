// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FadecEngineState } from './EngineFailAlerts';
import { EngineOilInputs, engineOilAlerts } from './EngineOilAlerts';

const running: EngineOilInputs = {
  masterOn: true,
  engineState: FadecEngineState.On,
  oilPressurePsi: 60,
  oilTemperatureCelsius: 90,
  oilFilterClogged: false,
};

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) OIL PRESS LO, a380_fcom.txt l.172486: "This warning is displayed when the
 * oil pressure drops below 25 PSI." */
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

/* l.172561: "The oil temperature is above 196 °C." */
describe('ENG OIL TEMP HI', () => {
  it('triggers above 196 °C', () => {
    expect(engineOilAlerts({ ...running, oilTemperatureCelsius: 197 }).temperatureHigh).toBe(true);
    expect(engineOilAlerts({ ...running, oilTemperatureCelsius: 196 }).temperatureHigh).toBe(false);
  });

  it('ends with the ENG MASTER OFF', () => {
    expect(engineOilAlerts({ ...running, masterOn: false, oilTemperatureCelsius: 210 }).temperatureHigh).toBe(false);
  });
});

/* l.172415: "The oil filter in the feed line or in the return line is clogged." */
describe('ENG OIL FILTER CLOGGED', () => {
  it('triggers with a clogged filter on a running engine only', () => {
    expect(engineOilAlerts({ ...running, oilFilterClogged: true }).filterClogged).toBe(true);
    expect(
      engineOilAlerts({ ...running, engineState: FadecEngineState.Off, oilFilterClogged: true }).filterClogged,
    ).toBe(false);
    expect(engineOilAlerts(running).filterClogged).toBe(false);
  });
});

/*
 * The alerts in the FWS and their procedures, read from the source text (importing the EcamMessages tables in a test
 * fails on a circular import, see FwsAbnormalSensedItems.spec.ts). Levels and phase inhibitions: FCOM PDF pages 5796-5800.
 */
describe('FWS oil alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  );

  /** The source of one entry, from its id to the end of its object, at the indentation of its table */
  function block(source: string, id: number): string {
    const indent = source === abnormalSensed ? '    ' : '  ';
    const start = source.indexOf(`\n${indent}${id}: {`);
    expect(start, `alert ${id}`).toBeGreaterThan(0);
    return source.slice(start, source.indexOf(`\n${indent}},`, start));
  }

  function itemCount(id: number): number {
    return (block(ata70, id).match(/\{ name: /g) ?? []).length;
  }

  it.each([1, 2, 3, 4])(
    'ENG %d OIL PRESS LO: red warning, inhibited in phases 1, 5, 6 and 12, THR LEVER IDLE, MASTER OFF',
    (engine) => {
      const id = 701800085 + engine - 1;
      const alert = block(abnormalSensed, id);
      expect(alert).toContain(`simVarIsActive: this.fws.engineOilPressLo[${engine - 1}],`);
      expect(alert).toContain('flightPhaseInhib: OIL_PRESS_LO_PHASE_INHIBITION,');
      expect(alert).toContain('failure: 3,');
      expect(alert).toContain(`this.fws.thrustLever${engine}Idle.get(), !this.fws.engine${engine}Master.get()`);
      const message = block(ata70, id);
      // red title
      expect(message).toContain("title: '\\x1b<2m");
      expect(message).toContain(`{ name: 'THR LEVER ${engine}', sensed: true, labelNotCompleted: 'IDLE' }`);
      expect(message).toContain(`{ name: 'ENG ${engine} MASTER', sensed: true, labelNotCompleted: 'OFF' }`);
      expect(itemCount(id)).toBe(2);
    },
  );

  it.each([1, 2, 3, 4])('ENG %d OIL TEMP HI: amber, THR LEVER REDUCE, IF HI TEMP PERSISTS MASTER OFF', (engine) => {
    const id = 701800093 + engine - 1;
    const alert = block(abnormalSensed, id);
    expect(alert).toContain(`simVarIsActive: this.fws.engineOilTempHi[${engine - 1}],`);
    expect(alert).toContain('flightPhaseInhib: OIL_TEMP_HI_PHASE_INHIBITION,');
    expect(alert).toContain('failure: 2,');
    expect(alert).toContain('whichItemsToShow: () => [true, true, true],');
    const message = block(ata70, id);
    expect(message).toContain("title: '\\x1b<4m");
    expect(message).toContain(`{ name: 'ENG ${engine} MASTER', sensed: true, labelNotCompleted: 'OFF', level: 1 }`);
    expect(itemCount(id)).toBe(3);
    // the line fits the 39 characters of the WD (WdAbnormalNonSensed / ProcedureLinesGenerator)
    expect(`THR LEVER ${engine}`.length + 'REDUCE BELOW OIL TEMP LIM'.length + 2).toBeLessThanOrEqual(39);
  });

  it.each([1, 2, 3, 4])('ENG %d OIL FILTER CLOGGED: amber, crew awareness, inhibited in phases 3 to 10', (engine) => {
    const id = 701800081 + engine - 1;
    const alert = block(abnormalSensed, id);
    expect(alert).toContain(`simVarIsActive: this.fws.engineOilFilterClogged[${engine - 1}],`);
    expect(alert).toContain('flightPhaseInhib: OIL_FILTER_CLOGGED_PHASE_INHIBITION,');
    expect(alert).toContain('failure: 2,');
    expect(itemCount(id)).toBe(0);
  });

  it('reads the FADEC oil parameters and the clogged filter in FwsCore', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain('SimVar.GetSimVarValue(`GENERAL ENG OIL PRESSURE:${engineNumber}`');
    expect(core).toContain('SimVar.GetSimVarValue(`GENERAL ENG OIL TEMPERATURE:${engineNumber}`');
    expect(core).toContain('SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engineNumber}_OIL_FILTER_CLOGGED`');
  });
});
