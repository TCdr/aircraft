// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Test support only: the FWS classes cannot be imported in vitest (an import cycle through the ECAM messages), so the
// FWS specs read their source text and evaluate the item arrays of the entries.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { expect } from 'vitest';

export function readSource(pathFromFwsFolder: string): string {
  return readFileSync(resolve(__dirname, pathFromFwsFolder), 'utf-8').replace(/\r\n/g, '\n');
}

/** Without whitespace and trailing commas, so that a prettier line wrap does not matter */
export function code(source: string): string {
  return source.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, '');
}

export function expectCode(source: string, snippet: string): void {
  expect(code(source)).toContain(code(snippet));
}

/** The source of the dictionary entry `key: {` up to its closing brace */
export function entrySource(source: string, key: string): string {
  const start = source.indexOf(`    ${key}: {`);
  if (start < 0) {
    throw new Error(`no entry ${key}`);
  }
  return source.slice(start, source.indexOf('\n    },', start));
}

/** The bracketed expression that starts at `open` (a `[` or `(`), strings skipped */
function bracketedExpression(source: string, open: number): string {
  const closing: Record<string, string> = { '[': ']', '(': ')', '{': '}' };
  const stack: string[] = [];
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === "'" || char === '`' || char === '"') {
      i = source.indexOf(char, i + 1);
    } else if (closing[char]) {
      stack.push(closing[char]);
    } else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        return source.slice(open, i + 1);
      }
    }
  }
  throw new Error(`unbalanced expression at ${open}`);
}

/**
 * Evaluates the array of `field: [...]` or `field: () => [...]` of an entry, with `this.fws.<name>.get()` read from
 * `values`. A name missing from `values` throws, so a test always sets every input the array uses.
 */
export function evaluateEntryArray(entry: string, field: string, values: Record<string, unknown> = {}): unknown[] {
  const fieldStart = entry.indexOf(`      ${field}: `);
  if (fieldStart < 0) {
    throw new Error(`no ${field}`);
  }
  const expression = bracketedExpression(entry, entry.indexOf('[', fieldStart));
  const fws = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (!(name in values)) {
          throw new Error(`the test does not set this.fws.${name}`);
        }
        return { get: () => values[name] };
      },
    },
  );
  return new Function('fws', `return ${expression.replace(/this\.fws\./g, 'fws.')};`)(fws);
}

/** The code from `start` up to the `;` that ends its statement, brackets and strings skipped */
function statementSource(source: string, start: string): string {
  const begin = source.indexOf(start);
  if (begin < 0) {
    throw new Error(`no ${start}`);
  }
  let depth = 0;
  for (let i = begin; i < source.length; i++) {
    const char = source[i];
    if (char === "'" || char === '`' || char === '"') {
      i = source.indexOf(char, i + 1);
    } else if ('([{'.includes(char)) {
      depth++;
    } else if (')]}'.includes(char)) {
      depth--;
    } else if (char === ';' && depth === 0) {
      return source.slice(begin, i + 1);
    }
  }
  throw new Error(`no end of ${start}`);
}

function isPassedAsIs(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `this` of a FwsCore statement: a primitive value of `thisValues` becomes a Subject stub, an array an array of stubs.
 * An object (for example a register or a monitor with its own methods) is passed as it is.
 */
function stubbedThis(thisValues: Record<string, unknown>): {
  self: object;
  values: () => Record<string, unknown>;
} {
  const stub = (value: unknown) => ({
    value,
    get() {
      return this.value;
    },
    set(newValue: unknown) {
      this.value = newValue;
    },
  });
  const stubs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(thisValues)) {
    stubs[name] = Array.isArray(value) ? value.map(stub) : isPassedAsIs(value) ? value : stub(value);
  }
  const self = new Proxy(stubs, {
    get: (target, name: string) => {
      if (!(name in target)) {
        throw new Error(`the test does not set this.${name}`);
      }
      return target[name];
    },
  });
  const values = () => {
    const result: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(stubs)) {
      result[name] = Array.isArray(value)
        ? value.map((element) => element.value)
        : isPassedAsIs(thisValues[name])
          ? value
          : (value as { value: unknown }).value;
    }
    return result;
  };
  return { self, values };
}

/**
 * Runs the FwsCore statement that starts with `start` (for example `'this.packVlvFault.forEach('`) with `this.<name>`
 * stubbed from `thisValues` and the local variables it reads from `locals`, and returns the `this` values after it.
 * The statement must be plain JavaScript (no type annotations).
 */
export function runFwsCoreStatement(
  source: string,
  start: string,
  thisValues: Record<string, unknown>,
  locals: Record<string, unknown> = {},
): Record<string, unknown> {
  const { self, values } = stubbedThis(thisValues);
  new Function(...Object.keys(locals), statementSource(source, start)).call(self, ...Object.values(locals));
  return values();
}

/**
 * Evaluates the FwsCore expression that follows `start` (for example `'const failedPoweredCpcsCount ='`) up to the end
 * of its statement, with `this` and the local variables stubbed as in runFwsCoreStatement.
 */
export function evaluateFwsCoreExpression(
  source: string,
  start: string,
  thisValues: Record<string, unknown>,
  locals: Record<string, unknown> = {},
): unknown {
  const { self } = stubbedThis(thisValues);
  const expression = statementSource(source, start).slice(start.length, -1);
  // Parenthesised: an expression that prettier wraps after its `=` starts with a line break
  return new Function(...Object.keys(locals), `return (${expression});`).call(self, ...Object.values(locals));
}
