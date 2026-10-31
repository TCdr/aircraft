// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const MODERN_BUILD = 'react-simple-keyboard/build/index.modern';

// The wrapper is loaded against a stand-in of the keyboard library, which records that the wrapper asked for it
const loadedBuilds = vi.hoisted(() => ({ count: 0 }));
vi.mock('react-simple-keyboard/build/index.modern', () => {
  loadedBuilds.count++;
  return { default: () => null };
});

// The rest of the wrapper's imports are not under test
vi.mock('../Assets/Keyboard.scss', () => ({}));
vi.mock('simple-keyboard-layouts', () => ({ default: class {} }));
vi.mock('@flybywiresim/fbw-sdk-react', () => ({ usePersistentProperty: () => [] }));
vi.mock('../Store/store', () => ({ useAppSelector: () => undefined }));

describe('KeyboardWrapper', () => {
  it('uses the modern build of react-simple-keyboard', async () => {
    await import('./KeyboardWrapper');
    expect(loadedBuilds.count).toBe(1);
  });

  it('the modern build is bundled without global core-js polyfills', () => {
    const bundle = readFileSync(createRequire(__filename).resolve(MODERN_BUILD), 'utf-8');
    expect(bundle).not.toContain('__core-js_shared__');
  });
});
