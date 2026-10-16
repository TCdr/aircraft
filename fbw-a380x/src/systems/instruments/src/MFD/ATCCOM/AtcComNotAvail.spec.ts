// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtcDatalinkSystem } from './AtcDatalinkSystem';

/*
 * A380 FCOM DSC-46-10-20-30 MFD ATC COM Pages - General (a380_fcom.txt l.96792-96795): "If the flight crew decides to
 * display an ATC COM page while the ATC is failed, via the KCCU keys (ATC COM key or Navigation keys), the ATC COM NOT
 * AVAIL message appears for 5 s."
 */
describe('ATC COM NOT AVAIL', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const messagesAfterKccuKey = (atcAvailable: boolean) => {
    vi.useFakeTimers();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === 'L:A380X_ATC_FUNCTION_AVAIL' ? (atcAvailable ? 1 : 0) : 0,
    );
    const atc = new AtcDatalinkSystem(new EventBus());
    atc.onAtcComPageSelectedWithKccu();
    const texts = () => atc.atcErrors.getArray().map((error) => error.messageText);
    return { texts };
  };

  it('appears for 5 s when the ATC is failed', () => {
    const { texts } = messagesAfterKccuKey(false);
    expect(texts()).toEqual(['ATC COM NOT AVAIL']);
    vi.advanceTimersByTime(4900);
    expect(texts()).toEqual(['ATC COM NOT AVAIL']);
    vi.advanceTimersByTime(200);
    expect(texts()).toEqual([]);
  });

  it('does not appear while the ATC runs', () => {
    const { texts } = messagesAfterKccuKey(true);
    expect(texts()).toEqual([]);
  });
});
