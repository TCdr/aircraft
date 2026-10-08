// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FadecEngineState } from './EngineFailAlerts';
import {
  EngineFuelFilterInputs,
  FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
  engineFuelFilterClogged,
} from './EngineFuelFilterAlerts';

const running: EngineFuelFilterInputs = { masterOn: true, engineState: FadecEngineState.On, fuelFilterClogged: false };

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) FUEL FILTER CLOGGED, a380_fcom.txt l.171988 */
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

  it('is inhibited in phases 3 to 10 (FCOM PDF page 5783)', () => {
    expect(FUEL_FILTER_CLOGGED_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

/* The alerts in the FWS, read from the source text (see EngineOilAlerts.spec.ts) */
describe('FWS fuel filter alerts', () => {
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

  it.each([1, 2, 3, 4])('ENG %d FUEL FILTER CLOGGED: amber, crew awareness, ENGINE SD page', (engine) => {
    const id = 701800033 + engine - 1;
    const alert = block(abnormalSensed, id);
    expect(alert).toContain(`simVarIsActive: this.fws.engineFuelFilterClogged[${engine - 1}],`);
    expect(alert).toContain('flightPhaseInhib: FUEL_FILTER_CLOGGED_PHASE_INHIBITION,');
    expect(alert).toContain('failure: 2,');
    expect(alert).toContain('sysPage: SdPages.Eng,');
    const message = block(ata70, id);
    expect(message).toContain(`title: '\\x1b<4m\\x1b4mENG\\x1bm ${engine} FUEL FILTER CLOGGED',`);
    expect(message).toContain('items: [],');
  });

  it('reads the clogged fuel filter of each engine in FwsCore', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain('SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engineNumber}_FUEL_FILTER_CLOGGED`');
  });
});
