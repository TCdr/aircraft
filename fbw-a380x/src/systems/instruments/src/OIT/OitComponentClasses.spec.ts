// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * @param dir a folder
 * @param files the .tsx files found so far
 * @returns the .tsx files under the folder
 */
function tsxFiles(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      tsxFiles(path, files);
    } else if (name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

describe('OIT components', () => {
  it('are component classes: FSComponent calls render() on every component tag', () => {
    const root = resolve(__dirname);
    const functionComponents: string[] = [];
    for (const file of tsxFiles(root)) {
      const pattern = /^(?:export )?(?:function ([A-Z]\w*)\(props|const ([A-Z]\w*) = \(props)/gm;
      const source = readFileSync(file, 'utf-8');
      let match = pattern.exec(source);
      while (match !== null) {
        functionComponents.push(`${relative(root, file)}: ${match[1] ?? match[2]}`);
        match = pattern.exec(source);
      }
    }
    expect(functionComponents).toEqual([]);
  });
});
