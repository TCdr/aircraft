// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('KeyboardWrapper', () => {
  it('bundles a react-simple-keyboard build without global core-js polyfills', () => {
    const source = readFileSync(resolve(__dirname, 'KeyboardWrapper.tsx'), 'utf-8');
    const specifier = /from '(react-simple-keyboard[^']*)'/.exec(source)?.[1];
    expect(specifier).toBeDefined();

    const bundle = readFileSync(createRequire(__filename).resolve(specifier), 'utf-8');
    expect(bundle).not.toContain('__core-js_shared__');
  });
});
