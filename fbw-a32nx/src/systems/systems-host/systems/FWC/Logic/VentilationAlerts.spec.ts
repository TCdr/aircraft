// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import { A320Failure } from '@failures';
import {
  AIR_AFT_CRG_VENT_FAULT_KEY,
  COND_AFT_CRG_ISOL_VALVE_KEY,
  VENT_AVNCS_SYS_FAULT_KEY,
  VENT_BLOWER_FAULT_KEY,
  VENT_EXTRACT_FAULT_KEY,
  VENT_SKIN_VALVE_FAULT_EXTRACT_KEY,
  VENT_SKIN_VALVE_FAULT_INLET_KEY,
  VENTILATION_FAILURES,
  VentilationAlertInputs,
  VentilationAlerts,
  VentilationFailuresSource,
  VentilationSystemInputs,
  aftCargoIsolValvesCommandedOpen,
  blowerFaultLandAsap,
  blowerFaultLines,
  extractFaultLines,
  skinValveFaultExtractLines,
  ventilationAlerts,
} from './VentilationAlerts';

/** A failures consumer double: the registered failures and the active ones */
class TestFailures implements VentilationFailuresSource {
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

const cruiseSystem: VentilationSystemInputs = {
  blowerPbAuto: true,
  extractPbAuto: true,
  dcEssBusFault: false,
  aftCargoSmoke: false,
  aftIsolValvePbAuto: true,
  aftCargoIsolValvesOpen: true,
  aftCargoIsolValvesDisagree: false,
  flightPhase: 6,
  onGround: false,
};

const noFailure: VentilationAlertInputs = {
  ...cruiseSystem,
  aevcFailed: false,
  blowerFanFailed: false,
  extractFanFailed: false,
  skinExtractValveStuckOpen: false,
  skinInletValveStuckOpen: false,
  aftCargoFanFailed: false,
};

/** The systems.wasm valves stuck closed (flyPad 21026) while commanded open: closed, disagreeing (FAULT light) */
const isolValvesStuckClosed = { aftCargoIsolValvesOpen: false, aftCargoIsolValvesDisagree: true };

const triggered = (inputs: VentilationAlertInputs) =>
  Object.entries(ventilationAlerts(inputs))
    .filter(([, active]) => active)
    .map(([name]) => name);

/** The visible E/WD text of an alert item's shown lines */
const shownText = (alerts: VentilationAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  const codes = item.whichCodeToReturn().map((line) => item.codesToReturn[line!]);
  return formatEwdMessages(codes).map((line) => visible(line).trim());
};

const statusRight = (alerts: VentilationAlerts, key: string) => {
  const item = alerts.ewdFailures[key];
  return visible(formatStatusPage(item.statusInfo(), item.inopSys()).right).split('\r');
};

describe('VENT, AIR AFT CRG VENT FAULT and COND AFT CRG ISOL VALVE alerts', () => {
  it('no alert without a failure', () => {
    expect(triggered(noFailure)).toEqual([]);
  });

  it('VENT AVNCS SYS FAULT: the AEVC power up test is not satisfactory', () => {
    expect(triggered({ ...noFailure, aevcFailed: true })).toEqual(['avncsSysFault']);
  });

  it('VENT BLOWER FAULT: "the blowing pressure is low"; BLOWER OVRD until done, LAND ASAP with DC ESS BUS FAULT', () => {
    const inputs = { ...noFailure, blowerFanFailed: true };
    expect(triggered(inputs)).toEqual(['blowerFault']);
    expect(blowerFaultLines(inputs)).toEqual([0, 1]);
    expect(blowerFaultLines({ ...inputs, blowerPbAuto: false })).toEqual([0]);
    expect(blowerFaultLandAsap(inputs)).toBe(false);
    // With DC ESS BUS FAULT: LAND ASAP, no BLOWER OVRD line
    expect(blowerFaultLines({ ...inputs, dcEssBusFault: true })).toEqual([0]);
    expect(blowerFaultLandAsap({ ...inputs, dcEssBusFault: true })).toBe(true);
    expect(blowerFaultLandAsap({ ...noFailure, dcEssBusFault: true })).toBe(false);
  });

  it('VENT EXTRACT FAULT: "the extract pressure is low"; EXTRACT OVRD until done', () => {
    const inputs = { ...noFailure, extractFanFailed: true };
    expect(triggered(inputs)).toEqual(['extractFault']);
    expect(extractFaultLines(inputs)).toEqual([0, 1]);
    expect(extractFaultLines({ ...inputs, extractPbAuto: false })).toEqual([0]);
  });

  it('VENT SKIN VALVE FAULT: extract valve fully open in phase 3 or in flight, inlet valve not closed in flight', () => {
    const extract = { ...noFailure, skinExtractValveStuckOpen: true };
    expect(triggered(extract)).toEqual(['skinValveFaultExtract']);
    expect(triggered({ ...extract, onGround: true, flightPhase: 3 })).toEqual(['skinValveFaultExtract']);
    // open circuit on the ground before the take-off power: the valves are open
    expect(triggered({ ...extract, onGround: true, flightPhase: 2 })).toEqual([]);
    const inlet = { ...noFailure, skinInletValveStuckOpen: true };
    expect(triggered(inlet)).toEqual(['skinValveFaultInlet']);
    expect(triggered({ ...inlet, onGround: true, flightPhase: 3 })).toEqual([]);
    // both: the extract case with its procedure
    expect(triggered({ ...extract, skinInletValveStuckOpen: true })).toEqual(['skinValveFaultExtract']);
  });

  it('VENT SKIN VALVE FAULT, extract valve: BLOWER and EXTRACT OVRD, then IF UNSUCCESSFUL', () => {
    const extract = { ...noFailure, skinExtractValveStuckOpen: true };
    expect(skinValveFaultExtractLines(extract, true)).toEqual([0, 1, 2]);
    expect(skinValveFaultExtractLines({ ...extract, blowerPbAuto: false }, true)).toEqual([0, 2]);
    const overridden = { ...extract, blowerPbAuto: false, extractPbAuto: false };
    expect(skinValveFaultExtractLines(overridden, true)).toEqual([0, 3, 4, 5, 6]);
    // CAB PR MODE SEL at MAN
    expect(skinValveFaultExtractLines(overridden, false)).toEqual([0, 3, 4, 6]);
  });

  it('AIR AFT CRG VENT FAULT: the failed fan with the isolation valves open', () => {
    expect(triggered({ ...noFailure, aftCargoFanFailed: true })).toEqual(['aftCargoVentFault']);
    // smoke: the valves close and the fan stops
    expect(triggered({ ...noFailure, aftCargoFanFailed: true, aftCargoSmoke: true })).toEqual([]);
    // AFT ISOL VALVE pb-sw OFF: the valves close and the fan stops
    expect(
      triggered({ ...noFailure, aftCargoFanFailed: true, aftIsolValvePbAuto: false, aftCargoIsolValvesOpen: false }),
    ).toEqual([]);
    // valves stuck closed: the fan does not run, the valves disagree
    expect(triggered({ ...noFailure, aftCargoFanFailed: true, ...isolValvesStuckClosed })).toEqual([
      'aftCargoIsolValve',
    ]);
  });

  it('the isolation valves are commanded open with the AFT ISOL VALVE pb-sw in AUTO and no smoke', () => {
    expect(aftCargoIsolValvesCommandedOpen(noFailure)).toBe(true);
    expect(aftCargoIsolValvesCommandedOpen({ ...noFailure, aftIsolValvePbAuto: false })).toBe(false);
    expect(aftCargoIsolValvesCommandedOpen({ ...noFailure, aftCargoSmoke: true })).toBe(false);
  });

  it('COND AFT CRG ISOL VALVE: the systems.wasm valve disagreement, the FAULT light of the pb-sw', () => {
    expect(triggered({ ...noFailure, ...isolValvesStuckClosed })).toEqual(['aftCargoIsolValve']);
    // set OFF (or closed by the smoke detection): the closed valves agree, systems.wasm clears the disagreement
    expect(
      triggered({
        ...noFailure,
        aftIsolValvePbAuto: false,
        aftCargoIsolValvesOpen: false,
        aftCargoIsolValvesDisagree: false,
      }),
    ).toEqual([]);
  });

  it('follows the flyPad failures 21020-21025 (21026 is a systems.wasm failure)', () => {
    const failures = new TestFailures();
    const alerts = new VentilationAlerts(failures);
    alerts.init();
    expect(failures.registered).toEqual(VENTILATION_FAILURES);
    expect(VENTILATION_FAILURES).toEqual([21020, 21021, 21022, 21023, 21024, 21025]);
    const active = (key: string) => alerts.ewdFailures[key].simVarIsActive.get();

    alerts.update(cruiseSystem, true);
    expect(Object.keys(alerts.ewdFailures).filter(active)).toEqual([]);

    failures.active.add(A320Failure.AvionicsBlowerFan);
    failures.active.add(A320Failure.AftCargoExtractionFan);
    alerts.update(cruiseSystem, true);
    expect(Object.keys(alerts.ewdFailures).filter(active)).toEqual([VENT_BLOWER_FAULT_KEY, AIR_AFT_CRG_VENT_FAULT_KEY]);
    expect(alerts.landAsap).toBe(false);

    alerts.update({ ...cruiseSystem, dcEssBusFault: true }, true);
    expect(alerts.landAsap).toBe(true);
  });

  it('the E/WD texts, levels, SD pages and flight phase inhibitions', () => {
    const failures = new TestFailures();
    const alerts = new VentilationAlerts(failures);
    for (const failure of VENTILATION_FAILURES) {
      failures.active.add(failure);
    }
    alerts.update(
      { ...cruiseSystem, blowerPbAuto: false, extractPbAuto: false, aftCargoIsolValvesDisagree: true },
      true,
    );
    const expected: [string, number, number[], string[]][] = [
      [VENT_AVNCS_SYS_FAULT_KEY, 1, [3, 4, 5, 6, 7, 8, 9], ['VENT AVNCS SYS FAULT']],
      [VENT_BLOWER_FAULT_KEY, 2, [3, 4, 5, 7, 8], ['VENT BLOWER FAULT']],
      [VENT_EXTRACT_FAULT_KEY, 2, [3, 4, 5, 7, 8], ['VENT EXTRACT FAULT']],
      [
        VENT_SKIN_VALVE_FAULT_EXTRACT_KEY,
        2,
        [4, 5, 7, 8],
        [
          'VENT SKIN VALVE FAULT',
          '.IF UNSUCCESSFUL :',
          'MAX FL.....100/MEA-MORA',
          '-CAB PR MODE SEL....MAN',
          '-MAN V/S CTL....FULL UP',
        ],
      ],
      [VENT_SKIN_VALVE_FAULT_INLET_KEY, 1, [4, 5, 7, 8], ['VENT SKIN VALVE FAULT']],
      [AIR_AFT_CRG_VENT_FAULT_KEY, 1, [3, 4, 5, 7, 8], ['AIR AFT CRG VENT FAULT']],
      [COND_AFT_CRG_ISOL_VALVE_KEY, 1, [3, 4, 5, 7, 8], ['COND AFT CRG ISOL VALVE']],
    ];
    for (const [key, level, phases, text] of expected) {
      const item = alerts.ewdFailures[key];
      expect(item.failure, key).toBe(level);
      expect(item.sysPage, key).toBe(-1); // SdPages.NONE
      expect(item.flightPhaseInhib, key).toEqual(phases);
      expect(shownText(alerts, key), key).toEqual(text);
      for (const line of formatEwdMessages(item.codesToReturn)) {
        expect(visible(line).length, line).toBeLessThanOrEqual(25);
      }
    }
    // the procedure lines before the OVRD actions
    alerts.update(cruiseSystem, true);
    expect(shownText(alerts, VENT_BLOWER_FAULT_KEY)).toEqual(['VENT BLOWER FAULT', '-BLOWER............OVRD']);
    expect(shownText(alerts, VENT_EXTRACT_FAULT_KEY)).toEqual(['VENT EXTRACT FAULT', '-EXTRACT...........OVRD']);
  });

  it('the STATUS INOP SYS and the SKIN VALVE FAULT manual pressurization', () => {
    const alerts = new VentilationAlerts(new TestFailures());
    expect(statusRight(alerts, VENT_AVNCS_SYS_FAULT_KEY)).toEqual(['INOP SYS', 'AVNCS VENT']);
    expect(statusRight(alerts, VENT_BLOWER_FAULT_KEY)).toEqual(['INOP SYS', 'VENT BLOWER']);
    expect(statusRight(alerts, VENT_EXTRACT_FAULT_KEY)).toEqual(['INOP SYS', 'VENT EXTRACT']);
    expect(statusRight(alerts, VENT_SKIN_VALVE_FAULT_INLET_KEY)).toEqual(['INOP SYS', 'AVNCS VALVE']);
    expect(statusRight(alerts, AIR_AFT_CRG_VENT_FAULT_KEY)).toEqual(['INOP SYS', 'AFT CRG VENT']);
    expect(statusRight(alerts, COND_AFT_CRG_ISOL_VALVE_KEY)).toEqual(['INOP SYS', 'AFT CRG VENT']);
    const skin = alerts.ewdFailures[VENT_SKIN_VALVE_FAULT_EXTRACT_KEY];
    const page = formatStatusPage(skin.statusInfo(), skin.inopSys());
    expect(visible(page.right).split('\r')).toEqual(['INOP SYS', 'AVNCS VALVE']);
    const left = visible(page.left).split('\r');
    expect(left[0]).toBe('MAX FL.....100/MEA-MORA');
    expect(left).toContain('MAN CAB PR CTL');
    expect(left).toContain('TGT V/S: CLIMB 500 FT/MN');
    expect(left).toContain('<200              0');
    expect(left).not.toContain('DURING FINAL APPR:');
  });

  it('the PseudoFWC registers, updates and shows the alerts, and adds the LAND ASAP of BLOWER FAULT', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.ventilationAlerts.init();');
    expect(fwc).toContain('this.ventilationAlerts.update(');
    expect(fwc).toContain('...this.ventilationAlerts.ewdFailures,');
    expect(fwc).toContain('this.elecBusAlerts.landAsap || this.ventilationAlerts.landAsap');
  });
});
