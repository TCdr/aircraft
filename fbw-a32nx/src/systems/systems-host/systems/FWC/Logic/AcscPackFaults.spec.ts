// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AcscPackFaultInputs, acscPackFaults } from './AcscPackFaults';

const normal: AcscPackFaultInputs = {
  acsc1Failed: false,
  acsc2Failed: false,
  pack1ValveDisagrees: false,
  pack2ValveDisagrees: false,
};

describe('A320 PACK 1(2) FAULT and PACK 1+2 FAULT triggers (FCOM PRO-ABN-AIR)', () => {
  it('gives no pack caution when both ACSCs and both valves are normal', () => {
    expect(acscPackFaults(normal)).toEqual({ pack1Fault: false, pack2Fault: false, bothAcscFailed: false });
  });

  it('gives PACK 1(2) FAULT when the flow control valve position disagrees with the command', () => {
    expect(acscPackFaults({ ...normal, pack1ValveDisagrees: true })).toEqual({
      pack1Fault: true,
      pack2Fault: false,
      bothAcscFailed: false,
    });
    expect(acscPackFaults({ ...normal, pack2ValveDisagrees: true })).toEqual({
      pack1Fault: false,
      pack2Fault: true,
      bothAcscFailed: false,
    });
  });

  it('gives PACK 1(2) FAULT when ACSC 1(2) loses both lanes', () => {
    expect(acscPackFaults({ ...normal, acsc1Failed: true }).pack1Fault).toBe(true);
    expect(acscPackFaults({ ...normal, acsc2Failed: true }).pack2Fault).toBe(true);
    expect(acscPackFaults({ ...normal, acsc2Failed: true }).pack1Fault).toBe(false);
  });

  it('gives only PACK 1+2 FAULT when both ACSCs are failed', () => {
    expect(
      acscPackFaults({
        acsc1Failed: true,
        acsc2Failed: true,
        pack1ValveDisagrees: true,
        pack2ValveDisagrees: true,
      }),
    ).toEqual({ pack1Fault: false, pack2Fault: false, bothAcscFailed: true });
  });
});
