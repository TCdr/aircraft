// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  BOTH_COMPRESSOR_VANES_KEY,
  EngineFadecFaultAlerts,
  EngineFadecFaultFailuresSource,
  EngineFadecFaultInputs,
  EngineFadecFaults,
  FADEC_FAULT_KEYS,
  FADEC_FAULT_PHASE_INHIBITION,
  FADEC_FAULT_VARIABLES,
  NO_FADEC_FAULT,
  VIB_SYS_FAULT_KEY,
  bleedStatusFaultLines,
  bothCompressorVanesAlert,
  fuelReturnValveLines,
  throttleIdleFaultLines,
} from './EngineFadecFaultAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements EngineFadecFaultFailuresSource {
  public readonly registered: number[] = [];

  public readonly active = new Set<number>();

  register(identifier: number): void {
    this.registered.push(identifier);
  }

  update(): void {}

  isActive(identifier: number): boolean {
    return this.active.has(identifier);
  }
}

// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '');

/** The E/WD lines an item shows now, without the colour codes */
const shownLines = (alerts: EngineFadecFaultAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  const codes = item
    .whichCodeToReturn()
    .filter((index): index is number => index !== null)
    .map((index) => item.codesToReturn[index]);
  return formatEwdMessages(codes).map((line) => visible(line).trim());
};

const faults = (engine1: Partial<EngineFadecFaults>, engine2: Partial<EngineFadecFaults> = {}) =>
  [
    { ...NO_FADEC_FAULT, ...engine1 },
    { ...NO_FADEC_FAULT, ...engine2 },
  ] as [EngineFadecFaults, EngineFadecFaults];

const inputs = (overrides: Partial<EngineFadecFaultInputs>): EngineFadecFaultInputs => ({
  faults: faults({}),
  onGround: false,
  flightPhase: 6,
  engineAntiIceOn: [false, false],
  ...overrides,
});

const alertsWith = (overrides: Partial<EngineFadecFaultInputs>, failures = new TestFailures()) => {
  const alerts = new EngineFadecFaultAlerts(failures);
  alerts.init();
  alerts.update(inputs(overrides));
  return alerts;
};

