// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownCodes, startCruiseFwc } from '../FwcAlertProbe';
import {
  EngineFuelFilterInputs,
  FUEL_FILTER_CLOG_PHASE_INHIBITION,
  engineFuelFilterClog,
} from './EngineFuelFilterAlerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\x1b[^m]*m/g, '').trim();

const running: EngineFuelFilterInputs = { masterOn: true, engineRunning: true, fuelFilterClogged: false };

/* ENG 1(2) FUEL FILTER CLOG: the fuel filter is clogged */
describe('ENG 1(2) FUEL FILTER CLOG', () => {
  it('triggers when the fuel filter of a running engine is clogged', () => {
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true })).toBe(true);
  });

  it('does not trigger without the failure, on a stopped engine or with the ENG MASTER OFF', () => {
    expect(engineFuelFilterClog(running)).toBe(false);
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true, engineRunning: false })).toBe(false);
    expect(engineFuelFilterClog({ ...running, fuelFilterClogged: true, masterOn: false })).toBe(false);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(FUEL_FILTER_CLOG_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

describe('the real FWC: fuel filter alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it.each([
    ['7707301', 1, '770730101'],
    ['7707302', 2, '770730201'],
  ])('%s is an amber ENG caution of engine %i with the title %s', (key, engine, title) => {
    const { fwc } = startCruiseFwc(simvars);
    const item = failureItem(fwc, key);
    expect(item.failure).toBe(2);
    expect(item.sysPage).toBe(EcamSysPage.ENG);
    expect(item.flightPhaseInhib).toEqual(FUEL_FILTER_CLOG_PHASE_INHIBITION);
    expect(item.codesToReturn).toEqual([title]);
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set(`L:A32NX_ENGINE_${engine}_FUEL_FILTER_CLOGGED`, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(formatEwdMessages(shownCodes(fwc, key)).map(plain)).toEqual([`ENG ${engine} FUEL FILTER CLOG`]);
  });

  it('reads the fuel filter failure of its own engine only', () => {
    const { fwc } = startCruiseFwc(simvars);
    simvars.set('L:A32NX_ENGINE_2_FUEL_FILTER_CLOGGED', 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, '7707301')).toBe(false);
  });
});
