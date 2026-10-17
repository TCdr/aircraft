// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { computeFwcAvailability } from './Logic/FwcAvailability';
import { statusLineVar } from '@shared/StatusPaging';

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
  // other alerts whose default (0) would raise them (FUEL CTR TK XFR OFF, DOOR FWD/AFT CARGO, CAB PR LDG ELEV FAULT)
  simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', 1);
  simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_R_XFR_PB_IS_ON', 1);
  simvars.set('L:A32NX_FWD_DOOR_CARGO_LOCKED', 1);
  simvars.set('L:A32NX_AFT_DOOR_CARGO_LOCKED', 1);
  simvars.set('L:A32NX_FM1_LANDING_ELEVATION', normalWord());
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
/** The STATUS page lines the FWC writes (L:A32NX_ECAM_STATUS_LEFT/RIGHT_LINE_n) */
const statusLines = (side: 'LEFT' | 'RIGHT') =>
  Array.from({ length: 20 }, (_, i) => writes.get(statusLineVar(side, i + 1))).filter((code) => !!code);

const ENG_A_ICE = '000026001';

/* ANTI ICE ENG 1(2) VALVE CLSD / VALVE OPEN, on the engine anti-ice valve of the systems model
 * (L:A32NX_PNEU_ENG_n_ANTI_ICE_VALVE_OPEN) */
describe('A32NX ANTI ICE ENG 1(2) VALVE cautions in cruise', () => {
  it('shows ANTI ICE ENG 1 VALVE CLSD with its STATUS when the valve stays closed with the pb-sw ON', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    run(fwc, 5);
    expect(ewdLines('LEFT')).toEqual([]);

    simvars.set('L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_1_POSITION', 1);
    simvars.set('L:A32NX_PNEU_ENG_1_ANTI_ICE_VALVE_OPEN', 0);
    run(fwc, 3);
    // The valve transits: no caution yet
    expect(ewdLines('LEFT')).toEqual([]);

    run(fwc, 3);
    expect(ewdLines('LEFT')).toEqual(['300110101', '300110102']);
    expect(statusLines('LEFT')).toContain('700400001');
    expect(statusLines('RIGHT')).toContain('300300002');
    // The ENG A.ICE memo follows the pb-sw
    expect(ewdLines('RIGHT')).toContain(ENG_A_ICE);

    // The valve opens: the caution goes
    simvars.set('L:A32NX_PNEU_ENG_1_ANTI_ICE_VALVE_OPEN', 1);
    run(fwc, 1);
    expect(ewdLines('LEFT')).toEqual([]);
  });

  it('shows ANTI ICE CAPT PITOT with AIR DATA SWTG CAPT 3 when the captain pitot heater fails', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    for (const adr of [1, 2, 3]) {
      simvars.set(`L:A32NX_OVHD_ADIRS_ADR_${adr}_PB_IS_ON`, 1);
    }
    simvars.set('L:A32NX_AIR_DATA_SWITCHING_KNOB', 1);
    run(fwc, 5);
    expect(ewdLines('LEFT')).toEqual([]);

    simvars.set('L:A32NX_PHC_1_PITOT_HEAT_FAULT', 1);
    run(fwc, 2);
    expect(ewdLines('LEFT')).toEqual(['300122101', '300122102']);
    expect(statusLines('RIGHT')).toContain('300300010');

    // AIR DATA SWTG on CAPT 3: the line goes
    simvars.set('L:A32NX_AIR_DATA_SWITCHING_KNOB', 0);
    run(fwc, 1);
    expect(ewdLines('LEFT')).toEqual(['300122101']);

    // The F/O pitot heater fails too: CAPT + F/O PITOT, ADR 2 OFF (ADR 3 on)
    simvars.set('L:A32NX_PHC_2_PITOT_HEAT_FAULT', 1);
    run(fwc, 2);
    expect(ewdLines('LEFT')).toEqual(['300120201', '300120203']);
  });

  it('shows ANTI ICE ENG 2 VALVE OPEN with THRUST LIM PENALTY when the valve stays open with the pb-sw OFF', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus);
    run(fwc, 5);

    simvars.set('L:A32NX_PNEU_ENG_2_ANTI_ICE_VALVE_OPEN', 1);
    run(fwc, 6);
    expect(ewdLines('LEFT')).toEqual(['300110401', '300110402']);
    expect(statusLines('LEFT')).toContain('300400001');
    expect(ewdLines('RIGHT')).not.toContain(ENG_A_ICE);
  });
});
