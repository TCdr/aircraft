// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/EcamSystemPages';
import {
  CABIN_SMOKE_ALERT_KEYS,
  CABIN_SMOKE_INOP_SYS,
  CABIN_SMOKE_PHASE_INHIBITION,
  CabinSmokeAlerts,
  CabinSmokeInputs,
  cabinSmokeAbnormalItems,
  cargoBottlesFaults,
  readCabinSmokeInputs,
} from './FwsCabinSmokeAlerts';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const ESCAPE = String.fromCharCode(27);
const COLOR_CODES = new RegExp(`${ESCAPE}(<\\dm|4m|m)`, 'g');

/** Title (without the color codes), title color and item names of an alert of the ECAM table */
function alertText(key: number): { title: string; color: string; items: string[] } {
  const procedure = EcamAbnormalProcedures[String(key)];
  expect(procedure).toBeDefined();
  return {
    title: procedure.title.replace(COLOR_CODES, ''),
    color: procedure.title.charAt(2),
    items: procedure.items.map((item) => item.name),
  };
}

function inopSysText(id: string): string {
  return (EcamInopSys[id] ?? '').replace(`${ESCAPE}<4m`, '');
}

function normal(): CabinSmokeInputs {
  return {
    lavatorySmoke: [false, false, false],
    lavatoryDetFault: [false, false, false],
    flightRestSmoke: [false, false],
    flightRestDetFault: [false, false],
    aftLowerRestSmoke: false,
    aftLowerRestDetFault: false,
    aftLowerRestBottleFault: [false, false],
    ifeControlCenterSmoke: [false, false, false],
    ifeControlCenterDetFault: [false, false, false],
    facilitiesDetFault: false,
    safetyTestRequired: false,
    diverterValveFault: [false, false],
    cargoBottleControlFault: false,
    cabFansOn: true,
  };
}

function itemsWith(inputs: Partial<CabinSmokeInputs>) {
  const alerts = new CabinSmokeAlerts();
  alerts.update({ ...normal(), ...inputs });
  return cabinSmokeAbnormalItems(alerts);
}

function activeKeys(inputs: Partial<CabinSmokeInputs>): number[] {
  const items = itemsWith(inputs);
  return Object.keys(items)
    .map(Number)
    .filter((key) => items[key].simVarIsActive.get());
}

const keys = CABIN_SMOKE_ALERT_KEYS;

