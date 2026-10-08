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
    // 200 ft RA at 170 kt, gear down, flaps not in landing configuration, approach phase: below 245 ft and 180 kt
    gpws.GPWSMode4(mode, 200, 170, false, true, FmgcFlightPhase.Approach);
    return mode.current;
  };

  it('FLAP MODE OFF inhibits mode 4B', () => {
    expect(mode4(true)).toBe(0);
  });

  it('FLAP MODE ON keeps the TOO LOW FLAPS alert', () => {
    expect(mode4(false)).toBe(2);
  });
});

/*
 * A380 FCOM DSC-34-20-20-10: mode 4A "if the aircraft speed is above 200 kt" and mode 4B "above 180 kt" give TOO LOW
 * TERRAIN instead of TOO LOW GEAR / TOO LOW FLAPS (the A320 speeds 190 kt and 159 kt were used).
 * mode.current: 1 = TOO LOW GEAR, 2 = TOO LOW FLAPS, 3 = TOO LOW TERRAIN.
 */
describe('GPWS mode 4A and 4B speeds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // terrOperative: AESU system 1 selected, TERR SYS on and not failed; otherwise no AESU system is selected
  const mode4 = (radioAlt: number, speed: number, gearExtended: boolean, terrOperative = false) => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === 'L:A32NX_WXR_TAWS_SYS_SELECTED' && terrOperative ? 1 : 0,
    );
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);
    const mode = { current: 0, previous: 0, type: [] };
    gpws.GPWSMode4(mode, radioAlt, speed, false, gearExtended, FmgcFlightPhase.Approach);
    return mode.current;
  };

  it('mode 4A: TOO LOW GEAR at 195 kt', () => {
    expect(mode4(400, 195, false)).toBe(1);
  });

  it('mode 4A, TERR function not operative: TOO LOW TERRAIN above 200 kt, up to 1 000 ft at 250 kt', () => {
    expect(mode4(400, 205, false)).toBe(3);
    expect(mode4(950, 250, false)).toBe(3);
    expect(mode4(700, 210, false)).toBe(0);
  });

  it('mode 4B: TOO LOW FLAPS at 175 kt', () => {
    expect(mode4(200, 175, true)).toBe(2);
  });

  it('mode 4B, TERR function not operative: TOO LOW TERRAIN above 180 kt, up to 1 000 ft at 250 kt', () => {
    expect(mode4(200, 185, true)).toBe(3);
    expect(mode4(950, 250, true)).toBe(3);
    expect(mode4(500, 190, true)).toBe(0);
  });

  /* FCOM figures Mode 4A / Mode 4B Gear Down and Flaps Not in Landing Configuration: a flat ceiling with the TAD. */
  it('mode 4A, TERR function operative: TOO LOW TERRAIN above 200 kt below a flat 500 ft', () => {
    expect(mode4(400, 205, false, true)).toBe(3);
    expect(mode4(700, 250, false, true)).toBe(0);
    expect(mode4(400, 195, false, true)).toBe(1);
  });

  it('mode 4B, TERR function operative: TOO LOW TERRAIN above 180 kt below a flat 245 ft', () => {
    expect(mode4(200, 220, true, true)).toBe(3);
    expect(mode4(300, 220, true, true)).toBe(0);
    expect(mode4(200, 175, true, true)).toBe(2);
  });

  it('TERR SYS OFF or a failed TERR gives the rising ceiling', () => {
    for (const offVar of ['L:A32NX_GPWS_TERR_OFF', 'L:A32NX_TERR_1_FAILED']) {
      vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
        name === 'L:A32NX_WXR_TAWS_SYS_SELECTED' || name === offVar ? 1 : 0,
      );
      expect(LegacyGpws.isTerrainFunctionOperative()).toBe(false);
      vi.restoreAllMocks();
    }
  });
});
