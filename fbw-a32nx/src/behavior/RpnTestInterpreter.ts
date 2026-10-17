// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// A small interpreter of the MSFS RPN the behavior specs evaluate (the operators the tested code uses), so XML panel
// code can be unit tested. Kept outside src/ because build.js copies every file of src/.

import { translate, Type } from '@flybywiresim/rnp';

/** The simulator state the code reads, by variable (e.g. 'L:A32NX_RMP_L_SELECTED_MODE', 'A:COM RECEIVE EX1:1') */
export type RpnVariables = Record<string, number>;

/** One write of the code: a variable set or a key event sent (e.g. 'K:COM1_VOLUME_SET') with its value */
export interface RpnWrite {
  target: string;
  value: number;
}

export interface RpnResult {
  /** The value left on the stack, undefined when the code leaves none */
  value: number | undefined;
  writes: RpnWrite[];
}

export function decodeXmlCode(code: string): string {
  return code.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/**
 * Compiles the rnp code of an XML block (type="rnp" return="number") to RPN as build.js does. The XML parser of
 * build.js reads CRLF as LF, rnp only takes LF.
 */
export function compileRnp(code: string): string {
  const { messages, output } = translate(code.replace(/\r/g, '').replace(/&lt;/g, '<'), {
    specifier: '(inline)',
    returnType: Type.NUMBER,
  });
  const errors = messages.filter((m) => m.level === 'error');
  if (errors.length > 0) {
    throw new Error(`rnp: ${errors.map((m) => `${m.message} ${m.detail}`).join('; ')}`);
  }
  return output;
}

/** The name of a variable token without its unit: '(L:NAME, bool)' -> 'L:NAME' */
function variableName(token: string): string {
  return token.slice(1, -1).replace(/^>/, '').split(',')[0].trim();
}

const BINARY_OPERATORS: Record<string, (a: number, b: number) => number> = {
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
  '<': (a, b) => (a < b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
  and: (a, b) => (a && b ? 1 : 0),
  or: (a, b) => (a || b ? 1 : 0),
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  max: (a, b) => Math.max(a, b),
  min: (a, b) => Math.min(a, b),
};

const UNARY_OPERATORS: Record<string, (a: number) => number> = {
  '!': (a) => (a ? 0 : 1),
  near: (a) => Math.round(a),
  abs: (a) => Math.abs(a),
};

/**
 * Runs the code. Variables not given read 0, as unset simulator variables do; a written variable is read back by the
 * rest of the code. An operator on an empty stack reads 0 (the simulator's behaviour, which existing code relies on,
 * e.g. "a b max max").
 */
export function runRpn(code: string, variables: RpnVariables = {}): RpnResult {
  const tokens = decodeXmlCode(code).match(/\([^)]*\)|\S+/g) ?? [];
  const state: RpnVariables = { ...variables };
  const stack: number[] = [];
  const registers: number[] = [];
  const writes: RpnWrite[] = [];
  const pop = (): number => stack.pop() ?? 0;
  /** The index of the closing brace of the block opened just before `from` */
  const blockEnd = (from: number): number => {
    let depth = 1;
    for (let i = from; i < tokens.length; i++) {
      if (tokens[i].endsWith('{')) {
        depth++;
      } else if (tokens[i] === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    throw new Error(`unbalanced block in: ${code}`);
  };
  const run = (start: number, end: number): void => {
    for (let i = start; i < end; i++) {
      const token = tokens[i];
      if (token.startsWith('(>')) {
        const target = variableName(token);
        const value = pop();
        writes.push({ target, value });
        state[target] = value;
      } else if (token.startsWith('(')) {
        stack.push(state[variableName(token)] ?? 0);
      } else if (token === 'if{') {
        const condition = pop();
        const thenEnd = blockEnd(i + 1);
        const hasElse = tokens[thenEnd + 1] === 'els{';
        const elseEnd = hasElse ? blockEnd(thenEnd + 2) : thenEnd;
        if (condition) {
          run(i + 1, thenEnd);
        } else if (hasElse) {
          run(thenEnd + 2, elseEnd);
        }
        i = elseEnd;
      } else if (/^sp\d+$/.test(token)) {
        registers[Number(token.slice(2))] = pop();
      } else if (/^l\d+$/.test(token)) {
        stack.push(registers[Number(token.slice(1))] ?? 0);
      } else if (token in BINARY_OPERATORS) {
        const b = pop();
        const a = pop();
        stack.push(BINARY_OPERATORS[token](a, b));
      } else if (token in UNARY_OPERATORS) {
        stack.push(UNARY_OPERATORS[token](pop()));
      } else if (/^-?\d+(\.\d+)?$/.test(token)) {
        stack.push(Number(token));
      } else {
        throw new Error(`Unsupported RPN token ${token} in: ${code}`);
      }
    }
  };
  run(0, tokens.length);
  return { value: stack.length > 0 ? stack[stack.length - 1] : undefined, writes };
}
