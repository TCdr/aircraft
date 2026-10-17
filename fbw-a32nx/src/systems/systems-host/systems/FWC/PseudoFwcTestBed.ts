// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Test bed of the specs that run the whole PseudoFWC (no shipped code imports this file)

import { vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { computeFwcAvailability } from './Logic/FwcAvailability';

/** The simvar values the FWC reads (by name), and the last value it wrote to each simvar */
export interface FwcSimVars {
  readonly simvars: Map<string, number>;
  readonly writes: Map<string, unknown>;
}

/**
 * Replaces the SimVar API by maps: call it in beforeEach.
 * @returns the maps of the read values (set them in the test) and of the written values
 */
export function installFwcSimVarMocks(): FwcSimVars {
  const simvars = new Map<string, number>();
  const writes = new Map<string, unknown>();
  // PseudoFWC.init() waits for the in-game state (never reached here)
  vi.stubGlobal('GameState', { ingame: 3 });
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simvars.get(name) ?? 0);
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
    writes.set(name, value);
    return Promise.resolve();
  });
  // RegisteredSimVar reads: the ids index the registered names
  const registeredNames: string[] = [];
  (SimVar as any).GetRegisteredId = (name: string) => {
    if (!registeredNames.includes(name)) {
      registeredNames.push(name);
    }
    return registeredNames.indexOf(name);
  };
  (SimVar as any).GetSimVarValueFastReg = (id: number) => simvars.get(registeredNames[id]) ?? 0;
  (SimVar as any).GetSimVarValueFastRegString = (id: number) => simvars.get(registeredNames[id]) ?? '';
  (SimVar as any).SetSimVarValueReg = (id: number, value: unknown) => writes.set(registeredNames[id], value);
  return { simvars, writes };
}

export const normalWord = (value = 0) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
export const noComputedDataWord = () => Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData);

/**
 * A healthy A32NX in cruise (FWC flight phase 6), both engines running, no alert: every input whose default (0)
 * would raise an alert is set to its normal value.
 */
