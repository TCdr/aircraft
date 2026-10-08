// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EngineFuelFilterInputs,
  FUEL_FILTER_CLOG_PHASE_INHIBITION,
  engineFuelFilterClog,
} from './EngineFuelFilterAlerts';

const running: EngineFuelFilterInputs = { masterOn: true, engineRunning: true, fuelFilterClogged: false };

/* A320 FCOM PRO-ABN-ENG ENG 1(2) FUEL FILTER CLOG, a320_fcom.txt l.80176 */
describe('ENG 1(2) FUEL FILTER CLOG', () => {
  it('triggers when the fuel filter of a running engine is clogged', () => {
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true })).toBe(true);
  });

  it('does not trigger without the failure, on a stopped engine or with the ENG MASTER OFF', () => {
    expect(engineFuelFilterClog(running)).toBe(false);
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true, engineRunning: false })).toBe(false);
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true, masterOn: false })).toBe(false);
  });

  it('is inhibited in the flight phases of the FCOM figure (PDF page 2272)', () => {
    expect(FUEL_FILTER_CLOG_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

describe('PseudoFWC fuel filter alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['7707301', 'engine1FuelFilterClog', '770730101', '1'],
    ['7707302', 'engine2FuelFilterClog', '770730201', '2'],
  ])('%s is an amber ENG caution on %s with the title %s', (code, subject, title, engine) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.${subject},`);
    expect(item).toContain('flightPhaseInhib: FUEL_FILTER_CLOG_PHASE_INHIBITION,');
    expect(item).toContain('failure: 2,');
    expect(item).toContain('sysPage: EcamSysPage.ENG,');
    expect(item).toContain(`codesToReturn: ['${title}'],`);
    expect(messages).toContain(`['${title}', { group: 'ENG$5', text: ' ${engine} FUEL FILTER CLOG' }],`);
  });

  it('reads the fuel filter failure of each engine', () => {
    expect(fwc).toContain(
      'fuelFilterClogged: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engineNumber}_FUEL_FILTER_CLOGGED`',
    );
  });
});
