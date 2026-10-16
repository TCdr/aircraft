// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380xVhfProvider } from './A380xVhfProvider';

const acr = readFileSync(resolve(__dirname, 'Acr.ts'), 'utf-8');

describe('A380X ACR VHF 3 data mode (COM VHF 3 DATALINK FAULT, A380 FCOM l.137608)', () => {
  it('carries the datalink when VHF 3 is in DATA mode on the RMP and not failed', () => {
    expect(
      new A380xVhfProvider(
        () => true,
        () => false,
      ).isDataModeActive(),
    ).toBe(true);
    expect(
      new A380xVhfProvider(
        () => false,
        () => false,
      ).isDataModeActive(),
    ).toBe(false);
  });

  it('stops the datalink when VHF 3 is failed, even in DATA mode', () => {
    expect(
      new A380xVhfProvider(
        () => true,
        () => true,
      ).isDataModeActive(),
    ).toBe(false);
  });

  it('the ACR feeds the VHF 3 flyPad failure to the router', () => {
    expect(acr).toContain('new A380xVhfProvider(');
    expect(acr).toContain('this.failuresConsumer.isActive(A380Failure.Vhf3)');
  });
});