export function setHealthyCruise(bus: EventBus, simvars: Map<string, number>): void {
  const publisher = bus.getPublisher<any>();
  publisher.pub('fuel_valve_switch_1', true, false, true);
  publisher.pub('fuel_valve_switch_2', true, false, true);
  publisher.pub('engine1Master', 1, false, true);
  publisher.pub('engine2Master', 1, false, true);
  // FCU 1 and 2 healthy (bits 24 and 25)
  publisher.pub('a32nx_fcu_discrete_word_2', normalWord((1 << 23) | (1 << 24)), false, true);

  simvars.set('L:A32NX_FWC_FLIGHT_PHASE', 6);
  for (const bus of ['AC_1', 'AC_2', 'AC_ESS', 'AC_ESS_SHED', 'DC_1', 'DC_2', 'DC_ESS', 'DC_ESS_SHED', 'DC_BAT']) {
    simvars.set(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 1);
  }
  for (const contactor of ['8PH', '9XU1', '9XU2']) {
    simvars.set(`L:A32NX_ELEC_CONTACTOR_${contactor}_IS_CLOSED`, 1);
  }
  simvars.set('L:A32NX_ELEC_TR_1_POTENTIAL_NORMAL', 1);
  simvars.set('L:A32NX_ELEC_TR_2_POTENTIAL_NORMAL', 1);
  simvars.set('L:A32NX_OVHD_ELEC_AC_ESS_FEED_PB_IS_NORMAL', 1);
  simvars.set('L:A32NX_OVHD_ELEC_BUS_TIE_PB_IS_AUTO', 1);
  simvars.set('L:A32NX_VENTILATION_BLOWER_TOGGLE', 1);
  simvars.set('L:A32NX_VENTILATION_EXTRACT_TOGGLE', 1);
  simvars.set('A:APU GENERATOR SWITCH:1', 1);
  simvars.set('A:ANTISKID BRAKES ACTIVE', 1);
  simvars.set('L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS', 3000);
  for (const side of [1, 2]) {
    simvars.set(`L:A32NX_ENGINE_N1:${side}`, 85);
    simvars.set(`L:A32NX_ENGINE_N2:${side}`, 90);
    simvars.set(`L:A32NX_ENGINE_STATE:${side}`, 1);
    simvars.set(`GENERAL ENG OIL PRESSURE:${side}`, 60);
    simvars.set(`GENERAL ENG OIL TEMPERATURE:${side}`, 80);
    simvars.set(`A:GENERAL ENG MASTER ALTERNATOR:${side}`, 1);
    simvars.set(`L:A32NX_ELEC_ENG_GEN_${side}_IDG_IS_CONNECTED`, 1);
    simvars.set(`L:A32NX_ELEC_ENG_GEN_${side}_LOAD_NORMAL`, 1);
    simvars.set(`L:A32NX_OVHD_ELEC_BAT_${side}_PB_IS_AUTO`, 1);
    simvars.set(`L:A32NX_OVHD_PNEU_ENG_${side}_BLEED_PB_IS_AUTO`, 1);
    simvars.set(`L:A32NX_OVHD_COND_PACK_${side}_PB_IS_ON`, 1);
    simvars.set(`L:A32NX_PRESS_CPC_${side}_DISCRETE_WORD`, normalWord());
    simvars.set(`L:A32NX_COND_ACSC_${side}_DISCRETE_WORD_1`, normalWord());
    simvars.set(`L:A32NX_COND_ACSC_${side}_DISCRETE_WORD_2`, normalWord());
    simvars.set(`L:A32NX_FAC_${side}_HEALTHY`, 1);
    // above 2500 ft the radio altimeters send no computed data, they are not failed
    simvars.set(`L:A32NX_RA_${side}_RADIO_ALTITUDE`, noComputedDataWord());
    for (const word of [1, 2, 3]) {
      simvars.set(`L:A32NX_FCDC_${side}_DISCRETE_WORD_${word}`, noComputedDataWord());
    }
    for (const word of [1, 2, 3, 4]) {
      simvars.set(`L:A32NX_LGCIU_${side}_DISCRETE_WORD_${word}`, normalWord());
    }
  }
  for (const color of ['GREEN', 'BLUE', 'YELLOW']) {
    simvars.set(`L:A32NX_HYD_${color}_SYSTEM_1_SECTION_PRESSURE_SWITCH`, 1);
    simvars.set(`L:A32NX_HYD_${color}_PUMP_1_SECTION_PRESSURE_SWITCH`, 1);
  }
  simvars.set('L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED', 1);
  simvars.set('L:A32NX_OVHD_PRESS_MODE_SEL_PB_IS_AUTO', 1);
  simvars.set('L:A32NX_SWITCH_TCAS_Position', 2);
  simvars.set('L:A32NX_TRANSPONDER_MODE', 1);
  // centre tank transfer pb-sw ON (no FUEL CTR TK XFR OFF) and cargo doors locked (no DOOR FWD/AFT CARGO)
  simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', 1);
  simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_R_XFR_PB_IS_ON', 1);
  simvars.set('L:A32NX_FWD_DOOR_CARGO_LOCKED', 1);
  simvars.set('L:A32NX_AFT_DOOR_CARGO_LOCKED', 1);
  // the FMGCs are healthy and send the landing elevation (no CAB PR LDG ELEV FAULT)
  simvars.set('L:A32NX_FM1_LANDING_ELEVATION', normalWord());
  simvars.set('L:A32NX_FM1_HEALTHY_DISCRETE', 1);
  simvars.set('L:A32NX_FM2_HEALTHY_DISCRETE', 1);
}

/** The real PseudoFWC, both FWCs powered and started */
export function createFwc(): { fwc: PseudoFWC; bus: EventBus } {
  return createFwcWithStartup(true);
}

/**
 * The real PseudoFWC, both FWCs powered, with the FWC startup state of FwsManager under the test's control
 * @param started whether the FWC startup is completed at the start
 */
export function createFwcWithStartup(started: boolean): {
  fwc: PseudoFWC;
  bus: EventBus;
  startupCompleted: Subject<boolean>;
} {
  const bus = new EventBus();
  const startupCompleted = Subject.create(started);
  const fwcAvailability = Subject.create(
    computeFwcAvailability({ fwc1Failed: false, fwc2Failed: false, fwc1Powered: true, fwc2Powered: true }),
  );
  const fwc = new PseudoFWC(bus, new FwsSoundManager(bus, startupCompleted), startupCompleted, fwcAvailability);
  fwc.init();
  return { fwc, bus, startupCompleted };
}

/** Runs the FWC for some seconds at the FwsManager rate (60 ms) */
export function runFwc(fwc: PseudoFWC, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 60) {
    fwc.update(60);
  }
}

/** The E/WD lines the FWC writes on one side, as the E/WD reads them (L:A32NX_EWD_LOWER_RIGHT/LEFT_LINE_n) */
export function writtenEwdLines(writes: Map<string, unknown>, side: 'LEFT' | 'RIGHT'): unknown[] {
  return [1, 2, 3, 4, 5, 6, 7]
    .map((line) => writes.get(`L:A32NX_EWD_LOWER_${side}_LINE_${line}`))
    .filter((code) => !!code);
}
