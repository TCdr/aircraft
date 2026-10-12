// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isTcasFault, TcasFaultInputs } from './TcasFault';
import { A320Failure, A320FailureDefinitions } from '../../../failures/src/a320';

/*
 * A320 FCOM DSC-34-SURV-60 (a320_fcom.txt:56276, 56313-56315) and PRO-ABN-NAV NAV TCAS FAULT (a320_fcom.txt:93888):
 * amber TCAS on the ND and the PFD and NAV TCAS FAULT on an internal failure of the TCAS.
 */
describe('TCAS fault', () => {
  const healthy: TcasFaultInputs = {
    pressureAltitudeValid: true,
    radioAltitudeFailed: false,
    powered: true,
    internalFailure: false,
  };

  it('is not shown with a healthy, powered TCAS and valid altitudes', () => {
    expect(isTcasFault(healthy)).toBe(false);
  });

  it('is shown on an internal failure of the TCAS computer', () => {
    expect(isTcasFault({ ...healthy, internalFailure: true })).toBe(true);
  });

  it('is shown when the TCAS cannot deliver RA data (altitude inputs)', () => {
    expect(isTcasFault({ ...healthy, pressureAltitudeValid: false })).toBe(true);
    expect(isTcasFault({ ...healthy, radioAltitudeFailed: true })).toBe(true);
  });

  it('is a flyPad failure of ATA 34', () => {
    expect(A320Failure.TcasComputer).toBe(34060);
    expect(A320FailureDefinitions.some(([ata, id]) => ata === 34 && id === A320Failure.TcasComputer)).toBe(true);
  });

  it('the TCAS computer reads the failure, shows the fault and drops the traffic and advisories', () => {
    const computer = readFileSync(resolve(__dirname, '../components/TcasComputer.ts'), 'utf-8');
    expect(computer).toContain('this.tcasInternalFailure = this.failuresConsumer.isActive(A320Failure.TcasComputer);');
    expect(computer).toContain('internalFailure: this.tcasInternalFailure,');
    expect(computer).toContain('if (this.tcasMode.getVar() === TcasMode.STBY || this.tcasInternalFailure) {');
  });
});
