// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ENG_LP_VALVE_OPEN_PHASE_INHIBITION,
  FQI_CHANNEL_FAULT_PHASE_INHIBITION,
  fuelLpValveFqiAlerts,
  readFuelLpValveFqiInputs,
} from './FuelLpValveFqiAlerts';

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

describe('PseudoFWC LP valve and FQI alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['2800230', 'fuelEngLpValveOpen[0]', 'ENG_LP_VALVE_OPEN_PHASE_INHIBITION', '280023001', 'ENG 1 LP VALVE OPEN'],
    ['2800231', 'fuelEngLpValveOpen[1]', 'ENG_LP_VALVE_OPEN_PHASE_INHIBITION', '280023101', 'ENG 2 LP VALVE OPEN'],
    ['2800232', 'fuelFqiChannelFault[0]', 'FQI_CHANNEL_FAULT_PHASE_INHIBITION', '280023201', 'FQI CH 1 FAULT'],
    ['2800233', 'fuelFqiChannelFault[1]', 'FQI_CHANNEL_FAULT_PHASE_INHIBITION', '280023301', 'FQI CH 2 FAULT'],
  ])('%s is an amber FUEL caution on %s', (code, subject, inhibition, title, text) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.${subject},`);
    expect(item).toContain(`flightPhaseInhib: ${inhibition},`);
    expect(item).toContain('failure: 2,');
    expect(item).toContain('sysPage: EcamSysPage.FUEL,');
    expect(item).toContain(`codesToReturn: ['${title}'],`);
    expect(messages).toContain(`['${title}', { group: 'FUEL$3', text: ' ${text}' }],`);
  });

  it('updates the alerts from the systems on every update', () => {
    expect(fwc).toContain('readFuelLpValveFqiInputs((name) => SimVar.GetSimVarValue(name, ');
    expect(fwc).toContain(
      'this.fuelEngLpValveOpen.forEach((alert, index) => alert.set(fuelLpValveFqi.engLpValveOpen[index]));',
    );
    expect(fwc).toContain(
      'this.fuelFqiChannelFault.forEach((alert, index) => alert.set(fuelLpValveFqi.fqiChannelFault[index]));',
    );
  });
});
