// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  FcdcSidestickWords,
  SidestickPriorityAural,
  SidestickPriorityAurals,
  SidestickPriorityInputs,
  readSidestickPriorityInputs,
} from './SidestickPriorityAurals';

const NONE: SidestickPriorityInputs = {
  captSidestickDeflected: false,
  foSidestickDeflected: false,
  leftSidestickDeactivated: false,
  rightSidestickDeactivated: false,
};
const DUAL_INPUT: SidestickPriorityInputs = { ...NONE, captSidestickDeflected: true, foSidestickDeflected: true };
/** The CAPT pressed the take over pb: the F/O sidestick is deactivated */
const CAPT_PRIORITY: SidestickPriorityInputs = { ...NONE, rightSidestickDeactivated: true };
const FO_PRIORITY: SidestickPriorityInputs = { ...NONE, leftSidestickDeactivated: true };

/** A step exact in binary floating point, so the times add up exactly */
const STEP = 0.125;

/** Runs the logic for some seconds and returns each voice with the time it came at */
function run(
  logic: SidestickPriorityAurals,
  inputs: SidestickPriorityInputs,
  seconds: number,
  inhibited = false,
): { aural: SidestickPriorityAural; at: number }[] {
  const said: { aural: SidestickPriorityAural; at: number }[] = [];
  for (let step = 1; step <= Math.round(seconds / STEP); step++) {
    for (const aural of logic.update(inputs, inhibited, STEP)) {
      said.push({ aural, at: step * STEP });
    }
  }
  return said;
}

describe('DUAL INPUT voice (a320_fcom.txt l.41070-41071, 45804)', () => {
  it('is said at once when both sidesticks are moved, then every 5 s', () => {
    const said = run(new SidestickPriorityAurals(), DUAL_INPUT, 12);
    expect(said).toEqual([
      { aural: 'dualInput', at: 0.125 },
      { aural: 'dualInput', at: 5.125 },
      { aural: 'dualInput', at: 10.125 },
    ]);
  });

  it('is not said with one sidestick moved', () => {
    expect(run(new SidestickPriorityAurals(), { ...NONE, captSidestickDeflected: true }, 6)).toEqual([]);
    expect(run(new SidestickPriorityAurals(), { ...NONE, foSidestickDeflected: true }, 6)).toEqual([]);
  });

  it('stops when one sidestick is deactivated (silenced by: one sidestick deactivated)', () => {
    const logic = new SidestickPriorityAurals();
    expect(run(logic, DUAL_INPUT, 1)).toHaveLength(1);
    expect(run(logic, { ...DUAL_INPUT, rightSidestickDeactivated: true }, 0.5).map((s) => s.aural)).not.toContain(
      'dualInput',
    );
  });

  it('starts again at once after the sidesticks were released', () => {
    const logic = new SidestickPriorityAurals();
    run(logic, DUAL_INPUT, 1);
    run(logic, NONE, 1);
    expect(run(logic, DUAL_INPUT, 0.1)).toEqual([{ aural: 'dualInput', at: 0.125 }]);
  });

  it('waits while a GPWS or TCAS aural is active', () => {
    const logic = new SidestickPriorityAurals();
    expect(run(logic, DUAL_INPUT, 2, true)).toEqual([]);
    expect(run(logic, DUAL_INPUT, 0.1)).toEqual([{ aural: 'dualInput', at: 0.125 }]);
  });
});

describe('PRIORITY LEFT / PRIORITY RIGHT voices (a320_fcom.txt l.45756-45760, 83909-83919)', () => {
  it('PRIORITY LEFT once when the CAPT holds the priority for 1 s', () => {
    expect(run(new SidestickPriorityAurals(), CAPT_PRIORITY, 4)).toEqual([{ aural: 'priorityLeft', at: 1 }]);
  });

  it('PRIORITY RIGHT once when the F/O holds the priority for 1 s', () => {
    expect(run(new SidestickPriorityAurals(), FO_PRIORITY, 4)).toEqual([{ aural: 'priorityRight', at: 1 }]);
  });

  it('nothing for a short press (autopilot disconnection)', () => {
    const logic = new SidestickPriorityAurals();
    expect(run(logic, CAPT_PRIORITY, 0.5)).toEqual([]);
    expect(run(logic, NONE, 2)).toEqual([]);
  });

  it('again at the next take over, and for the other side when the F/O takes over', () => {
    const logic = new SidestickPriorityAurals();
    expect(run(logic, CAPT_PRIORITY, 2)).toHaveLength(1);
    expect(run(logic, NONE, 1)).toEqual([]);
    expect(run(logic, CAPT_PRIORITY, 2)).toEqual([{ aural: 'priorityLeft', at: 1 }]);
    expect(run(logic, FO_PRIORITY, 2)).toEqual([{ aural: 'priorityRight', at: 1 }]);
  });

  it('waits while a GPWS or TCAS aural is active', () => {
    const logic = new SidestickPriorityAurals();
    expect(run(logic, CAPT_PRIORITY, 3, true)).toEqual([]);
    expect(run(logic, CAPT_PRIORITY, 0.1)).toEqual([{ aural: 'priorityLeft', at: 0.125 }]);
  });
});

describe('Sidestick data from the FCDC (Fcdc.cpp computeSidestickPriorityLights)', () => {
  const word = (value: number, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
    new Arinc429Word(Arinc429Word.getRawWord(value, ssm));
  const bits = (...set: number[]) => set.reduce((sum, bit) => sum + 2 ** (bit - 1), 0);
  const fcdc = (
    capt: [number, number],
    fo: [number, number],
    word2Bits: number[] = [],
    ssm = Arinc429SignStatusMatrix.NormalOperation,
  ): FcdcSidestickWords => ({
    discreteWord2: word(bits(...word2Bits), ssm),
    captPitchCommand: word(capt[0], ssm),
    captRollCommand: word(capt[1], ssm),
    foPitchCommand: word(fo[0], ssm),
    foRollCommand: word(fo[1], ssm),
  });

  it('a sidestick is deflected at 2 degrees in pitch or roll', () => {
    const inputs = readSidestickPriorityInputs(fcdc([0, -2], [1.9, 0]), fcdc([0, 0], [0, 0]));
    expect(inputs.captSidestickDeflected).toBe(true);
    expect(inputs.foSidestickDeflected).toBe(false);
  });

  it('the deactivated sidestick is in the discrete word 2, bits 28 (left) and 29 (right)', () => {
    expect(readSidestickPriorityInputs(fcdc([0, 0], [0, 0], [29]), fcdc([0, 0], [0, 0]))).toEqual({
      ...NONE,
      rightSidestickDeactivated: true,
    });
    expect(readSidestickPriorityInputs(fcdc([0, 0], [0, 0], [28]), fcdc([0, 0], [0, 0]))).toEqual({
      ...NONE,
      leftSidestickDeactivated: true,
    });
  });

  it('uses the FCDC 2 when the FCDC 1 sends nothing', () => {
    const failed = fcdc([5, 5], [5, 5], [], Arinc429SignStatusMatrix.FailureWarning);
    expect(readSidestickPriorityInputs(failed, fcdc([5, 0], [0, 5]))).toEqual(DUAL_INPUT);
  });
});
