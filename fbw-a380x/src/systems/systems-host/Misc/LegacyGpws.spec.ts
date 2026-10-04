// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LegacyGpws } from './LegacyGpws';
import { LegacySoundManager } from './LegacySoundManager';

/*
 * A380 FCOM DSC-34-SURV (FLAP MODE BUTTON): "The flight crew can inhibit mode 4B by setting the FLAP MODE button to
 * OFF". The MFD SURV CONTROLS page writes L:A32NX_GPWS_FLAPS_OFF.
 */
describe('GPWS mode 4B (TOO LOW FLAPS) and the FLAP MODE button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mode4 = (flapModeOff: boolean) => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === 'L:A32NX_GPWS_FLAPS_OFF' && flapModeOff ? 1 : 0,
    );
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);
    const mode = { current: 0, previous: 0, type: [] };
    // 200 ft RA at 170 kt, gear down, flaps not in landing configuration, approach phase: 8.2967 x 170 - 1074 = 336 ft
    gpws.GPWSMode4(mode, 200, 170, false, true, FmgcFlightPhase.Approach);
    return mode.current;
  };

  it('FLAP MODE OFF inhibits mode 4B', () => {
    expect(mode4(true)).toBe(0);
  });

  it('FLAP MODE ON keeps the TOO LOW FLAPS alert', () => {
    expect(mode4(false)).toBe(3);
  });
});
