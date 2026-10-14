// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  avionicsBaySmokeAlerts,
  avionicsSmokeItemsChecked,
  CARGO_BOTTLE_FAULT_INOP_SYS,
  cargoSmokeItemsChecked,
  cargoSmokeItemsToShow,
  CargoSmokeTest,
  SDF_FAULT_ALERT,
  SDF_FAULT_INOP_SYS,
  SDF_FAULT_ITEMS_TO_SHOW,
  SDF_FAULT_PHASE_INHIBITION,
  sdfFaultItemsChecked,
  SdfFaultProcedureState,
  SMOKE_ZONES,
  SmokeProcedureState,
  smokeWarnings,
  smokeWarningsWithTest,
} from './SmokeAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata26 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata26.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** The number of items of an ata26.ts procedure */
function itemCount(id: string): number {
  const start = ata26.indexOf(`  ${id}: {`);
  expect(start, id).toBeGreaterThan(0);
  const end = ata26.indexOf('\n  },', start);
  return (ata26.slice(start, end).match(/ name: '/g) ?? []).length;
}

/** The title of an ata26.ts procedure, without its formatting */
function title(id: string): string {
  const start = ata26.indexOf(`  ${id}: {`);
  const match = ata26.slice(start).match(/title: '([^']*)'/);
  return (match ? match[1] : '').replace(/\\x1b<\dm|\\x1b4m|\\x1bm/g, '');
}

const state: SmokeProcedureState = {
  cabFansOn: true,
  galleyOff: false,
  signsOn: false,
  oneEngineRunning: true,
  isolValvesPbOn: true,
  agentDischarged: false,
};

const noSmoke = SMOKE_ZONES.map(() => false);
const smokeIn = (...zones: string[]) => SMOKE_ZONES.map((smokeZone) => zones.includes(smokeZone.zone));
const warningsOf = (warnings: boolean[]) => SMOKE_ZONES.filter((_, index) => warnings[index]).map((zone) => zone.zone);

describe('A380X SMOKE alerts of the SDF (A380 FCOM PRO-ABN-ECAM-10-26, PDF p.4982-5007)', () => {
  it('each compartment has its own SMOKE warning and DET FAULT caution, with the right titles', () => {
    const titles: Record<string, [string, string]> = {
      FWD_CARGO: ['SMOKE FWD CARGO SMOKE', 'SMOKE FWD CARGO DET FAULT'],
      AFT_CARGO: ['SMOKE AFT CARGO SMOKE', 'SMOKE AFT CARGO DET FAULT'],
      BULK_CARGO: ['SMOKE BULK CARGO SMOKE', 'SMOKE BULK CARGO DET FAULT'],
      L_MAIN_AVNCS: ['SMOKE L MAIN AVNCS SMOKE', 'SMOKE L MAIN AVNCS DET FAULT'],
      R_MAIN_AVNCS: ['SMOKE R MAIN AVNCS SMOKE', 'SMOKE R MAIN AVNCS DET FAULT'],
      L_UPPER_AVNCS: ['SMOKE L UPPER AVNCS SMOKE', 'SMOKE L UPPER AVNCS DET FAULT'],
      R_UPPER_AVNCS: ['SMOKE R UPPER AVNCS SMOKE', 'SMOKE R UPPER AVNCS DET FAULT'],
      AFT_AVNCS: ['SMOKE AFT AVNCS SMOKE', 'SMOKE AFT AVNCS DET FAULT'],
      IFE_BAY: ['SMOKE IFE BAY SMOKE', 'SMOKE IFE BAY DET FAULT'],
    };
    expect(SMOKE_ZONES.map((zone) => zone.zone)).toEqual(Object.keys(titles));
    for (const zone of SMOKE_ZONES) {
      expect([title(zone.smokeAlert), title(zone.detFaultAlert)]).toEqual(titles[zone.zone]);
    }
  });

  it('the DET FAULT INOP SYS lines are the SMK DET of the compartment (PDF p.4983, 4993, 5005)', () => {
    const inopSys = (id: string) => messageIndex.match(new RegExp(`  ${id}: '\\\\x1b<4m([^']*)'`))?.[1];
    expect(SMOKE_ZONES.map((zone) => inopSys(zone.detFaultInopSys))).toEqual([
      'FWD CARGO SMK DET',
      'AFT CARGO SMK DET',
      'AFT CARGO SMK DET',
      'L MAIN AVNCS SMK DET',
      'R MAIN AVNCS SMK DET',
      'L UPPR AVNCS SMK DET',
      'R UPPR AVNCS SMK DET',
      'AFT AVNCS SMK DET',
      'IFE BAY SMK DET',
    ]);
    expect(CARGO_BOTTLE_FAULT_INOP_SYS.map(inopSys)).toEqual(['FWD+AFT CRGs BTL 1', 'FWD+AFT CRGs BTL 2']);
  });

  it('MAIN AND UPPER AVIONICS: upper bay smoke gives UPPER, main bay smoke alone gives MAIN (PDF p.1792)', () => {
    expect(avionicsBaySmokeAlerts(false, false)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: false });
    expect(avionicsBaySmokeAlerts(false, true)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: true });
    expect(avionicsBaySmokeAlerts(true, false)).toEqual({ mainAvncsSmoke: true, upperAvncsSmoke: false });
    expect(avionicsBaySmokeAlerts(true, true)).toEqual({ mainAvncsSmoke: false, upperAvncsSmoke: true });
  });

  it('smokeWarnings applies the avionics bay logic per side and passes the other compartments through', () => {
    expect(warningsOf(smokeWarnings(noSmoke))).toEqual([]);
    expect(warningsOf(smokeWarnings(smokeIn('BULK_CARGO')))).toEqual(['BULK_CARGO']);
    expect(warningsOf(smokeWarnings(smokeIn('L_MAIN_AVNCS', 'L_UPPER_AVNCS', 'R_MAIN_AVNCS')))).toEqual([
      'R_MAIN_AVNCS',
      'L_UPPER_AVNCS',
    ]);
  });

  it('CARGO SMOKE: AGENT DISCH after the CRG CLOSED condition with all engines shut down, else directly (PDF p.5002)', () => {
    expect(cargoSmokeItemsToShow(state)).toEqual([true, false, false, true, true, true, true, true]);
    expect(cargoSmokeItemsToShow({ ...state, oneEngineRunning: false })).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(cargoSmokeItemsChecked(state)).toEqual([false, false, false, false, false, false, false, false]);
    expect(
      cargoSmokeItemsChecked({
        ...state,
        isolValvesPbOn: false,
        agentDischarged: true,
        cabFansOn: false,
        signsOn: true,
      }),
    ).toEqual([true, false, true, true, true, true, false, false]);
  });

  it('every item list matches its ata26.ts procedure', () => {
    for (const id of ['260800045', '260800046', '260800047']) {
      expect(cargoSmokeItemsToShow(state)).toHaveLength(itemCount(id));
      expect(cargoSmokeItemsChecked(state)).toHaveLength(itemCount(id));
    }
    expect(avionicsSmokeItemsChecked(state, false, false)).toHaveLength(itemCount('260800030'));
    expect(avionicsSmokeItemsChecked(state, false, true)).toHaveLength(itemCount('260800038'));
    expect(avionicsSmokeItemsChecked(state, false, true)).toHaveLength(itemCount('260800039'));
    expect(avionicsSmokeItemsChecked(state, true, false)).toHaveLength(itemCount('260800040'));
    expect(avionicsSmokeItemsChecked(state, true, false)).toHaveLength(itemCount('260800041'));
    expect(itemCount('260800033')).toBe(3);
    expect(itemCount('260800048')).toBe(2);
    expect(itemCount('260800049')).toBe(3);
    expect(itemCount('260800050')).toBe(3);
    expect(itemCount('260800052')).toBe(0);
    expect(itemCount('260800053')).toBe(0);
  });

  it('avionics smoke items: CAB FANS OFF, GALLEY OFF and SIGNS ON are sensed', () => {
    const done = { ...state, cabFansOn: false, galleyOff: true, signsOn: true };
    expect(avionicsSmokeItemsChecked(done, false, true)).toEqual([false, true, true, true, false, false]);
    expect(avionicsSmokeItemsChecked(done, true, false)).toEqual([false, true, true, false, true, false, false, false]);
  });

  it('reads the SDF variables of systems.wasm and wires the alerts', () => {
    const smokeDetection = readFileSync(
      resolve(
        __dirname,
        '../../../../../../fbw-common/src/wasm/systems/systems/src/fire_protection/smoke_detection.rs',
      ),
      'utf8',
    );
    expect(smokeDetection).toContain('format!("SMOKE_{}_DETECTED", zone)');
    expect(smokeDetection).toContain('format!("SMOKE_{}_DET_FAULT", zone)');
    expect(fwsCore).toContain('`L:A32NX_SMOKE_${smokeZone.zone}_DETECTED`');
    expect(fwsCore).toContain('`L:A32NX_SMOKE_${smokeZone.zone}_DET_FAULT`');
    expect(fwsCore).toContain('`L:A32NX_CARGOSMOKE_BOTTLE_${index + 1}_LOW_PRESSURE`');
    expect(abnormalSensed).toContain('...this.smokeAlerts(),');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.smokeZoneWarning[index],');
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.smokeZoneDetFault[index],');
    expect(abnormalSensed).toContain('alerts[260800052 + index] = {');
  });
});

