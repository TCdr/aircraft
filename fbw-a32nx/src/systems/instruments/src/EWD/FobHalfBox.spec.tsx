// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { FOB } from './FOB';

// The rules of the half box are in shared/FuelQuantityIndications; the SD FUEL page part is in its spec
describe('FOB half box on the E/WD', () => {
  function halfBoxVisibility(failures: { [topic: string]: boolean }): string | null {
    const bus = new EventBus();
    const container = document.createElement('div');
    FSComponent.render(
      <svg>
        <FOB bus={bus} x={0} y={0} metric={Subject.create(true)} />
      </svg>,
      container,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publisher = bus.getPublisher<any>();
    for (const [topic, failed] of Object.entries(failures)) {
      publisher.pub(topic, failed, false, false);
    }
    return container.querySelector('path.AmberLine')?.getAttribute('visibility') ?? null;
  }

  it('is hidden without a transfer valve failure', () => {
    expect(halfBoxVisibility({})).toBe('hidden');
  });

  it('is shown for an outer tank transfer valve failure of either wing', () => {
    expect(halfBoxVisibility({ leftOuterXfrClosed: true })).toBe('visible');
    expect(halfBoxVisibility({ rightOuterXfrClosed: true })).toBe('visible');
  });

  it('is shown with both centre tank transfer valves failed closed, not with one', () => {
    expect(halfBoxVisibility({ leftCtrXfrFailedClosed: true })).toBe('hidden');
    expect(halfBoxVisibility({ leftCtrXfrFailedClosed: true, rightCtrXfrFailedClosed: true })).toBe('visible');
  });
});
