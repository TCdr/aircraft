// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise, writtenEwdLines } from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

let simvars: Map<string, number>;
let writes: Map<string, unknown>;

beforeEach(() => {
  ({ simvars, writes } = installFwcSimVarMocks());
});

const AUTO_BRK_OFF_GREEN = '000002204';
const REAC_WS_DET_FAULT = '220024001';

/* A320 FCOM DSC-32-30-20 (l.51662): "AUTO BRK OFF : This memo appears in green if the auto brake is failed." */
describe('the whole FWC: green AUTO BRK OFF memo', () => {
  it('shows AUTO BRK OFF on the memo column while the BSCU reports the autobrake failed, in cruise', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'RIGHT')).not.toContain(AUTO_BRK_OFF_GREEN);

    simvars.set('L:A32NX_BRAKES_AUTO_BRK_FAULT', 1);
    runFwc(fwc, 2);
    expect(writtenEwdLines(writes, 'RIGHT')).toContain(AUTO_BRK_OFF_GREEN);

    simvars.set('L:A32NX_BRAKES_AUTO_BRK_FAULT', 0);
    runFwc(fwc, 2);
    expect(writtenEwdLines(writes, 'RIGHT')).not.toContain(AUTO_BRK_OFF_GREEN);
  });
});

/* A320 FCOM PRO-ABN-AUTO_FLT (l.71712): "This alert triggers when the reactive windshear function is lost." */
describe('the whole FWC: AUTO FLT REAC W/S DET FAULT', () => {
  it('shows REAC W/S DET FAULT in cruise when the three IRs fail', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'LEFT')).not.toContain(REAC_WS_DET_FAULT);

    for (const ir of [1, 2, 3]) {
      simvars.set(`L:A32NX_ADIRS_IR_${ir}_FAULT_WARN_DISCRETE`, 1);
    }
    runFwc(fwc, 3);
    expect(writtenEwdLines(writes, 'LEFT')).toContain(REAC_WS_DET_FAULT);
  });

  it('not with both FACs lost: FAC 1+2 FAULT is the alert then', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    simvars.set('L:A32NX_FAC_1_HEALTHY', 0);
    simvars.set('L:A32NX_FAC_2_HEALTHY', 0);
    runFwc(fwc, 3);
    const left = writtenEwdLines(writes, 'LEFT');
    expect(left).toContain('220020501');
    expect(left).not.toContain(REAC_WS_DET_FAULT);
  });
});
