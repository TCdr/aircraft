// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownText, startCruiseFwc } from '../FwcAlertProbe';
import {
  ENG_LP_VALVE_OPEN_PHASE_INHIBITION,
  FQI_CHANNEL_FAULT_PHASE_INHIBITION,
  fuelLpValveFqiAlerts,
  readFuelLpValveFqiInputs,
} from './FuelLpValveFqiAlerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

describe('FUEL ENG 1(2) LP VALVE OPEN and FUEL FQI CH 1(2) FAULT', () => {
  const read = (values: Record<string, number>) => (name: string) => values[name] ?? 0;

  it('triggers ENG 1(2) LP VALVE OPEN when the LP valve of that engine remains open', () => {
    const alerts = fuelLpValveFqiAlerts(
      readFuelLpValveFqiInputs(read({ 'L:A32NX_FUEL_ENG_2_LP_VALVE_ABNORMALLY_OPEN': 1 })),
    );
    expect(alerts.engLpValveOpen).toEqual([false, true]);
    expect(alerts.fqiChannelFault).toEqual([false, false]);
  });

  it('triggers FQI CH 1(2) FAULT when that FQI channel is failed', () => {
    const alerts = fuelLpValveFqiAlerts(readFuelLpValveFqiInputs(read({ 'L:A32NX_FUEL_FQI_CHANNEL_1_FAULT': 1 })));
    expect(alerts.fqiChannelFault).toEqual([true, false]);
    expect(alerts.engLpValveOpen).toEqual([false, false]);
  });

  it('gives nothing without a failure', () => {
    const alerts = fuelLpValveFqiAlerts(readFuelLpValveFqiInputs(read({})));
    expect(alerts.engLpValveOpen).toEqual([false, false]);
    expect(alerts.fqiChannelFault).toEqual([false, false]);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(ENG_LP_VALVE_OPEN_PHASE_INHIBITION).toEqual([4, 5, 7, 8]);
    expect(FQI_CHANNEL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

describe('the real FWC: LP valve and FQI alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it.each([
    [
      '2800230',
      'L:A32NX_FUEL_ENG_1_LP_VALVE_ABNORMALLY_OPEN',
      ENG_LP_VALVE_OPEN_PHASE_INHIBITION,
      '280023001',
      'ENG 1 LP VALVE OPEN',
    ],
    [
      '2800231',
      'L:A32NX_FUEL_ENG_2_LP_VALVE_ABNORMALLY_OPEN',
      ENG_LP_VALVE_OPEN_PHASE_INHIBITION,
      '280023101',
      'ENG 2 LP VALVE OPEN',
    ],
    ['2800232', 'L:A32NX_FUEL_FQI_CHANNEL_1_FAULT', FQI_CHANNEL_FAULT_PHASE_INHIBITION, '280023201', 'FQI CH 1 FAULT'],
    ['2800233', 'L:A32NX_FUEL_FQI_CHANNEL_2_FAULT', FQI_CHANNEL_FAULT_PHASE_INHIBITION, '280023301', 'FQI CH 2 FAULT'],
  ])('%s is an amber FUEL caution raised by %s', (key, variable, inhibition, title, text) => {
    const { fwc } = startCruiseFwc(simvars);
    const item = failureItem(fwc, key);
    expect(item.failure).toBe(2);
    expect(item.sysPage).toBe(EcamSysPage.FUEL);
    expect(item.flightPhaseInhib).toEqual(inhibition);
    expect(item.codesToReturn).toEqual([title]);
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set(variable, 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(shownText(fwc, key)).toEqual([`FUEL ${text}`]);
    for (const otherKey of ['2800230', '2800231', '2800232', '2800233'].filter((other) => other !== key)) {
      expect(isAlertTriggered(fwc, otherKey), otherKey).toBe(false);
    }
  });
});