/* A320 FCOM PRO-ABN-ENG, a320_fcom.txt; inhibition figures of the 2019 FCOM PDF */
describe('ENG FADEC fault alerts (FCOM gap batch T2-37)', () => {
  it('reads the variables engine_monitoring_fault.rs writes', () => {
    expect(Object.values(FADEC_FAULT_VARIABLES).sort()).toEqual(
      [
        'BLEED_STATUS_FAULT',
        'COMPRESSOR_VANE_CHANNEL_FAULT',
        'COMPRESSOR_VANE_FAULT',
        'CTL_VALVE_FAULT',
        'FUEL_CTL_FAULT',
        'FUEL_RETURN_VALVE_FAILED_CLOSED',
        'FUEL_RETURN_VALVE_FAILED_OPEN',
        'REVERSER_INHIBITED',
        'REVERSER_SHUTOFF_VALVE_FAULT',
      ].sort(),
    );
    const rust = readFileSync(
      resolve(
        __dirname,
        '../../../../../../../fbw-common/src/wasm/systems/systems/src/engine/engine_monitoring_fault.rs',
      ),
      'utf8',
    );
    for (const variable of Object.values(FADEC_FAULT_VARIABLES)) {
      expect(rust).toContain(`"${variable}"`);
    }
  });

  it('has the flight phase inhibitions of the FCOM figures', () => {
    expect(FADEC_FAULT_PHASE_INHIBITION).toEqual({
      fuelCtlFault: [4, 5, 7, 8], // page 2271
      fuelReturnValve: [3, 4, 5, 7, 8], // page 2273
      ctlValveFault: [4, 5, 7, 8], // page 2253
      compressorVane: [4, 5, 7, 8], // page 2252
      bothCompressorVanes: [3, 4, 5, 7, 8], // page 2251
      bleedStatusFault: [3, 4, 5, 7, 8], // pages 2247, 2249
      revInhibited: [3, 4, 5, 6, 7, 8, 9], // page 2287
      revIsolFault: [3, 4, 5, 6, 7], // page 2288
      vibSysFault: [3, 4, 5, 6, 7, 8, 9], // page 2319
    });
  });

  it('ENG 1(2) FUEL CTL FAULT: level 2, ENGINE page, the on ground lines and AVOID RAPID THR CHANGES (l.80132-80142)', () => {
    expect(throttleIdleFaultLines(true)).toEqual([0, 1, 2, 3]);
    expect(throttleIdleFaultLines(false)).toEqual([0, 3]);

    const key = FADEC_FAULT_KEYS.fuelCtlFault[1];
    const quiet = alertsWith({});
    expect(quiet.ewdFailures[key].simVarIsActive.get()).toBe(false);

    const alerts = alertsWith({ faults: faults({}, { fuelMeteringValve: true }), onGround: true, flightPhase: 2 });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(alerts.ewdFailures[FADEC_FAULT_KEYS.fuelCtlFault[0]].simVarIsActive.get()).toBe(false);
    expect(item.failure).toBe(2);
    expect(item.sysPage).toBe(0); // SdPages.ENG
    expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
    expect(shownLines(alerts, key)).toEqual([
      'ENG 2 FUEL CTL FAULT',
      '-THR LEVER 2.......IDLE',
      '-ENG MASTER 2.......OFF',
      'AVOID RAPID THR CHANGES',
    ]);
    expect(visible(formatStatusPage(item.statusInfo(), item.inopSys()).left)).toBe('AVOID RAPID THR CHANGES');

    alerts.update(inputs({ faults: faults({}, { fuelMeteringValve: true }) }));
    expect(shownLines(alerts, key)).toEqual(['ENG 2 FUEL CTL FAULT', 'AVOID RAPID THR CHANGES']);
  });

  it('ENG 1(2) FUEL RETURN VALVE: level 1, VALVE NOT OPEN when failed closed, VALVE NOT CLOSED when failed open (l.80213-80221)', () => {
    expect(fuelReturnValveLines(true, false)).toEqual([0, 1]);
    expect(fuelReturnValveLines(false, true)).toEqual([0, 2]);

    const key = FADEC_FAULT_KEYS.fuelReturnValve[0];
    const closed = alertsWith({ faults: faults({ fuelReturnValveFailedClosed: true }) });
    expect(closed.ewdFailures[key].simVarIsActive.get()).toBe(true);
    expect(closed.ewdFailures[key].failure).toBe(1);
    expect(closed.ewdFailures[key].sysPage).toBe(-1); // SdPages.NONE
    expect(closed.ewdFailures[key].flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(shownLines(closed, key)).toEqual(['ENG 1 FUEL RETURN VALVE', 'VALVE NOT OPEN']);

    const open = alertsWith({ faults: faults({ fuelReturnValveFailedOpen: true }) });
    expect(open.ewdFailures[key].simVarIsActive.get()).toBe(true);
    expect(shownLines(open, key)).toEqual(['ENG 1 FUEL RETURN VALVE', 'VALVE NOT CLOSED']);
  });

  it('ENG 1(2) CTL VALVE FAULT: level 2, MAX N2 96 % and STATUS MAX ENG n N2 96 % (l.79464, l.79485)', () => {
    const key = FADEC_FAULT_KEYS.ctlValveFault[0];
    const alerts = alertsWith({ faults: faults({ clearanceControlValves: true }) });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
    expect(shownLines(alerts, key)).toEqual(['ENG 1 CTL VALVE FAULT', 'MAX N2.............96 %']);
    expect(visible(formatStatusPage(item.statusInfo(), item.inopSys()).left)).toBe('MAX ENG 1 N2.......96 %');
  });

  it('ENG 1(2) COMPRESSOR VANE: level 2, the FUEL CTL FAULT lines (l.79413-79421)', () => {
    const key = FADEC_FAULT_KEYS.compressorVane[0];
    const alerts = alertsWith({ faults: faults({ compressorVanes: true }), onGround: true, flightPhase: 9 });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
    expect(shownLines(alerts, key)).toEqual([
      'ENG 1 COMPRESSOR VANE',
      '-THR LEVER 1.......IDLE',
      '-ENG MASTER 1.......OFF',
      'AVOID RAPID THR CHANGES',
    ]);
    expect(visible(formatStatusPage(item.statusInfo(), item.inopSys()).left)).toBe('AVOID RAPID THR CHANGES');
  });

  it('ENG 1+2 COMPRESSOR VANE: level 1, one vane control channel lost on both engines (l.79376-79378)', () => {
    expect(bothCompressorVanesAlert(faults({ compressorVaneChannel: true }))).toBe(false);
    expect(bothCompressorVanesAlert(faults({}, { compressorVaneChannel: true }))).toBe(false);
    expect(bothCompressorVanesAlert(faults({ compressorVaneChannel: true }, { compressorVaneChannel: true }))).toBe(
      true,
    );

    const one = alertsWith({ faults: faults({ compressorVaneChannel: true }) });
    expect(one.ewdFailures[BOTH_COMPRESSOR_VANES_KEY].simVarIsActive.get()).toBe(false);
    const both = alertsWith({ faults: faults({ compressorVaneChannel: true }, { compressorVaneChannel: true }) });
    const item = both.ewdFailures[BOTH_COMPRESSOR_VANES_KEY];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(shownLines(both, BOTH_COMPRESSOR_VANES_KEY)).toEqual(['ENG 1+2 COMPRESSOR VANE']);
  });

  it('ENG 1(2) BLEED STATUS FAULT: HI GND IDLE and PACK OFF before T.O. on ground, ENG MODE SEL IGN with ENG ANTI ICE on (l.79336-79346)', () => {
    expect(bleedStatusFaultLines(false, 6, false)).toEqual([0]);
    expect(bleedStatusFaultLines(false, 6, true)).toEqual([0, 2]);
    expect(bleedStatusFaultLines(true, 2, false)).toEqual([0, 1, 3]);
    expect(bleedStatusFaultLines(true, 2, true)).toEqual([0, 1, 2, 3]);
    expect(bleedStatusFaultLines(true, 9, false)).toEqual([0, 1]);

    const key = FADEC_FAULT_KEYS.bleedStatusFault[1];
    const alerts = alertsWith({
      faults: faults({}, { bleedValveStatus: true }),
      onGround: true,
      flightPhase: 1,
      engineAntiIceOn: [false, true],
    });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(shownLines(alerts, key)).toEqual([
      'ENG 2 BLEED STATUS FAULT',
      'HI GND IDLE',
      '-ENG MODE SEL.......IGN',
      '-PACK 2.............OFF',
    ]);
    expect(visible(formatStatusPage(item.statusInfo(), item.inopSys()).left)).toBe('ENG 2 HI GND IDLE');
  });

  it('ENG 1(2) REV INHIBITED: level 1, STATUS INOP SYS REVERSER 1(2) (l.80700-80715)', () => {
    const key = FADEC_FAULT_KEYS.revInhibited[1];
    const alerts = alertsWith({ faults: faults({}, { reverserInhibited: true }) });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(shownLines(alerts, key)).toEqual(['ENG 2 REV INHIBITED']);
    expect(visible(formatStatusPage(item.statusInfo(), item.inopSys()).right)).toContain('REVERSER 2');
  });

  it('ENG 1(2) REV ISOL FAULT: level 1, title only (l.80737-80743)', () => {
    const key = FADEC_FAULT_KEYS.revIsolFault[0];
    const alerts = alertsWith({ faults: faults({ reverserShutoffValve: true }) });
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7]);
    expect(shownLines(alerts, key)).toEqual(['ENG 1 REV ISOL FAULT']);
    expect(item.inopSys()).toEqual([]);
  });

  it('ENG VIB SYS FAULT: level 1, from the flyPad failure of the vibration monitoring unit (l.82025)', () => {
    const failures = new TestFailures();
    const alerts = alertsWith({}, failures);
    expect(failures.registered).toEqual([A320Failure.EngineVibrationMonitoringUnit]);
    const item = alerts.ewdFailures[VIB_SYS_FAULT_KEY];
    expect(item.simVarIsActive.get()).toBe(false);

    failures.active.add(A320Failure.EngineVibrationMonitoringUnit);
    alerts.update(inputs({}));
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(1);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(shownLines(alerts, VIB_SYS_FAULT_KEY)).toEqual(['ENG VIB SYS FAULT']);
  });

  it('every E/WD line fits the 24 columns of the left memo area', () => {
    const alerts = alertsWith({});
    for (const item of Object.values(alerts.ewdFailures)) {
      for (const line of formatEwdMessages(item.codesToReturn)) {
        expect(visible(line).length).toBeGreaterThan(0);
        expect(visible(line).length).toBeLessThanOrEqual(24);
      }
    }
  });

  it('the PseudoFWC reads the faults, updates the alerts and adds them to its alerts', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.engineFadecFaultAlerts.init();');
    expect(fwc).toContain('faults: [readEngineFadecFaults(1), readEngineFadecFaults(2)],');
    expect(fwc).toContain('...this.engineFadecFaultAlerts.ewdFailures,');
  });
});
