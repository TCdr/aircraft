// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import {
  BleedLeakMonitoringAlertKeys as K,
  BleedLeakMonitoringAlerts,
  BleedLeakMonitoringInputs,
  BleedLeakMonitoringLineCounts,
  BleedLeakMonitoringPhaseInhibition,
  BleedLeakMonitoringStatusCodes,
  NO_BLEED_LEAK_MONITORING_INPUTS,
  apuLeakLines,
  bleedLeakMonitoringStates,
  leakLines,
  leakStatus,
} from './BleedLeakMonitoringAlerts';
import { alertCodes } from './FwcAlertItem';

const inputs = (changes: Partial<BleedLeakMonitoringInputs>): BleedLeakMonitoringInputs => ({
  ...NO_BLEED_LEAK_MONITORING_INPUTS,
  engineRunning: [true, true],
  engineBleedValveOpen: [true, true],
  ...changes,
});

describe('bleed leak and monitoring cautions', () => {
  it('triggers the wing leak on the wing leak signal and the engine bleed leak with the engine running', () => {
    expect(bleedLeakMonitoringStates(inputs({ wingLeak: [true, false] })).wingLeak).toEqual([true, false]);
    expect(bleedLeakMonitoringStates(inputs({ pylonLeak: [false, true] })).engineBleedLeak).toEqual([false, true]);
    expect(
      bleedLeakMonitoringStates(inputs({ pylonLeak: [false, true], engineRunning: [true, false] })).engineBleedLeak,
    ).toEqual([false, false]);
  });

  it('gives BLEED MONITORING FAULT instead of the two MONIT SYS FAULT cautions when both BMCs are failed', () => {
    const one = bleedLeakMonitoringStates(inputs({ bmcFault: [true, false] }));
    expect(one.bleedMonitoringSystemFault).toEqual([true, false]);
    expect(one.bleedMonitoringFault).toBe(false);
    const both = bleedLeakMonitoringStates(inputs({ bmcFault: [true, true] }));
    expect(both.bleedMonitoringSystemFault).toEqual([false, false]);
    expect(both.bleedMonitoringFault).toBe(true);
  });

  it('shows the leak procedure lines of the actions not done', () => {
    const allToDo = inputs({
      apuBleedPbOn: true,
      apuBleedValveOpen: true,
      crossBleedFullyClosed: false,
      wingAntiIceOn: true,
    });
    expect(leakLines(allToDo, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    // APU BLEED only for the left side
    expect(leakLines(allToDo, 1)).toEqual([0, 1, 3, 4, 5]);
    // Valves closed automatically, wing anti ice off: AVOID ICING CONDITIONS stays
    const done = inputs({ engineBleedValveOpen: [false, true], crossBleedFullyClosed: true });
    expect(leakLines(done, 0)).toEqual([0, 5]);
    expect(apuLeakLines(inputs({ apuBleedPbOn: true, apuBleedValveOpen: true }))).toEqual([0, 1]);
    expect(apuLeakLines(inputs({ apuBleedPbOn: false, apuBleedValveOpen: false }))).toEqual([0]);
  });

  it('has the STATUS of the leak', () => {
    const status = leakStatus(1);
    expect(status.left).toEqual(['700400001', '700500001', '700400002', '700400003', '700400004']);
    expect(status.inopSys).toEqual(['300300001', '360300002', '210300002']);
  });

  it('has an E/WD text for every line code and a STATUS text for every status code', () => {
    for (const key of Object.values(K)) {
      for (const code of alertCodes(key, BleedLeakMonitoringLineCounts[key])) {
        expect(formatEwdMessages([code])[0], code).toBeTruthy();
      }
    }
    for (const code of Object.values(BleedLeakMonitoringStatusCodes)) {
      const page = formatStatusPage([code], []);
      expect(page.normal, code).toBe(false);
    }
  });

  it('uses the aircraft flight phase inhibitions', () => {
    const alerts = new BleedLeakMonitoringAlerts();
    expect(alerts.ewdFailures[K.leftWingLeak].flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(alerts.ewdFailures[K.eng2LeakDetectionFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8]);
    expect(alerts.ewdFailures[K.bleedMonitoringSystem1Fault].flightPhaseInhib).toEqual(
      BleedLeakMonitoringPhaseInhibition.bleedMonitoringSystemFault,
    );
    expect(Object.keys(alerts.ewdFailures)).toHaveLength(Object.values(K).length);
    for (const item of Object.values(alerts.ewdFailures)) {
      expect(item.failure).toBe(2);
    }
  });

  it('sets the alert subjects from the inputs', () => {
    const alerts = new BleedLeakMonitoringAlerts();
    alerts.update(inputs({ hpValveFault: [false, true], apuLeakDetectionFault: true }));
    expect(alerts.ewdFailures[K.eng2HpValveFault].simVarIsActive.get()).toBe(true);
    expect(alerts.ewdFailures[K.eng1HpValveFault].simVarIsActive.get()).toBe(false);
    expect(alerts.ewdFailures[K.apuLeakDetectionFault].simVarIsActive.get()).toBe(true);
    expect(alerts.ewdFailures[K.apuLeakDetectionFault].inopSys()).toEqual(['360300105']);
    expect(alerts.ewdFailures[K.eng2HpValveFault].statusInfo()).toEqual(['360200101']);
  });

  // The FWC reads the variables the Rust pneumatic system writes (a320_systems pneumatic.rs)
  it('reads the L:vars that the Rust BMCs write', () => {
    const rust = readFileSync(resolve(__dirname, '../../../../../wasm/systems/a320_systems/src/pneumatic.rs'), 'utf8');
    for (const name of [
      'PNEU_ENG_{}_BLEED_LEAK',
      'PNEU_{}_WING_LEAK',
      'PNEU_APU_BLEED_LEAK',
      'PNEU_ENG_{}_LEAK_DET_FAULT',
      'PNEU_{}_WING_LEAK_DET_FAULT',
      'PNEU_APU_LEAK_DET_FAULT',
      'PNEU_ENG_{}_HP_VALVE_FAULT',
      'PNEU_BMC_{}_FAULT',
    ]) {
      expect(rust).toContain(`"${name}"`);
    }
    const module = readFileSync(resolve(__dirname, './BleedLeakMonitoringAlerts.ts'), 'utf8');
    expect(module).toContain("'L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON'");
  });

  it('is wired into the PseudoFWC', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
    expect(fwc).toContain('this.bleedLeakMonitoringAlerts.update(readBleedLeakMonitoringInputs());');
    expect(fwc).toContain('...this.bleedLeakMonitoringAlerts.ewdFailures,');
  });
});
