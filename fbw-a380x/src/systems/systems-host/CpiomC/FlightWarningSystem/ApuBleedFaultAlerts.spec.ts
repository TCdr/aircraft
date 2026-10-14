// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  APU_BLEED_VALVE_DISAGREE_CONFIRMATION_S,
  ApuBleedValveInputs,
  ApuBleedValvePositionMonitor,
  apuBleedFaultItems,
  isApuBleedFault,
} from './ApuBleedFaultAlerts';

const FRAME_MS = 100;

function run(monitor: ApuBleedValvePositionMonitor, inputs: ApuBleedValveInputs, seconds: number) {
  for (let t = 0; t < seconds * 1000; t += FRAME_MS) {
    monitor.update(inputs, FRAME_MS);
  }
  return monitor;
}

const normal: ApuBleedValveInputs = { apuRunning: true, valveOpen: true, valveCommandedOpen: true };

/* A380 FCOM PRO-ABN-ECAM-10-36 AIR APU BLEED FAULT, a380_fcom.txt l.167685-167734 (FCOM audit T2-44, row B18) */
describe('AIR APU BLEED FAULT: APU bleed valve abnormally open (closed)', () => {
  it('no fault while the valve follows the ECB', () => {
    const monitor = run(new ApuBleedValvePositionMonitor(), normal, 30);
    expect(monitor.abnormallyOpen).toBe(false);
    expect(monitor.abnormallyClosed).toBe(false);
    expect(isApuBleedFault(false, monitor)).toBe(false);
  });

  it('abnormally closed: commanded open, closed, confirmed after 10 s', () => {
    const stuckClosed = { ...normal, valveOpen: false };
    const monitor = run(new ApuBleedValvePositionMonitor(), stuckClosed, APU_BLEED_VALVE_DISAGREE_CONFIRMATION_S - 1);
    expect(monitor.abnormallyClosed).toBe(false);
    run(monitor, stuckClosed, 2);
    expect(monitor.abnormallyClosed).toBe(true);
    expect(isApuBleedFault(false, monitor)).toBe(true);
  });

  it('abnormally open: commanded closed (APU BLEED pb OFF), open', () => {
    const monitor = run(new ApuBleedValvePositionMonitor(), { ...normal, valveCommandedOpen: false }, 11);
    expect(monitor.abnormallyOpen).toBe(true);
    expect(monitor.abnormallyClosed).toBe(false);
  });

  it('only with the APU running', () => {
    const monitor = run(
      new ApuBleedValvePositionMonitor(),
      { apuRunning: false, valveOpen: true, valveCommandedOpen: false },
      30,
    );
    expect(monitor.abnormallyOpen).toBe(false);
  });

  it('the envelope case still triggers the alert', () => {
    expect(isApuBleedFault(true, new ApuBleedValvePositionMonitor())).toBe(true);
  });
});

describe('AIR APU BLEED FAULT lines (PDF page 5665)', () => {
  it('abnormally open: APU BLEED VLV NOT CLOSED only', () => {
    expect(apuBleedFaultItems({ abnormallyOpen: true, aboveFl225: true, apuBleedPbOn: true }).show).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('otherwise: APU BLEED OFF, and APU BLEED AVAIL BELOW FL 225 above FL 225', () => {
    expect(apuBleedFaultItems({ abnormallyOpen: false, aboveFl225: false, apuBleedPbOn: true })).toEqual({
      show: [false, false, false, false, true, false],
      checked: [false, false, false, false, false, false],
    });
    expect(apuBleedFaultItems({ abnormallyOpen: false, aboveFl225: true, apuBleedPbOn: false })).toEqual({
      show: [false, false, false, false, true, true],
      checked: [false, false, false, false, true, false],
    });
  });

  it('has the six lines in ata21-22-23', () => {
    const ata = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23.ts'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    const start = ata.indexOf('  211800051: {');
    const names = (ata.slice(start, ata.indexOf('\n  },', start)).match(/name: '[^']*'/g) ?? []).map((name) =>
      name.substring("name: '".length, name.length - 1),
    );
    expect(names).toEqual([
      'APU ISOL VLV NOT CLOSED',
      'APU BLEED VLV NOT CLOSED',
      'APU ISOL VLV NOT OPEN',
      'APU BLEED VLV NOT OPEN',
      'APU BLEED',
      'APU BLEED AVAIL BELOW FL225',
    ]);
  });
});

describe('FWS wiring of AIR APU BLEED FAULT', () => {
  it('reads the ECB command of the valve and uses the new trigger', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    const abnormal = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
    expect(core).toContain("'L:A32NX_APU_BLEED_AIR_VALVE_COMMANDED_OPEN'");
    expect(core).toContain(
      'this.apuBleedFault.set(isApuBleedFault(this.apuBleedPbOnOver22500ft.get(), this.apuBleedValvePositionMonitor));',
    );
    expect(abnormal).toContain('simVarIsActive: this.fws.apuBleedFault,');
    expect(abnormal).toContain('whichItemsToShow: () => this.apuBleedFaultItems().show,');
  });
});
