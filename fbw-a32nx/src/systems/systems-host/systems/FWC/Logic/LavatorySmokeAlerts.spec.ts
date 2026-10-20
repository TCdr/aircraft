// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { LavatorySmokeAlertKeys, LavatorySmokeAlerts, LavatorySmokeInputs } from './LavatorySmokeAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

const healthy: LavatorySmokeInputs = {
  lavatorySmoke: false,
  lavatoryDetectionFault: false,
  smokeDetectionControlUnitFault: false,
  aftIsolValvePbAuto: true,
};

function alertsWith(inputs: Partial<LavatorySmokeInputs>): LavatorySmokeAlerts {
  const alerts = new LavatorySmokeAlerts();
  alerts.update({ ...healthy, ...inputs });
  return alerts;
}

const K = LavatorySmokeAlertKeys;

describe('SMOKE lavatory and smoke detection alerts', () => {
  it('shows nothing with a healthy detection and no smoke', () => {
    const alerts = alertsWith({});
    for (const key of Object.values(K)) {
      expect(alerts.ewdFailures[key].simVarIsActive.get()).toBe(false);
    }
  });

  it('SMOKE LAVATORY SMOKE: -CKPT/CAB COM ESTABLISH, level 2, phases 4, 5, 7, 8', () => {
    const item = alertsWith({ lavatorySmoke: true }).ewdFailures[K.lavatorySmoke];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
    expect(ewdLines(item)).toEqual(['SMOKE LAVATORY SMOKE', ' -CKPT/CAB COM.ESTABLISH']);
    expect(item.inopSys()).toEqual([]);
  });

  it('SMOKE LAVATORY DET FAULT: crew awareness, INOP SYS LAV DET, phases 3, 4, 5, 7, 8', () => {
    const item = alertsWith({ lavatoryDetectionFault: true }).ewdFailures[K.lavatoryDetectionFault];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(ewdLines(item)).toEqual(['SMOKE LAVATORY DET FAULT']);
    expect(statusLines({ left: [], inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'LAV DET']);
  });

  it('SMOKE DET FAULT: IF NO LIVE STOCK: -AFT ISOL VALVE OFF until it is OFF, -PAX SYS OFF; INOP SYS SMOKE DET', () => {
    const alerts = alertsWith({ smokeDetectionControlUnitFault: true });
    const item = alerts.ewdFailures[K.smokeDetectionFault];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(ewdLines(item)).toEqual([
      'SMOKE DET FAULT',
      '  .IF NO LIVE STOCK:',
      ' -AFT ISOL VALVE.....OFF',
      ' -PAX SYS............OFF',
    ]);
    expect(statusLines({ left: [], inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'SMOKE DET']);

    alerts.update({ ...healthy, smokeDetectionControlUnitFault: true, aftIsolValvePbAuto: false });
    expect(ewdLines(item)).toEqual(['SMOKE DET FAULT', '  .IF NO LIVE STOCK:', ' -PAX SYS............OFF']);
  });

  it('the PseudoFWC updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('this.lavatorySmokeAlerts.update(readLavatorySmokeInputs());');
    expect(fwc).toContain('...this.lavatorySmokeAlerts.ewdFailures,');
  });
});
