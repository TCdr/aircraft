// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { DisplayUnit } from './displayUnit';

describe('DisplayUnit picture shown callback (ND -> ndwxr)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the picture shown while ON, hidden while failed, and shown again after the self-test', () => {
    const failed = Subject.create(false);
    const powered = Subject.create(true);
    const brightness = Subject.create(1);
    const shown: boolean[] = [];

    FSComponent.render(
      <DisplayUnit
        bus={new EventBus()}
        normDmc={1}
        failed={failed}
        powered={powered}
        brightness={brightness}
        onPictureShownChanged={(isShown) => shown.push(isShown)}
      >
        <div />
      </DisplayUnit>,
      document.createElement('div'),
    );

    // not cold and dark: the DU starts in standby and comes on once it sees power and brightness
    expect(shown[shown.length - 1]).toBe(true);

    failed.set(true);
    expect(shown[shown.length - 1]).toBe(false);

    // failure removed: self-test first (picture still hidden), then ON
    const callsBeforeRecovery = shown.length;
    failed.set(false);
    expect(shown.length).toBe(callsBeforeRecovery);
    vi.advanceTimersByTime(40_000);
    expect(shown[shown.length - 1]).toBe(true);
  });

  it('reports the picture hidden when the brightness is turned to zero', () => {
    const brightness = Subject.create(1);
    const shown: boolean[] = [];

    FSComponent.render(
      <DisplayUnit
        bus={new EventBus()}
        normDmc={1}
        failed={Subject.create(false)}
        powered={Subject.create(true)}
        brightness={brightness}
        onPictureShownChanged={(isShown) => shown.push(isShown)}
      >
        <div />
      </DisplayUnit>,
      document.createElement('div'),
    );

    expect(shown[shown.length - 1]).toBe(true);
    brightness.set(0);
    expect(shown[shown.length - 1]).toBe(false);
  });
});
