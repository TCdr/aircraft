// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { computeFwcAvailability } from './Logic/FwcAvailability';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the FWC reads (by name), and the last value it wrote to each simvar */
let simvars: Map<string, number>;
let writes: Map<string, unknown>;

beforeEach(() => {
  simvars = new Map();
  writes = new Map();
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
});

const normalWord = (value = 0) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
const noComputedDataWord = () => Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData);

/**
 * A healthy A32NX in cruise (FWC flight phase 6), both engines running, no alert: every input whose default (0)
 * would raise an alert is set to its normal value.
 */
function setHealthyCruise(bus: EventBus): void {
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
function createFwc(): { fwc: PseudoFWC; bus: EventBus } {
  const bus = new EventBus();
  const startupCompleted = Subject.create(true);
  const fwcAvailability = Subject.create(
    computeFwcAvailability({ fwc1Failed: false, fwc2Failed: false, fwc1Powered: true, fwc2Powered: true }),
  );
  const fwc = new PseudoFWC(bus, new FwsSoundManager(bus, startupCompleted), startupCompleted, fwcAvailability);
  fwc.init();
  return { fwc, bus };
}

/** Runs the FWC for some seconds at the FwsManager rate (60 ms) */
function run(fwc: PseudoFWC, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 60) {
    fwc.update(60);
  }
}

/** The E/WD memo lines the FWC writes, as the E/WD reads them (L:A32NX_Ewd_LOWER_RIGHT/LEFT_LINE_n) */
const ewdLines = (side: 'LEFT' | 'RIGHT') =>
  [1, 2, 3, 4, 5, 6, 7].map((line) => writes.get(`L:A32NX_EWD_LOWER_${side}_LINE_${line}`)).filter((code) => !!code);

const IGNITION = '000007001';
const ENG_A_ICE = '000026001';

describe('A32NX IGNITION memo in cruise (A320 FCOM DSC-70-90-50)', () => {
  // FCOM DSC-70-90-50: "IGNITION : This memo appears in green when continuous ignition is activated on any engine."
  it('shows IGNITION on the right E/WD memo column while ENG 1 continuous ignition is on (sim test G3)', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    run(fwc, 5);
    expect(ewdLines('LEFT')).toEqual([]);
    expect(ewdLines('RIGHT')).not.toContain(IGNITION);

    // ENG 1 ANTI ICE pb-sw ON: the systems WASM sets the automatic continuous ignition of engine 1
    simvars.set('ENG ANTI ICE:1', 1);
    simvars.set('L:A32NX_ENGINE_1_CONTINUOUS_IGNITION', 1);
    run(fwc, 1);
    expect(ewdLines('RIGHT')).toContain(IGNITION);
    expect(ewdLines('RIGHT')).toContain(ENG_A_ICE);
    // IGNITION is above ENG A. ICE (memo order of EwdMessages)
    expect(ewdLines('RIGHT').indexOf(IGNITION)).toBeLessThan(ewdLines('RIGHT').indexOf(ENG_A_ICE));

    run(fwc, 15);
    expect(ewdLines('RIGHT')).toContain(IGNITION);

    simvars.set('ENG ANTI ICE:1', 0);
    simvars.set('L:A32NX_ENGINE_1_CONTINUOUS_IGNITION', 0);
    run(fwc, 1);
    expect(ewdLines('RIGHT')).not.toContain(IGNITION);
    expect(ewdLines('RIGHT')).not.toContain(ENG_A_ICE);
  });

  it('shows IGNITION for engine 2 too, and not for ENG ANTI ICE without continuous ignition', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    simvars.set('L:A32NX_ENGINE_2_CONTINUOUS_IGNITION', 1);
    run(fwc, 2);
    expect(ewdLines('RIGHT')).toContain(IGNITION);

    simvars.set('L:A32NX_ENGINE_2_CONTINUOUS_IGNITION', 0);
    simvars.set('ENG ANTI ICE:2', 1);
    run(fwc, 2);
    expect(ewdLines('RIGHT')).toContain(ENG_A_ICE);
    expect(ewdLines('RIGHT')).not.toContain(IGNITION);
  });
});

/*
 * CAB PR LDG ELEV FAULT through the real PseudoFWC (FCOM PRO-ABN-CAB_PR l.73186-73187; user decision 2026-10-15: only
 * when no FMGC sends its landing elevation word, not before a destination is entered). Raw words recorded in the sim.
 */
describe('A32NX CAB PR LDG ELEV FAULT on the E/WD (A320 FCOM PRO-ABN-CAB_PR)', () => {
  const LDG_ELEV_FAULT_LINE = '213123601';
  const FMGC_NOT_STARTED = 0;
  const NO_DESTINATION = 4294967296;
  const DESTINATION_ENTERED = 13975420928;

  function setFmgcWords(fm1RawWord: number, fm2RawWord: number): void {
    simvars.set('L:A32NX_FM1_LANDING_ELEVATION', fm1RawWord);
    simvars.set('L:A32NX_FM2_LANDING_ELEVATION', fm2RawWord);
  }

  it('is not shown while the FMGCs send NCD (no destination yet)', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    setFmgcWords(NO_DESTINATION, NO_DESTINATION);
    run(fwc, 30);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
  });

  it('is shown once both FMGC words have been in failure for 15 s', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    setFmgcWords(FMGC_NOT_STARTED, FMGC_NOT_STARTED);
    run(fwc, 14);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
    run(fwc, 2);
    expect(ewdLines('LEFT')).toContain(LDG_ELEV_FAULT_LINE);
  });

  it('is shown 15 s after both FMGCs lose their healthy discrete, their last normal word left on the bus', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    setFmgcWords(DESTINATION_ENTERED, DESTINATION_ENTERED);
    run(fwc, 5);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
    // AC ESS SHED lost: the FMS writes both discretes false and keeps its words (A320_Neo_CDU_MainDisplay)
    simvars.set('L:A32NX_FM1_HEALTHY_DISCRETE', 0);
    simvars.set('L:A32NX_FM2_HEALTHY_DISCRETE', 0);
    run(fwc, 14);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
    run(fwc, 2);
    expect(ewdLines('LEFT')).toContain(LDG_ELEV_FAULT_LINE);
  });

  it('is not shown while one FMGC stays healthy', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    setFmgcWords(DESTINATION_ENTERED, DESTINATION_ENTERED);
    simvars.set('L:A32NX_FM2_HEALTHY_DISCRETE', 0);
    run(fwc, 30);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
  });
});
