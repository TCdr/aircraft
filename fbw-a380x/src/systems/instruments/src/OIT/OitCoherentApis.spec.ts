// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { describe, expect, it } from 'vitest';

/** Functions the sim browser (an old JavaScriptCore) does not have: a call throws, and the action does nothing */
const MISSING_IN_THE_SIM =
  /\.(trimEnd|trimStart|flatMap|flat|replaceAll|matchAll|at|findLast|findLastIndex)\(|Object\.(fromEntries|hasOwn)\(|structuredClone\(|Promise\.allSettled\(/;

/**
 * @param dir a folder
 * @param files the source files found so far
 * @returns the source files (no specs) under the folder
 */
function sourceFiles(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, files);
    } else if (/\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

describe('OIT code in the sim browser', () => {
  it('calls no function the sim browser lacks', () => {
    const root = resolve(__dirname);
    const calls: string[] = [];
    for (const file of sourceFiles(root)) {
      readFileSync(file, 'utf-8')
        .split('\n')
        .forEach((line, index) => {
          if (MISSING_IN_THE_SIM.test(line)) {
            calls.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(calls).toEqual([]);
  });
});
