// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AtsuParts,
  AtsuPowerSwitch,
  atsuCircuitBreakerPulled,
  atsuRunStates,
  datalinkInterfaceStates,
} from './AtsuFailureStates';

/** Records the power transitions */
class TestParts implements AtsuParts {
  public readonly calls: string[] = [];

  powerUpAtsu(): void {
    this.calls.push('up atsu');
  }

  powerDownAtsu(): void {
    this.calls.push('down atsu');
  }

  powerUpAoc(): void {
    this.calls.push('up aoc');
  }

  powerDownAoc(): void {
    this.calls.push('down aoc');
  }
}

const supplied = { acBus1Powered: true, circuitBreakerPulled: false, atsuFailed: false, aocFailed: false };

/** The C/B bit of a column of row L of 121VU */
const column = (n: number) => 1 << (n - 1);

/* The flyPad ATSU failures (A320 FCOM PRO-ABN-DATALINK, a320_fcom.txt l.74467-74531) */
describe('ATSU failures', () => {
  it('the supplied ATSU runs its router, ATC and AOC functions', () => {
    expect(atsuRunStates(supplied)).toEqual({
      atsuRunning: true,
      aocRunning: true,
    });
    expect(atsuRunStates({ ...supplied, acBus1Powered: false })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
  });

  it('the failed ATSU stops everything, the failed AOC function stops the company datalink only', () => {
    expect(atsuRunStates({ ...supplied, atsuFailed: true })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
    expect(atsuRunStates({ ...supplied, aocFailed: true })).toEqual({
      atsuRunning: true,
      aocRunning: false,
    });
  });

  it('powers the parts up and down on the changes only, the AOC after the router up and before it down', () => {
    const parts = new TestParts();
    const power = new AtsuPowerSwitch(parts);

    // first update without supply: everything down, as the former AC BUS 1 handler
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc', 'down atsu']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: true, aocRunning: true });
    expect(parts.calls).toEqual(['up atsu', 'up aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: false });
    expect(parts.calls).toEqual(['down aoc']);

    parts.calls.length = 0;
    power.update({ atsuRunning: true, aocRunning: true });
    power.update({ atsuRunning: false, aocRunning: false });
    expect(parts.calls).toEqual(['up aoc', 'down aoc', 'down atsu']);
  });

  it('the systems-host ATSU applies them with its flyPad failures', () => {
    const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');
    expect(atsu).toContain('atsuFailed: this.failuresConsumer.isActive(A320Failure.Atsu),');
    expect(atsu).toContain('aocFailed: this.failuresConsumer.isActive(A320Failure.AtsuAoc),');
    expect(atsu).toContain('this.updatePower();');
  });
});

/* The ATSU reset by its C/Bs (A320 FCOM PRO-ABN-ABN-RESET, a320_fcom.txt l.67769-67796) */
describe('ATSU reset by the C/Bs L15 and L16 on 121VU', () => {
  it('reads the C/Bs L15 and L16 of row L only', () => {
    expect(atsuCircuitBreakerPulled(0)).toBe(false);
    expect(atsuCircuitBreakerPulled(column(15))).toBe(true);
    expect(atsuCircuitBreakerPulled(column(16))).toBe(true);
    expect(atsuCircuitBreakerPulled(column(15) | column(16))).toBe(true);
    // the other C/Bs of the row (e.g. L7 and L32, monitored by the SDAC) do not stop the ATSU
    expect(atsuCircuitBreakerPulled(column(7) | column(14) | column(17) | column(32))).toBe(false);
  });

  it('the ATSU does not run while one of its C/Bs is pulled', () => {
    expect(atsuRunStates({ ...supplied, circuitBreakerPulled: true })).toEqual({
      atsuRunning: false,
      aocRunning: false,
    });
  });

  it('pull L16, L15, then push L15, L16: the ATSU is powered down then up again (CPDLC connection dropped)', () => {
    const parts = new TestParts();
    const power = new AtsuPowerSwitch(parts);
    const runWithBits = (bits: number) =>
      power.update(atsuRunStates({ ...supplied, circuitBreakerPulled: atsuCircuitBreakerPulled(bits) }));

    runWithBits(0);
    parts.calls.length = 0;
    runWithBits(column(16));
    runWithBits(column(16) | column(15));
    runWithBits(column(16));
    expect(parts.calls).toEqual(['down aoc', 'down atsu']);
    runWithBits(0);
    expect(parts.calls).toEqual(['down aoc', 'down atsu', 'up atsu', 'up aoc']);
  });

  it('the systems-host ATSU reads the C/B variable of the C/B model', () => {
    const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');
    expect(atsu).toContain('circuitBreakerPulled: atsuCircuitBreakerPulled(this.circuitBreakerVar.get()),');
    const states = readFileSync(resolve(__dirname, 'AtsuFailureStates.ts'), 'utf-8');
    expect(states).toContain("'L:1:A32NX_CB_121VU_L_TRIPPED_0'");
  });
});

/* The DCDU, its screens and the MCDU print (FCOM DSC-46-10-10 l.59032-59056, PRO-ABN-ABN-RESET l.67771) */
describe('datalink cockpit interface states', () => {
  const noFailure = { dcdu1Failed: false, dcdu2Failed: false, printerFailed: false };

  it('the DCDUs show INVALID DATA while the ATSU does not run', () => {
    expect(datalinkInterfaceStates(atsuRunStates(supplied), noFailure).atsuOff).toBe(false);
    for (const notRunning of [
      { ...supplied, acBus1Powered: false },
      { ...supplied, circuitBreakerPulled: true },
      { ...supplied, atsuFailed: true },
    ]) {
      expect(datalinkInterfaceStates(atsuRunStates(notRunning), noFailure).atsuOff).toBe(true);
    }
    // a failed AOC function leaves the ATC datalink to the DCDU
    expect(datalinkInterfaceStates(atsuRunStates({ ...supplied, aocFailed: true }), noFailure).atsuOff).toBe(false);
  });

  it('gives each DCDU and the printer its own failure', () => {
    const running = atsuRunStates(supplied);
    expect(datalinkInterfaceStates(running, { ...noFailure, dcdu1Failed: true })).toEqual({
      atsuOff: false,
      dcduFailed: [true, false],
      printerFailed: false,
    });
    expect(datalinkInterfaceStates(running, { ...noFailure, dcdu2Failed: true }).dcduFailed).toEqual([false, true]);
    expect(datalinkInterfaceStates(running, { ...noFailure, printerFailed: true }).printerFailed).toBe(true);
  });

  it('the systems-host ATSU writes the variables the DCDU, the model and the MCDU read', () => {
    const atsu = readFileSync(resolve(__dirname, 'atsu.ts'), 'utf-8');
    expect(atsu).toContain("'L:A32NX_ATSU_OFF'");
    expect(atsu).toContain('`L:A32NX_DCDU_${dcdu}_FAILED`');
    expect(atsu).toContain("'L:A32NX_PRINTER_FAILED'");
    const instruments = resolve(__dirname, '../../instruments/src');
    expect(readFileSync(resolve(instruments, 'DCDU/index.tsx'), 'utf-8')).toContain("'L:A32NX_ATSU_OFF'");
    expect(readFileSync(resolve(instruments, 'DCDU/useDcduKeyEvent.ts'), 'utf-8')).toContain("'L:A32NX_DCDU_1_FAILED'");
    expect(readFileSync(resolve(instruments, 'MCDU/legacy/A320_Neo_CDU_MainDisplay.ts'), 'utf-8')).toContain(
      "'L:A32NX_PRINTER_FAILED'",
    );
    const model = readFileSync(
      resolve(
        __dirname,
        '../../../base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/model/A320_NEO_INTERIOR.xml',
      ),
      'utf-8',
    );
    expect(model).toContain('(L:A32NX_ELEC_DC_1_BUS_IS_POWERED, Bool) (L:A32NX_DCDU_1_FAILED, Bool) ! and if{');
    expect(model).toContain('(L:A32NX_ELEC_DC_2_BUS_IS_POWERED, Bool) (L:A32NX_DCDU_2_FAILED, Bool) ! and if{');
  });
});
