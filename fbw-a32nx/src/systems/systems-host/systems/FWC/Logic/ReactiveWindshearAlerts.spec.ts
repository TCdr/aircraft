// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REAC_WS_DET_FAULT_CODE,
  REAC_WS_DET_FAULT_PHASE_INHIBITION,
  ReactiveWindshearAlertInputs,
  reacWsDetFaultAlert,
  reacWsDetFaultStatus,
  reactiveWindshearFunctionLost,
} from './ReactiveWindshearAlerts';
import { ewdTexts, statusLines } from './FwcAlertSpecHelpers';
import { isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

const healthy: ReactiveWindshearAlertInputs = {
  fac1Healthy: true,
  fac2Healthy: true,
  adrFaulty: [false, false, false],
  irFaulty: [false, false, false],
  fac12FaultAlert: false,
  adrTripleFaultAlert: false,
};

/* AUTO FLT REAC W/S DET FAULT: triggers when the reactive windshear function is lost; crew awareness; STATUS INOP SYS
   REAC W/S DET. */
describe('AUTO FLT REAC W/S DET FAULT', () => {
  it('nothing with the FACs and the ADIRS healthy', () => {
    expect(reactiveWindshearFunctionLost(healthy)).toBe(false);
    expect(reacWsDetFaultAlert(healthy)).toBe(false);
  });

  it('one FAC, one ADR and one IR are enough for the function', () => {
    const degraded = {
      ...healthy,
      fac1Healthy: false,
      adrFaulty: [true, true, false],
      irFaulty: [false, true, true],
    };
    expect(reactiveWindshearFunctionLost(degraded)).toBe(false);
  });

  it('the function is lost with the three IRs failed: the alert (the FWC has no NAV alert for it)', () => {
    const inputs = { ...healthy, irFaulty: [true, true, true] };
    expect(reactiveWindshearFunctionLost(inputs)).toBe(true);
    expect(reacWsDetFaultAlert(inputs)).toBe(true);
  });

  it('the function is lost with both FACs unhealthy: the alert unless FAC 1+2 FAULT shows it', () => {
    const inputs = { ...healthy, fac1Healthy: false, fac2Healthy: false };
    expect(reacWsDetFaultAlert(inputs)).toBe(true);
    expect(reacWsDetFaultAlert({ ...inputs, fac12FaultAlert: true })).toBe(false);
  });

  it('the function is lost with the three ADRs failed: NAV ADR 1+2+3 FAULT shows it (STATUS REAC W/S DET)', () => {
    const inputs = { ...healthy, adrFaulty: [true, true, true] };
    expect(reactiveWindshearFunctionLost(inputs)).toBe(true);
    expect(reacWsDetFaultAlert({ ...inputs, adrTripleFaultAlert: true })).toBe(false);
  });

  it('is the amber AUTO FLT title REAC W/S DET FAULT', () => {
    expect(ewdTexts([REAC_WS_DET_FAULT_CODE])).toEqual(['\x1b<4m\x1b4mAUTO FLT\x1bm REAC W/S DET FAULT']);
  });

  it('STATUS: INOP SYS REAC W/S DET', () => {
    expect(statusLines(reacWsDetFaultStatus())).toEqual({ left: [], right: ['INOP SYS', 'REAC W/S DET'] });
  });

  it('is inhibited in flight phases 3, 4, 5 and 8', () => {
    expect(REAC_WS_DET_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 8]);
  });

  it('is a crew awareness caution of the real PseudoFWC with its STATUS', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    const item = fwc.ewdMessageFailures['2200240'];
    expect(item.flightPhaseInhib).toEqual(REAC_WS_DET_FAULT_PHASE_INHIBITION);
    expect(item.failure).toBe(1);
    expect(item.codesToReturn).toEqual([REAC_WS_DET_FAULT_CODE]);
    expect(statusLines({ left: item.statusInfo!(), inopSys: item.inopSys!() })).toEqual(
      statusLines(reacWsDetFaultStatus()),
    );
    expect(item.simVarIsActive.get()).toBe(false);
    (fwc as any).reacWsDetFault.set(true);
    expect(item.simVarIsActive.get()).toBe(true);
  });

  it('is not raised by the real PseudoFWC while FAC 1+2 FAULT already shows the loss of both FACs', () => {
    const fwc = startCruiseFwc(simvars).fwc;
    simvars.set('L:A32NX_FAC_1_HEALTHY', 0);
    simvars.set('L:A32NX_FAC_2_HEALTHY', 0);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, '2200205')).toBe(true);
    expect(isAlertTriggered(fwc, '2200240')).toBe(false);
  });
});
