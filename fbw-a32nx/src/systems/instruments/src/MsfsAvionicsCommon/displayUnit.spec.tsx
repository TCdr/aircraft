// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockEvents, EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { pictureOnOtherDuVar } from '@shared/DisplayReconfiguration';
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

  it('shows the picture while the DMC shows it on another DU, even with its own DU failed (DU reconfiguration)', () => {
    const simVars = new Map<string, number>();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    const bus = new EventBus();
    const failed = Subject.create(false);
    const shown: boolean[] = [];

    FSComponent.render(
      <DisplayUnit
        bus={bus}
        normDmc={1}
        failed={failed}
        powered={Subject.create(true)}
        brightness={Subject.create(1)}
        picture="PFD_L"
        onPictureShownChanged={(isShown) => shown.push(isShown)}
      >
        <div />
      </DisplayUnit>,
      document.createElement('div'),
    );
    let time = 1_000;
    const tick = () => {
      // the 10 Hz poll is throttled on the (fake) clock
      vi.advanceTimersByTime(1_000);
      time += 1_000;
      bus.getPublisher<ClockEvents>().pub('realTime', time);
    };

    failed.set(true);
    tick();
    expect(shown[shown.length - 1]).toBe(false);

    // the PFD DU failed: the DMC puts the PFD on the ND DU
    simVars.set(pictureOnOtherDuVar('PFD_L'), 1);
    tick();
    expect(shown[shown.length - 1]).toBe(true);

    simVars.set(pictureOnOtherDuVar('PFD_L'), 0);
    tick();
    expect(shown[shown.length - 1]).toBe(false);
  });
});
