// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isRmpOperative, MsfsComCircuitSwitch, rmpFailedVar } from './RadioCommunicationLogic';

describe('isRmpOperative (FCOM DSC-23-10-20 ON/OFF switch, DSC-23-60 RMP failure cases)', () => {
  it('works when powered, switched on and not failed', () => {
    expect(isRmpOperative(true, true, false)).toBe(true);
  });

  it('goes blank when it fails, even powered and switched on', () => {
    expect(isRmpOperative(true, true, true)).toBe(false);
  });

  it('goes blank when unpowered or switched off', () => {
    expect(isRmpOperative(false, true, false)).toBe(false);
    expect(isRmpOperative(true, false, false)).toBe(false);
  });
});

describe('rmpFailedVar', () => {
  it('names one L:var per pedestal RMP', () => {
    expect(rmpFailedVar('L')).toBe('L:A32NX_RMP_L_FAILED');
    expect(rmpFailedVar('R')).toBe('L:A32NX_RMP_R_FAILED');
  });
});

describe('MsfsComCircuitSwitch (failed VHF switches its MSFS COM circuit off)', () => {
  it('does nothing while the circuit is already in the wanted state', () => {
    const circuit = new MsfsComCircuitSwitch();
    expect(circuit.update(true, true, 0)).toBe(false);
    expect(circuit.update(false, false, 100)).toBe(false);
  });

  it('toggles once when the VHF fails, and waits for the sim to apply it', () => {
    const circuit = new MsfsComCircuitSwitch(1000);
    expect(circuit.update(false, true, 0)).toBe(true);
    // the sim has not applied the toggle yet: a second toggle would switch the circuit back on
    expect(circuit.update(false, true, 20)).toBe(false);
    expect(circuit.update(false, true, 999)).toBe(false);
    // applied
    expect(circuit.update(false, false, 1100)).toBe(false);
  });

  it('retries when a toggle was lost', () => {
    const circuit = new MsfsComCircuitSwitch(1000);
    expect(circuit.update(false, true, 0)).toBe(true);
    expect(circuit.update(false, true, 1000)).toBe(true);
  });

  it('switches the circuit back on when the failure is cleared', () => {
    const circuit = new MsfsComCircuitSwitch(1000);
    expect(circuit.update(false, true, 0)).toBe(true);
    expect(circuit.update(false, false, 50)).toBe(false);
    // cleared right after: no stale pending toggle delays the switch back on
    expect(circuit.update(true, false, 60)).toBe(true);
    expect(circuit.update(true, true, 120)).toBe(false);
  });

  it('switches the circuit back on at once when the failure is cleared before the off state was seen', () => {
    const circuit = new MsfsComCircuitSwitch(1000);
    expect(circuit.update(false, true, 0)).toBe(true);
    // the sim applied the toggle, and the failure was cleared in the same frame
    expect(circuit.update(true, false, 20)).toBe(true);
  });
});
