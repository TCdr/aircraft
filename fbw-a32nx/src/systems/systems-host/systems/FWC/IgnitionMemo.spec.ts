// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise, writtenEwdLines } from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the FWC reads (by name), and the last value it wrote to each simvar */
let simvars: Map<string, number>;
let writes: Map<string, unknown>;

beforeEach(() => {
  ({ simvars, writes } = installFwcSimVarMocks());
});

const run = runFwc;

/** The E/WD memo lines the FWC writes, as the E/WD reads them (L:A32NX_Ewd_LOWER_RIGHT/LEFT_LINE_n) */
const ewdLines = (side: 'LEFT' | 'RIGHT') => writtenEwdLines(writes, side);

const IGNITION = '000007001';
const ENG_A_ICE = '000026001';

describe('A32NX IGNITION memo in cruise (A320 FCOM DSC-70-90-50)', () => {
  // FCOM DSC-70-90-50: "IGNITION : This memo appears in green when continuous ignition is activated on any engine."
  it('shows IGNITION on the right E/WD memo column while ENG 1 continuous ignition is on (sim test G3)', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    run(fwc, 5);
    expect(ewdLines('LEFT')).toEqual([]);
    expect(ewdLines('RIGHT')).not.toContain(IGNITION);

    // ENG 1 ANTI ICE pb-sw ON, its valve open: the systems WASM sets the automatic continuous ignition of engine 1
    simvars.set('L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_1_POSITION', 1);
    simvars.set('L:A32NX_PNEU_ENG_1_ANTI_ICE_VALVE_OPEN', 1);
    simvars.set('L:A32NX_ENGINE_1_CONTINUOUS_IGNITION', 1);
    run(fwc, 1);
    expect(ewdLines('RIGHT')).toContain(IGNITION);
    expect(ewdLines('RIGHT')).toContain(ENG_A_ICE);
    // IGNITION is above ENG A. ICE (memo order of EwdMessages)
    expect(ewdLines('RIGHT').indexOf(IGNITION)).toBeLessThan(ewdLines('RIGHT').indexOf(ENG_A_ICE));

    run(fwc, 15);
    expect(ewdLines('RIGHT')).toContain(IGNITION);

    simvars.set('L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_1_POSITION', 0);
    simvars.set('L:A32NX_PNEU_ENG_1_ANTI_ICE_VALVE_OPEN', 0);
    simvars.set('L:A32NX_ENGINE_1_CONTINUOUS_IGNITION', 0);
    run(fwc, 1);
    expect(ewdLines('RIGHT')).not.toContain(IGNITION);
    expect(ewdLines('RIGHT')).not.toContain(ENG_A_ICE);
  });

  it('shows IGNITION for engine 2 too, and not for ENG ANTI ICE without continuous ignition', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    simvars.set('L:A32NX_ENGINE_2_CONTINUOUS_IGNITION', 1);
    run(fwc, 2);
    expect(ewdLines('RIGHT')).toContain(IGNITION);

    simvars.set('L:A32NX_ENGINE_2_CONTINUOUS_IGNITION', 0);
    simvars.set('L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_2_POSITION', 1);
    simvars.set('L:A32NX_PNEU_ENG_2_ANTI_ICE_VALVE_OPEN', 1);
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
    setHealthyCruise(bus, simvars);
    setFmgcWords(NO_DESTINATION, NO_DESTINATION);
    run(fwc, 30);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
  });

  it('is shown once both FMGC words have been in failure for 15 s', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    setFmgcWords(FMGC_NOT_STARTED, FMGC_NOT_STARTED);
    run(fwc, 14);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
    run(fwc, 2);
    expect(ewdLines('LEFT')).toContain(LDG_ELEV_FAULT_LINE);
  });

  it('is shown 15 s after both FMGCs lose their healthy discrete, their last normal word left on the bus', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
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
    setHealthyCruise(bus, simvars);
    setFmgcWords(DESTINATION_ENTERED, DESTINATION_ENTERED);
    simvars.set('L:A32NX_FM2_HEALTHY_DISCRETE', 0);
    run(fwc, 30);
    expect(ewdLines('LEFT')).not.toContain(LDG_ELEV_FAULT_LINE);
  });
});