describe('SMOKE cabin areas, SDF status and cargo bottles alerts', () => {
  it('raises no alert on a normal aircraft', () => {
    expect(activeKeys({})).toEqual([]);
  });

  it.each([
    [{ lavatorySmoke: [false, true, false] }, keys.lavatorySmoke[1]],
    [{ lavatoryDetFault: [false, false, true] }, keys.lavatoryDetFault[2]],
    [{ flightRestSmoke: [false, true] }, keys.flightRestSmoke],
    [{ flightRestSmoke: [true, false] }, keys.flightRestSmoke],
    [{ flightRestDetFault: [true, false] }, keys.flightRestDetFault],
    [{ aftLowerRestSmoke: true }, keys.aftLowerRestSmoke],
    [{ aftLowerRestDetFault: true }, keys.aftLowerRestDetFault],
    [{ aftLowerRestBottleFault: [false, true] }, keys.aftLowerRestBottleFault[1]],
    [{ ifeControlCenterSmoke: [true, false, false] }, keys.ifeControlCenterSmoke[0]],
    [{ ifeControlCenterDetFault: [false, false, true] }, keys.ifeControlCenterDetFault[2]],
    [{ facilitiesDetFault: true }, keys.facilitiesDetFault],
    [{ safetyTestRequired: true }, keys.safetyTestRequired],
    [{ diverterValveFault: [true, false] }, keys.cargoBottlesFault[0]],
    [{ diverterValveFault: [false, true] }, keys.cargoBottlesFault[1]],
    [{ cargoBottleControlFault: true }, keys.fwdAftCargoBottlesFault],
  ] as [Partial<CabinSmokeInputs>, number][])('%o raises %d only', (inputs, key) => {
    expect(activeKeys(inputs)).toEqual([key]);
  });

  it('gives FWD+AFT CARGOS BOTTLES FAULT, not the FWD and AFT ones, when the valve can take neither position', () => {
    expect(cargoBottlesFaults([true, true], false)).toEqual({ fwdAft: true, perPosition: [false, false] });
    expect(cargoBottlesFaults([true, false], true)).toEqual({ fwdAft: true, perPosition: [false, false] });
    expect(activeKeys({ diverterValveFault: [true, true] })).toEqual([keys.fwdAftCargoBottlesFault]);
  });

  it('reads the SDF L:vars of each zone', () => {
    const on = new Set([
      'L:A32NX_SMOKE_UPPER_DECK_LAV_DETECTED',
      'L:A32NX_SMOKE_FLT_REST_2_DET_FAULT',
      'L:A32NX_SMOKE_AFT_LWR_CAB_REST_DETECTED',
      'L:A32NX_SMOKE_AFT_LWR_CAB_REST_BTL_1_FAULT',
      'L:A32NX_SMOKE_UPPER_3R_RCC_DETECTED',
      'L:A32NX_SMOKE_MAIN_1L_CWS_DET_FAULT',
      'L:A32NX_SMOKE_FACILITIES_DET_FAULT',
      'L:A32NX_SMOKE_SAFETY_TEST_REQUIRED',
      'L:A32NX_CARGOSMOKE_DIVERTER_VALVE_AFT_FAULT',
      'L:A32NX_CARGOSMOKE_BOTTLE_CONTROL_FAULT',
    ]);
    const inputs = readCabinSmokeInputs((name) => (on.has(name) ? 1 : 0));
    expect(inputs.lavatorySmoke).toEqual([false, true, false]);
    expect(inputs.flightRestDetFault).toEqual([false, true]);
    expect(inputs.aftLowerRestSmoke).toBe(true);
    expect(inputs.aftLowerRestBottleFault).toEqual([true, false]);
    expect(inputs.ifeControlCenterSmoke).toEqual([false, false, true]);
    expect(inputs.ifeControlCenterDetFault).toEqual([true, false, false]);
    expect(inputs.facilitiesDetFault).toBe(true);
    expect(inputs.safetyTestRequired).toBe(true);
    expect(inputs.diverterValveFault).toEqual([false, true]);
    expect(inputs.cargoBottleControlFault).toBe(true);
    expect(inputs.cabFansOn).toBe(false);
  });
});