describe('SMOKE DET FAULT, the SDF failed (A380 FCOM PRO-ABN-ECAM-10-26, l.143733-143783, PDF p.4988-4989)', () => {
  const sdfState: SdfFaultProcedureState = { ifecOff: false, fwdIsolValvesPbOn: true, bulkIsolValvesPbOn: true };

  it('is inhibited in flight phases 3 to 7, 9 and 10 (PDF p.4988)', () => {
    expect(SDF_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('shows the FCOM lines (no CWS line), IFEC and the ISOL VALVES are sensed', () => {
    expect(SDF_FAULT_ITEMS_TO_SHOW).toHaveLength(itemCount(SDF_FAULT_ALERT));
    expect(SDF_FAULT_ITEMS_TO_SHOW).toEqual([true, false, true, true, true, true]);
    expect(sdfFaultItemsChecked(sdfState)).toEqual([false, false, false, false, false, false]);
    expect(sdfFaultItemsChecked({ ifecOff: true, fwdIsolValvesPbOn: false, bulkIsolValvesPbOn: false })).toEqual([
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(title(SDF_FAULT_ALERT)).toBe('SMOKE DET FAULT');
    expect(ata26).toContain("name: 'NO LIVESTOCK',");
    expect(ata26).not.toContain('LIFESTOCK');
  });

  it('INOP SYS: ALL SMOKE DET, FWD CRG VENT, FWD CGR TEMP REGUL, BULK CRG VENT, BULK CRG HEATER (l.143773-143779)', () => {
    const inopSys = (id: string) => messageIndex.match(new RegExp(`  ${id}: '\\\\x1b<4m([^']*)'`))?.[1];
    expect(SDF_FAULT_INOP_SYS.map(inopSys)).toEqual([
      'ALL SMOKE DET',
      'FWD CRG VENT',
      'FWD CGR TEMP REGUL',
      'BULK CRG VENT',
      'BULK CRG HEATER',
    ]);
  });

  it('reads the SDF failure of systems.wasm and wires the alert with SC and MASTER CAUT', () => {
    const a380Smoke = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/fire_and_smoke_protection.rs'),
      'utf8',
    );
    expect(a380Smoke).toContain('"SMOKE_DETECTION_FUNCTION_FAULT"');
    expect(fwsCore).toContain("'L:A32NX_SMOKE_DETECTION_FUNCTION_FAULT'");
    const entry = abnormalSensed.slice(abnormalSensed.indexOf('    alerts[SDF_FAULT_ALERT] = {'));
    expect(abnormalSensed.indexOf('    alerts[SDF_FAULT_ALERT] = {')).toBeGreaterThan(0);
    expect(entry).toMatch(/simVarIsActive: this\.fws\.smokeDetectionFunctionFault,[\s\S]*?failure: 2,/);
    expect(entry).toContain('inopSysAllPhases: () => SDF_FAULT_INOP_SYS,');
  });
});

describe('Cargo smoke TEST pb (A380 FCOM DSC-26-60-20, l.53960-53973)', () => {
  /** Holds the TEST pb for a time, in 100 ms steps, and returns whether the test runs */
  function holdFor(test: CargoSmokeTest, seconds: number): boolean {
    let active = test.update(true, 0);
    for (let t = 0; t < Math.round(seconds * 10); t++) {
      active = test.update(true, 100);
    }
    return active;
  }

  it('runs after the TEST pb is held 3 s, until it is released', () => {
    const test = new CargoSmokeTest();
    expect(holdFor(test, 2.9)).toBe(false);
    expect(holdFor(test, 0.1)).toBe(true);
    expect(test.update(false, 100)).toBe(false);
    // a new press starts the 3 s again
    expect(holdFor(test, 1)).toBe(false);
  });

  it('shows the cargo SMOKE and AVNCS SMOKE warnings, not IFE BAY, with the avionics bay logic', () => {
    expect(warningsOf(smokeWarningsWithTest(noSmoke, true, false))).toEqual([
      'FWD_CARGO',
      'AFT_CARGO',
      'BULK_CARGO',
      'L_UPPER_AVNCS',
      'R_UPPER_AVNCS',
      'AFT_AVNCS',
    ]);
    expect(warningsOf(smokeWarningsWithTest(noSmoke, false, false))).toEqual([]);
    expect(warningsOf(smokeWarningsWithTest(smokeIn('IFE_BAY'), false, false))).toEqual(['IFE_BAY']);
  });

  it('a failed SDF cannot run the test', () => {
    expect(warningsOf(smokeWarningsWithTest(noSmoke, true, true))).toEqual([]);
  });

  it('FwsCore feeds the 3 s test into the SMOKE warnings', () => {
    expect(fwsCore).toContain('this.cargoSmokeTest.update(');
    expect(fwsCore).toContain("SimVar.GetSimVarValue('L:A32NX_FIRE_TEST_CARGO', SimVarValueType.Bool) > 0,");
    expect(fwsCore).toMatch(
      /smokeWarningsWithTest\(\s*this\.smokeZoneDetected\.map\(\(detected\) => detected\.get\(\)\),\s*cargoSmokeTestActive,/,
    );
  });

  it('the VENT AVNCS SMOKE light comes on with the TEST pb (l.53973)', () => {
    const cockpit = readFileSync(
      resolve(
        __dirname,
        '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml',
      ),
      'utf8',
    );
    const vent = cockpit.slice(cockpit.indexOf('<NODE_ID>PUSH_OVHD_VENTILATION_SMOKE</NODE_ID>'));
    expect(vent.slice(0, vent.indexOf('</UseTemplate>'))).toContain(
      '<SEQ1_CODE>(L:A32NX_VENTILATION_BLOWER_FAULT, Bool) (L:A32NX_FIRE_TEST_CARGO, Bool) or</SEQ1_CODE>',
    );
  });
});
