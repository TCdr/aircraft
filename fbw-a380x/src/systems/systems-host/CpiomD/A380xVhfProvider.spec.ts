// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { FailuresConsumer, FrequencyMode } from '@flybywiresim/fbw-sdk';
import { VhfRadioInterface } from '@datalink/router';
import { A380Failure } from '@failures';
import { A380xVhfProvider } from './A380xVhfProvider';
import { Acr } from './Acr';

/** The VHF providers the ACR gave to its router */
const routerVhfProviders = vi.hoisted(() => [] as unknown[]);

vi.mock('@datalink/router', () => ({
  Router: class {
    constructor(_bus: unknown, _isEfb: boolean, _isFmc: boolean, vhfProvider: unknown) {
      routerVhfProviders.push(vhfProvider);
    }

    powerUp() {}

    powerDown() {}

    initialize() {}
  },
}));

describe('A380X ACR VHF 3 data mode (COM VHF 3 DATALINK FAULT)', () => {
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

  it('the ACR gives its router the RMP VHF 3 mode and the VHF 3 flyPad failure', () => {
    let rmpMode: FrequencyMode = FrequencyMode.Data;
    // the ACR registers the RMP mode L:var once, at import
    (SimVar as any).GetSimVarValueFastReg = () => rmpMode;
    const activeFailures = new Set<number>();
    new Acr(new EventBus(), { isActive: (failure: number) => activeFailures.has(failure) } as FailuresConsumer);
    const vhfProvider = routerVhfProviders[routerVhfProviders.length - 1] as VhfRadioInterface;

    expect(vhfProvider.isDataModeActive()).toBe(true);

    activeFailures.add(A380Failure.Vhf3);
    expect(vhfProvider.isDataModeActive()).toBe(false);

    activeFailures.clear();
    rmpMode = FrequencyMode.Frequency;
    expect(vhfProvider.isDataModeActive()).toBe(false);
  });
});