describe('SMOKE cabin areas alerts: titles, lines, levels, phases and STATUS', () => {
  const items = itemsWith({});

  it.each([
    [keys.facilitiesDetFault, 'SMOKE FACILITIES DET FAULT'],
    [keys.flightRestDetFault, 'SMOKE FLT REST DET FAULT'],
    [keys.flightRestSmoke, 'SMOKE FLT REST SMOKE'],
    [keys.cargoBottlesFault[0], 'SMOKE FWD CARGO BOTTLES FAULT'],
    [keys.cargoBottlesFault[1], 'SMOKE AFT CARGO BOTTLES FAULT'],
    [keys.fwdAftCargoBottlesFault, 'SMOKE FWD+AFT CARGO BOTTLES FAULT'],
    [keys.lavatoryDetFault[0], 'SMOKE MAIN DECK LAVATORY DET FAULT'],
    [keys.lavatoryDetFault[1], 'SMOKE UPPER DECK LAVATORY DET FAULT'],
    [keys.lavatoryDetFault[2], 'SMOKE LOWER DECK LAVATORY DET FAULT'],
    [keys.lavatorySmoke[0], 'SMOKE MAIN DECK LAVATORY SMOKE'],
    [keys.lavatorySmoke[1], 'SMOKE UPPER DECK LAVATORY SMOKE'],
    [keys.lavatorySmoke[2], 'SMOKE LOWER DECK LAVATORY SMOKE'],
    [keys.ifeControlCenterDetFault[0], 'SMOKE MAIN 1L CWS DET FAULT'],
    [keys.ifeControlCenterDetFault[1], 'SMOKE UPPER 1L CWS DET FAULT'],
    [keys.ifeControlCenterDetFault[2], 'SMOKE UPPER 3R RCC DET FAULT'],
    [keys.ifeControlCenterSmoke[0], 'SMOKE MAIN 1L CWS SMOKE'],
    [keys.ifeControlCenterSmoke[1], 'SMOKE UPPER 1L CWS SMOKE'],
    [keys.ifeControlCenterSmoke[2], 'SMOKE UPPER 3R RCC SMOKE'],
    [keys.safetyTestRequired, 'SMOKE SAFETY TEST REQUIRED'],
    [keys.aftLowerRestBottleFault[0], 'SMOKE AFT LWR CAB REST BTL 1 FAULT'],
    [keys.aftLowerRestBottleFault[1], 'SMOKE AFT LWR CAB REST BTL 2 FAULT'],
    [keys.aftLowerRestDetFault, 'SMOKE AFT LWR CAB REST DET FAULT'],
    [keys.aftLowerRestSmoke, 'SMOKE AFT LWR CAB REST SMOKE'],
  ])('%d is %s, with one shown/checked flag per line of the procedure', (key, title) => {
    const text = alertText(key);
    expect(text.title).toBe(title);
    expect(items[key].whichItemsToShow()).toHaveLength(text.items.length);
    expect(items[key].whichItemsChecked()).toHaveLength(text.items.length);
  });

  it('shows only the CKPT / CABIN COM line where the procedure has more lines than the alert shows', () => {
    const shownNames = (key: number) => alertText(key).items.filter((_, index) => items[key].whichItemsToShow()[index]);
    const ckptCabinComOnly = [
      keys.facilitiesDetFault,
      keys.flightRestSmoke,
      ...keys.lavatorySmoke,
      ...keys.ifeControlCenterDetFault,
      ...keys.ifeControlCenterSmoke,
    ];
    for (const key of ckptCabinComOnly) {
      expect(shownNames(key)).toEqual(['CKPT / CABIN COM']);
    }
    expect(shownNames(keys.aftLowerRestSmoke)).toEqual(['CAB FANS', 'CKPT / CABIN COM', 'FIRE PERSISTS', 'LAND ASAP']);
  });

  it('checks CAB FANS OFF of AFT LWR CAB REST SMOKE from the CAB FANS pb', () => {
    expect(itemsWith({ cabFansOn: true })[keys.aftLowerRestSmoke].whichItemsChecked()[0]).toBe(false);
    expect(itemsWith({ cabFansOn: false })[keys.aftLowerRestSmoke].whichItemsChecked()[0]).toBe(true);
  });

  it('gives the SMOKE warnings in red with CRC and the COND page for the lower deck crew rest', () => {
    const warnings = [
      keys.flightRestSmoke,
      keys.aftLowerRestSmoke,
      ...keys.lavatorySmoke,
      ...keys.ifeControlCenterSmoke,
    ];
    for (const key of warnings) {
      expect(items[key].failure).toBe(3);
      expect(alertText(key).color).toBe('2');
    }
    expect(items[keys.aftLowerRestSmoke].sysPage).toBe(SdPages.Cond);
    expect(items[keys.flightRestSmoke].sysPage).toBe(SdPages.None);
  });

  it('gives SC and MASTER CAUT to FACILITIES DET FAULT and the cargo BOTTLES FAULT only', () => {
    const cautions = [keys.facilitiesDetFault, ...keys.cargoBottlesFault, keys.fwdAftCargoBottlesFault];
    const crewAwareness = [
      keys.flightRestDetFault,
      keys.aftLowerRestDetFault,
      keys.safetyTestRequired,
      ...keys.aftLowerRestBottleFault,
      ...keys.lavatoryDetFault,
      ...keys.ifeControlCenterDetFault,
    ];
    cautions.forEach((key) => expect(items[key].failure).toBe(2));
    crewAwareness.forEach((key) => expect(items[key].failure).toBe(1));
  });

  it('applies the flight phase inhibitions', () => {
    const phases = CABIN_SMOKE_PHASE_INHIBITION;
    expect(items[keys.lavatorySmoke[0]].flightPhaseInhib).toEqual([4, 5, 6, 7, 9, 10]);
    expect(items[keys.flightRestSmoke].flightPhaseInhib).toEqual([4, 5, 6, 9, 10]);
    expect(items[keys.aftLowerRestSmoke].flightPhaseInhib).toEqual([4, 5, 6, 9, 10]);
    expect(items[keys.ifeControlCenterSmoke[2]].flightPhaseInhib).toEqual([4, 5, 6, 9, 10]);
    expect(items[keys.lavatoryDetFault[1]].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10, 11]);
    expect(items[keys.aftLowerRestBottleFault[0]].flightPhaseInhib).toEqual(phases.detFault);
    expect(items[keys.facilitiesDetFault].flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(items[keys.safetyTestRequired].flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(items[keys.fwdAftCargoBottlesFault].flightPhaseInhib).toEqual([4, 5, 6, 7, 9, 10]);
  });

  it.each([
    [keys.facilitiesDetFault, ['FACILITIES SMK DET']],
    [keys.flightRestDetFault, ['FLT REST SMK DET']],
    [keys.aftLowerRestDetFault, ['AFT LWR REST SMK DET']],
    [keys.aftLowerRestBottleFault[1], ['AFT LWR REST BTL 2']],
    [keys.aftLowerRestSmoke, ['ALL PRIMARY CAB FANS']],
    [keys.lavatoryDetFault[2], ['LOWER LAV SMK DET']],
    [keys.ifeControlCenterDetFault[0], ['M1L CWS SMK DET']],
    [keys.ifeControlCenterDetFault[1], ['U1L CWS SMK DET']],
    [keys.ifeControlCenterDetFault[2], ['U3R RCC SMK DET']],
    [keys.cargoBottlesFault[1], ['AFT CARGO BTLs']],
    [keys.fwdAftCargoBottlesFault, ['FWD CARGO BTLs', 'AFT CARGO BTLs']],
  ])('%d STATUS INOP SYS: %o', (key, lines) => {
    expect((items[key].inopSysAllPhases?.([]) ?? []).map((id) => inopSysText(id ?? ''))).toEqual(lines);
  });

  it('has no STATUS for the SMOKE warnings without one and for SAFETY TEST REQUIRED', () => {
    for (const key of [
      keys.flightRestSmoke,
      keys.safetyTestRequired,
      ...keys.lavatorySmoke,
      ...keys.ifeControlCenterSmoke,
    ]) {
      expect(items[key].inopSysAllPhases).toBeUndefined();
    }
    expect(CABIN_SMOKE_INOP_SYS.aftLowerRestSmoke).toBe('210300012');
  });
});

describe('FWS wiring of the cabin smoke alerts', () => {
  it('lists the alerts of the cabin smoke state of the core in the abnormal sensed table', () => {
    const { core } = createFws();
    const tableItems = cabinSmokeAbnormalItems(core.cabinSmokeAlerts);
    for (const key of Object.keys(tableItems).map(Number)) {
      const listed = core.abnormalSensed.ewdAbnormalSensed[key];
      expect(listed, String(key)).toBeDefined();
      expect(listed.simVarIsActive, String(key)).toBe(tableItems[key].simVarIsActive);
    }
  });

  it('refreshes the alert state every FWS cycle from the SDF L:vars', () => {
    const { core, simVars } = createFws();
    const lavatorySmoke = core.abnormalSensed.ewdAbnormalSensed[keys.lavatorySmoke[1]];
    expect(lavatorySmoke.simVarIsActive.get()).toBe(false);

    simVars.set('L:A32NX_SMOKE_UPPER_DECK_LAV_DETECTED', 1);
    runFwsCycle(core);
    expect(lavatorySmoke.simVarIsActive.get()).toBe(true);

    simVars.set('L:A32NX_SMOKE_UPPER_DECK_LAV_DETECTED', 0);
    runFwsCycle(core);
    expect(lavatorySmoke.simVarIsActive.get()).toBe(false);
  });
});
