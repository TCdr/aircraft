// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LegacyGpws } from './LegacyGpws';
import { LegacySoundManager } from './LegacySoundManager';
import { A380XRadioAutoCallOutFlags } from '../../shared/src/AutoCallOuts';

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

/*
 * A380 FCOM DSC-34-20-20-10 (a380_fcom.txt l.88328-88366): mode 4A is the landing gear up AND the flaps not extended
 * for landing; the landing gear up with the flaps extended for landing is mode 4B, TOO LOW GEAR only (figure Mode 4B
 * Gear Up and Flaps in Landing Configuration: flat 245 ft ceiling up to 400 kt, no TOO LOW TERRAIN).
 * mode.current: 1 = TOO LOW GEAR, 2 = TOO LOW FLAPS, 3 = TOO LOW TERRAIN.
 */
describe('GPWS mode 4B with the landing gear up and the flaps in landing configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const gearUpLandingFlaps = (radioAlt: number, speed: number, flapModeOff = false) => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === 'L:A32NX_GPWS_FLAPS_OFF' && flapModeOff ? 1 : 0,
    );
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);
    const mode = { current: 0, previous: 0, type: [] };
    gpws.GPWSMode4(mode, radioAlt, speed, true, false, FmgcFlightPhase.Approach);
    return mode.current;
  };

  it('TOO LOW GEAR below 245 ft', () => {
    expect(gearUpLandingFlaps(200, 150)).toBe(1);
  });

  it('no alert between 245 ft and 500 ft (the mode 4A ceiling)', () => {
    expect(gearUpLandingFlaps(400, 150)).toBe(0);
  });

  it('TOO LOW GEAR, not TOO LOW TERRAIN, above 200 kt', () => {
    expect(gearUpLandingFlaps(200, 230)).toBe(1);
    expect(gearUpLandingFlaps(400, 230)).toBe(0);
  });

  it('FLAP MODE OFF keeps the TOO LOW GEAR alert (design choice)', () => {
    expect(gearUpLandingFlaps(200, 150, true)).toBe(1);
  });
});

describe('GPWS mode 4 alert ends above the ceiling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mode 4A TOO LOW GEAR stops once the aircraft climbs back above 500 ft', () => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation(() => 0);
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);
    const mode = { current: 0, previous: 0, type: [] };
    gpws.GPWSMode4(mode, 400, 150, false, false, FmgcFlightPhase.Approach);
    expect(mode.current).toBe(1);
    gpws.GPWSMode4(mode, 600, 150, false, false, FmgcFlightPhase.Approach);
    expect(mode.current).toBe(0);
  });

  it('mode 4B TOO LOW FLAPS stops once the aircraft climbs back above 245 ft', () => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation(() => 0);
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);
    const mode = { current: 0, previous: 0, type: [] };
    gpws.GPWSMode4(mode, 200, 150, false, true, FmgcFlightPhase.Approach);
    expect(mode.current).toBe(2);
    gpws.GPWSMode4(mode, 300, 150, false, true, FmgcFlightPhase.Approach);
    expect(mode.current).toBe(0);
  });
});

/*
 * A380 FCOM DSC-34-10-50 AUTOMATIC CALLOUTS (a380_fcom.txt 86490-86491, 86528): "FIVE HUNDRED or Smart FIVE HUNDRED";
 * the smart FIVE HUNDRED "is triggered only if the glide deviation exceeds a half dot". Before, the smart pin was
 * ignored and FIVE HUNDRED was always called out.
 */
describe('Smart FIVE HUNDRED callout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Descends through 500 ft with that pin programming and glide deviation (degrees), returns the queued sounds */
  const descendThrough500 = (pins: number, glideValid: boolean, glideDeviationDeg: number) => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => {
      if (name === 'L:A32NX_RADIO_RECEIVER_GS_IS_VALID') {
        return glideValid ? 1 : 0;
      }
      return name === 'L:A32NX_RADIO_RECEIVER_GS_DEVIATION' ? glideDeviationDeg : 0;
    });
    const bus = new EventBus();
    const sounds: string[] = [];
    bus
      .getSubscriber<{ enqueueSound: string }>()
      .on('enqueueSound')
      .handle((sound) => sounds.push(sound));
    const gpws = new LegacyGpws(bus, {} as LegacySoundManager);
    gpws.autoCallOutPins = pins;
    gpws.AltCallState.setState('over500');
    gpws.UpdateAltState(510);
    return sounds;
  };

  const normal = A380XRadioAutoCallOutFlags.FiveHundred;
  const smart = A380XRadioAutoCallOutFlags.FiveHundred | A380XRadioAutoCallOutFlags.FiveHundredGlide;

  it('FIVE HUNDRED pin: always called out', () => {
    expect(descendThrough500(normal, true, 0)).toEqual(['alt_500']);
  });

  it('smart FIVE HUNDRED: not called out on the glide (within half a dot)', () => {
    // 0.1 degree = 0.25 dot
    expect(descendThrough500(smart, true, 0.1)).toEqual([]);
  });

  it('smart FIVE HUNDRED: called out more than half a dot off the glide, either side', () => {
    // 0.3 degree = 0.75 dot
    expect(descendThrough500(smart, true, 0.3)).toEqual(['alt_500']);
    expect(descendThrough500(smart, true, -0.3)).toEqual(['alt_500']);
  });

  it('smart FIVE HUNDRED: called out without a valid glide', () => {
    expect(descendThrough500(smart, false, 0)).toEqual(['alt_500']);
  });

  it('no FIVE HUNDRED pin: never called out', () => {
    expect(descendThrough500(A380XRadioAutoCallOutFlags.FourHundred, false, 1)).toEqual([]);
  });
});
