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
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle, withoutEcamCodes, procedureItemNames } from './FwsSpecFixture';

const { core, simVars } = createFws(new Set());
const alert = (id: string | number) => core.abnormalSensed.ewdAbnormalSensed[String(id)];

/** The number of items of an ECAM procedure */
function itemCount(id: string): number {
  return EcamAbnormalProcedures[id].items.length;
}

/** The title of an ECAM procedure, without its formatting */
function title(id: string): string {
  return withoutEcamCodes(EcamAbnormalProcedures[id].title);
}

/** The text of an INOP SYS line, without its colour code */
function inopSys(id: string): string | undefined {
  return EcamInopSys[id] === undefined ? undefined : withoutEcamCodes(EcamInopSys[id]);
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

describe('A380X SMOKE alerts of the SDF', () => {
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

  it('the DET FAULT INOP SYS lines are the SMK DET of the compartment', () => {
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

  it('MAIN AND UPPER AVIONICS: upper bay smoke gives UPPER, main bay smoke alone gives MAIN', () => {
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

  it('CARGO SMOKE: AGENT DISCH after the CRG CLOSED condition with all engines shut down, else directly', () => {
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

  it('every item list matches its ECAM procedure', () => {
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

  it('reads the SDF variables of systems.wasm', () => {
    // The variable names exist only in the Rust source of the SDF, so that source text is read
    const smokeDetection = readFileSync(
      resolve(
        __dirname,
        '../../../../../../fbw-common/src/wasm/systems/systems/src/fire_protection/smoke_detection.rs',
      ),
      'utf8',
    );
    expect(smokeDetection).toContain('format!("SMOKE_{}_DETECTED", zone)');
    expect(smokeDetection).toContain('format!("SMOKE_{}_DET_FAULT", zone)');
  });

  it('wires the SMOKE and DET FAULT alerts of each compartment to the signals of the SDF variables', () => {
    SMOKE_ZONES.forEach((smokeZone, index) => {
      expect(alert(smokeZone.smokeAlert).simVarIsActive).toBe(core.smokeZoneWarning[index]);
      expect(alert(smokeZone.detFaultAlert).simVarIsActive).toBe(core.smokeZoneDetFault[index]);
    });
    expect(alert(260800052).simVarIsActive).toBe(core.cargoBottleLowPressure[0]);
    expect(alert(260800053).simVarIsActive).toBe(core.cargoBottleLowPressure[1]);
  });

  it('raises each signal from its SDF variable', () => {
    SMOKE_ZONES.forEach((smokeZone, index) => {
      simVars.set(`L:A32NX_SMOKE_${smokeZone.zone}_DETECTED`, true);
      simVars.set(`L:A32NX_SMOKE_${smokeZone.zone}_DET_FAULT`, true);
      runFwsCycle(core);
      expect(core.smokeZoneDetFault[index].get(), smokeZone.zone).toBe(true);
      expect(core.smokeZoneDetected[index].get(), smokeZone.zone).toBe(true);
      simVars.set(`L:A32NX_SMOKE_${smokeZone.zone}_DETECTED`, false);
      simVars.set(`L:A32NX_SMOKE_${smokeZone.zone}_DET_FAULT`, false);
    });
    simVars.set('L:A32NX_CARGOSMOKE_BOTTLE_2_LOW_PRESSURE', true);
    runFwsCycle(core);
    expect(core.cargoBottleLowPressure.map((lowPressure) => lowPressure.get())).toEqual([false, true]);
    simVars.set('L:A32NX_CARGOSMOKE_BOTTLE_2_LOW_PRESSURE', false);
    runFwsCycle(core);
  });
});

describe('SMOKE DET FAULT, the SDF failed', () => {
  const sdfState: SdfFaultProcedureState = { ifecOff: false, fwdIsolValvesPbOn: true, bulkIsolValvesPbOn: true };

  it('is inhibited in flight phases 3 to 7, 9 and 10', () => {
    expect(SDF_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('shows the lines (no CWS line), IFEC and the ISOL VALVES are sensed', () => {
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
    const itemNames = procedureItemNames(SDF_FAULT_ALERT);
    expect(itemNames).toContain('NO LIVESTOCK');
    expect(itemNames).not.toContain('NO LIFESTOCK');
  });

  it('INOP SYS: ALL SMOKE DET, FWD CRG VENT, FWD CGR TEMP REGUL, BULK CRG VENT, BULK CRG HEATER', () => {
    expect(SDF_FAULT_INOP_SYS.map(inopSys)).toEqual([
      'ALL SMOKE DET',
      'FWD CRG VENT',
      'FWD CGR TEMP REGUL',
      'BULK CRG VENT',
      'BULK CRG HEATER',
    ]);
  });

  it('reads the SDF failure of systems.wasm', () => {
    // The variable name exists only in the Rust source of the SDF, so that source text is read
    const a380Smoke = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/fire_and_smoke_protection.rs'),
      'utf8',
    );
    expect(a380Smoke).toContain('"SMOKE_DETECTION_FUNCTION_FAULT"');
  });

  it('wires the alert with SC and MASTER CAUT to the SDF failure', () => {
    const entry = alert(SDF_FAULT_ALERT);
    expect(entry.simVarIsActive).toBe(core.smokeDetectionFunctionFault);
    expect(entry.failure).toBe(2);
    expect(entry.inopSysAllPhases!([])).toEqual(SDF_FAULT_INOP_SYS);
    simVars.set('L:A32NX_SMOKE_DETECTION_FUNCTION_FAULT', true);
    runFwsCycle(core);
    expect(core.smokeDetectionFunctionFault.get()).toBe(true);
    simVars.set('L:A32NX_SMOKE_DETECTION_FUNCTION_FAULT', false);
    runFwsCycle(core);
  });
});

describe('Cargo smoke TEST pb', () => {
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

  it('the FWS runs the SMOKE warnings with the TEST pb held 3 s', () => {
    const cargoIndex = SMOKE_ZONES.findIndex((smokeZone) => smokeZone.zone === 'FWD_CARGO');
    simVars.set('L:A32NX_FIRE_TEST_CARGO', true);
    runFwsCycle(core);
    expect(core.smokeZoneWarning[cargoIndex].get()).toBe(false);
    for (let second = 0; second < 4; second++) {
      runFwsCycle(core);
    }
    expect(core.smokeZoneWarning[cargoIndex].get()).toBe(true);
    simVars.set('L:A32NX_FIRE_TEST_CARGO', false);
    runFwsCycle(core);
    expect(core.smokeZoneWarning[cargoIndex].get()).toBe(false);
  });

  it('the VENT AVNCS SMOKE light comes on with the TEST pb', () => {
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
