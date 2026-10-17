// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  createFwcWithStartup,
  installFwcSimVarMocks,
  runFwc,
  setHealthyCruise,
  writtenEwdLines,
} from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

let simvars: Map<string, number>;
let writes: Map<string, unknown>;

beforeEach(() => {
  ({ simvars, writes } = installFwcSimVarMocks());
});

const FAC_1_AND_2_FAULT = '220020501';
const RA_1_FAULT = '340014001';
const failureWarningWord = () => Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.FailureWarning);

/*
 * Aircraft power-up: the FWCs start up (FwsManager) while the other computers run their own power-up tests. The
 * cautions of those tests must not be computed, shown nor chimed by an FWC that has not completed its startup.
 */
describe('the whole FWC at power-up', () => {
  it('computes no alert while the FWC starts up, and not the ones gone by the end of its startup', () => {
    const { fwc, bus, startupCompleted } = createFwcWithStartup(false);
    setHealthyCruise(bus, simvars);
    // FACs in their power-up test
    simvars.set('L:A32NX_FAC_1_HEALTHY', 0);
    simvars.set('L:A32NX_FAC_2_HEALTHY', 0);
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'LEFT')).not.toContain(FAC_1_AND_2_FAULT);
    expect(writes.get('L:A32NX_MASTER_CAUTION')).not.toBe(1);

    // FAC tests over, then the FWC startup ends
    simvars.set('L:A32NX_FAC_1_HEALTHY', 1);
    simvars.set('L:A32NX_FAC_2_HEALTHY', 1);
    runFwc(fwc, 1);
    startupCompleted.set(true);
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'LEFT')).not.toContain(FAC_1_AND_2_FAULT);
  });

  it('still shows a fault present at the end of the FWC startup', () => {
    const { fwc, bus, startupCompleted } = createFwcWithStartup(false);
    setHealthyCruise(bus, simvars);
    simvars.set('L:A32NX_FAC_1_HEALTHY', 0);
    simvars.set('L:A32NX_FAC_2_HEALTHY', 0);
    runFwc(fwc, 2);
    startupCompleted.set(true);
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'LEFT')).toContain(FAC_1_AND_2_FAULT);
  });
});

/* NAV RA 1(2) FAULT: the RA is failed, not just running its 4-6 s power-up self test */
describe('the whole FWC: NAV RA 1 FAULT at the RA power-up', () => {
  it('waits for the longest RA self test after its AC bus is powered', () => {
    const { fwc, bus } = createFwcWithStartup(true);
    setHealthyCruise(bus, simvars);
    simvars.set('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 0);
    runFwc(fwc, 2);

    // AC 1 powered: RA 1 sends a failure word while it runs its self test
    simvars.set('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 1);
    simvars.set('L:A32NX_RA_1_RADIO_ALTITUDE', failureWarningWord());
    runFwc(fwc, 4);
    expect(writtenEwdLines(writes, 'LEFT')).not.toContain(RA_1_FAULT);

    // Still no height after the longest self test: RA 1 failed
    runFwc(fwc, 4);
    expect(writtenEwdLines(writes, 'LEFT')).toContain(RA_1_FAULT);
  });
});
