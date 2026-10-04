// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The ENG MASTER panel FIRE light code of A32NX_Interior_Engine.xml (template FBW_Airbus_Engine_Lights), evaluated
// with a small RPN interpreter for the operators it uses. Kept outside src/ because build.js copies every file of src/.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ENGINE_BEHAVIOR_XML = join(__dirname, 'src', 'A32NX_Interior_Engine.xml');

/** The SEQ1_CODE of the FBW_Airbus_Engine_Lights template, with #ID# replaced by the engine number */
function engineFireLightCode(engine: 1 | 2): string {
  const xml = readFileSync(ENGINE_BEHAVIOR_XML, 'utf8');
  const template = /<Template Name="FBW_Airbus_Engine_Lights">([\s\S]*?)<\/Template>/.exec(xml);
  if (!template) {
    throw new Error('FBW_Airbus_Engine_Lights template not found');
  }
  const code = /<SEQ1_CODE>([\s\S]*?)<\/SEQ1_CODE>/.exec(template[1]);
  if (!code) {
    throw new Error('SEQ1_CODE not found');
  }
  return code[1].replace(/#ID#/g, engine.toString());
}

/** Evaluates the RPN subset of the code: (L:NAME, unit) reads, numbers, ==, and, or, ! */
function evaluate(code: string, localVars: Record<string, boolean>): boolean {
  const tokens = code.match(/\(L:[^)]*\)|\S+/g) ?? [];
  const stack: number[] = [];
  const pop = (): number => {
    const value = stack.pop();
    if (value === undefined) {
      throw new Error(`RPN stack underflow in: ${code}`);
    }
    return value;
  };
  for (const token of tokens) {
    const localVar = /^\(L:([^,)]+)/.exec(token);
    if (localVar) {
      stack.push(localVars[localVar[1].trim()] ? 1 : 0);
    } else if (token === '==') {
      const b = pop();
      const a = pop();
      stack.push(a === b ? 1 : 0);
    } else if (token === 'and') {
      const b = pop();
      const a = pop();
      stack.push(a && b ? 1 : 0);
    } else if (token === 'or') {
      const b = pop();
      const a = pop();
      stack.push(a || b ? 1 : 0);
    } else if (token === '!') {
      stack.push(pop() ? 0 : 1);
    } else if (/^-?\d+(\.\d+)?$/.test(token)) {
      stack.push(Number(token));
    } else {
      throw new Error(`Unsupported RPN token ${token}`);
    }
  }
  if (stack.length !== 1) {
    throw new Error(`RPN stack holds ${stack.length} values after: ${code}`);
  }
  return stack[0] !== 0;
}

function fireLight(engine: 1 | 2, localVars: Record<string, boolean>): boolean {
  return evaluate(engineFireLightCode(engine), localVars);
}

describe('ENG MASTER panel FIRE light (A320 FCOM DSC-26-20-20)', () => {
  it('is dark without fire and without test', () => {
    expect(fireLight(1, {})).toBe(false);
    expect(fireLight(2, {})).toBe(false);
  });

  it('comes on during the FIRE TEST of its engine only', () => {
    expect(fireLight(1, { A32NX_FIRE_TEST_ENG1: true })).toBe(true);
    expect(fireLight(2, { A32NX_FIRE_TEST_ENG1: true })).toBe(false);
    expect(fireLight(2, { A32NX_FIRE_TEST_ENG2: true })).toBe(true);
  });

  it('comes on with the fire warning of its engine', () => {
    expect(fireLight(1, { A32NX_FIRE_DETECTED_ENG1: true })).toBe(true);
    expect(fireLight(2, { A32NX_FIRE_DETECTED_ENG2: true })).toBe(true);
    expect(fireLight(2, { A32NX_FIRE_DETECTED_ENG1: true })).toBe(false);
  });

  it('stays dark during the test of ENG 1 with ENG 1 loop A faulted', () => {
    expect(fireLight(1, { A32NX_FIRE_TEST_ENG1: true, A32NX_FIRE_ENG1_LOOP_A_FAULT: true })).toBe(false);
  });

  it('stays dark during the test of ENG 2 with ENG 2 loop B faulted', () => {
    expect(fireLight(2, { A32NX_FIRE_TEST_ENG2: true, A32NX_FIRE_ENG2_LOOP_B_FAULT: true })).toBe(false);
  });

  it('still comes on during the test with the other loop of the engine faulted', () => {
    expect(fireLight(1, { A32NX_FIRE_TEST_ENG1: true, A32NX_FIRE_ENG1_LOOP_B_FAULT: true })).toBe(true);
    expect(fireLight(2, { A32NX_FIRE_TEST_ENG2: true, A32NX_FIRE_ENG2_LOOP_A_FAULT: true })).toBe(true);
  });

  it('is not affected by a loop fault of the other engine', () => {
    expect(fireLight(1, { A32NX_FIRE_TEST_ENG1: true, A32NX_FIRE_ENG2_LOOP_B_FAULT: true })).toBe(true);
    expect(fireLight(2, { A32NX_FIRE_TEST_ENG2: true, A32NX_FIRE_ENG1_LOOP_A_FAULT: true })).toBe(true);
  });

  it('still comes on with a real fire warning when the loop is faulted', () => {
    expect(fireLight(1, { A32NX_FIRE_DETECTED_ENG1: true, A32NX_FIRE_ENG1_LOOP_A_FAULT: true })).toBe(true);
    expect(
      fireLight(2, {
        A32NX_FIRE_TEST_ENG2: true,
        A32NX_FIRE_DETECTED_ENG2: true,
        A32NX_FIRE_ENG2_LOOP_B_FAULT: true,
      }),
    ).toBe(true);
  });
});
