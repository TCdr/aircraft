// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LegacyGpws } from './LegacyGpws';
import { LegacySoundManager, soundList } from './LegacySoundManager';
import { A380XRadioAutoCallOutFlags } from '../../shared/src/AutoCallOuts';

/*
 * The FLAP MODE button set to OFF inhibits mode 4B. The MFD SURV CONTROLS page writes L:A32NX_GPWS_FLAPS_OFF.
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
 * Mode 4A above 200 kt and mode 4B above 180 kt give TOO LOW TERRAIN instead of TOO LOW GEAR / TOO LOW FLAPS (A380
 * values, not the A320 190 kt and 159 kt).
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

  /* Mode 4A and mode 4B with the gear down and the flaps not in landing configuration: a flat ceiling with the TAD. */
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
 * Mode 4A is the landing gear up AND the flaps not extended for landing; the landing gear up with the flaps extended
 * for landing is mode 4B, TOO LOW GEAR only (flat 245 ft ceiling up to 400 kt, no TOO LOW TERRAIN).
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
 * The FIVE HUNDRED callout is either the normal or the smart one; the smart FIVE HUNDRED is called out only when the
 * glide deviation is more than half a dot.
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

/*
 * Intermediate callout: below 400 ft, the current height 11 s
 * after the previous predetermined callout (4 s below 100 ft), rounded to the lower 10 ft.
 */
describe('Intermediate callout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Flies the GPWS updates (125 ms) through the heights, returns the queued sounds with their time */
  const fly = (heights: (t: number) => number, seconds: number, initialState = 'over400') => {
    let radioAlt = 0;
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) =>
      name === 'L:A32NX_RA_1_RADIO_ALTITUDE'
        ? Arinc429Word.getRawWord(radioAlt, Arinc429SignStatusMatrix.NormalOperation)
        : 0,
    );
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
    const bus = new EventBus();
    const sounds: { sound: string; at: number }[] = [];
    let time = 0;
    bus
      .getSubscriber<{ enqueueSound: string }>()
      .on('enqueueSound')
      .handle((sound) => sounds.push({ sound, at: time }));
    const gpws = new LegacyGpws(bus, {} as LegacySoundManager);
    gpws.AltCallState.setState(initialState);
    for (let step = 1; step <= seconds * 8; step++) {
      time = step * 0.125;
      radioAlt = heights(time);
      gpws.gpws(125);
    }
    return sounds;
  };

  it('holding 395 ft after FOUR HUNDRED: THREE HUNDRED NINETY 11 s later, then every 11 s', () => {
    expect(fly(() => 395, 24)).toEqual([
      { sound: 'alt_400', at: 0.125 },
      { sound: 'intermediate_300', at: 11.125 },
      { sound: 'intermediate_90', at: 11.125 },
      { sound: 'intermediate_300', at: 22.125 },
      { sound: 'intermediate_90', at: 22.125 },
    ]);
  });

  it('fills the gaps of the default pins in a 700 ft/min descent from 420 ft', () => {
    const sounds = fly((t) => 420 - (700 / 60) * t, 33);
    // default pins: FOUR HUNDRED, then nothing down to FIFTY
    expect(sounds.filter((s) => s.sound.startsWith('alt_'))).toEqual([
      { sound: 'alt_400', at: 0.875 }, // 409.8 ft
      { sound: 'alt_50', at: 31.5 }, // 52.5 ft
      { sound: 'alt_40', at: 32.5 }, // 40.8 ft
    ]);
    // 11 s after the descent below 400 ft (1.75 s), then 11 s later, then 4 s later below 100 ft; FIFTY restarts the time
    expect(sounds.filter((s) => s.sound.startsWith('intermediate_'))).toEqual([
      { sound: 'intermediate_200', at: 12.625 }, // 272.7 ft
      { sound: 'intermediate_70', at: 12.625 },
      { sound: 'intermediate_100', at: 23.625 }, // 144.4 ft
      { sound: 'intermediate_40', at: 23.625 },
      { sound: 'intermediate_90', at: 27.625 }, // 97.7 ft: NINETY SEVEN
      { sound: 'intermediate_7', at: 27.625 },
    ]);
  });

  it('none while climbing', () => {
    expect(fly((t) => 150 + 10 * t, 20, 'over100')).toEqual([]);
  });
});

/*
 * The TERRAIN (mode 2) and GLIDE SLOPE (mode 5) aurals, and the priority of the stall and windshear alerts over the
 * GPWS visual and aural alerts.
 */
describe('GPWS mode 2 and mode 5 aurals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The periodic sounds the GPWS starts for that mode state */
  const soundsFor = (modeIndex: number, state: number) => {
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
    const started: string[] = [];
    const soundManager = {
      addPeriodicSound: (sound: { name: string } | undefined) => sound && started.push(sound.name),
      removePeriodicSound: () => {},
    } as unknown as LegacySoundManager;
    const gpws = new LegacyGpws(new EventBus(), soundManager);
    gpws.modes[modeIndex].current = state;
    gpws.GPWSComputeLightsAndCallouts();
    return started;
  };

  it('mode 2: TERRAIN, then PULL UP', () => {
    expect(soundsFor(1, 1)).toEqual([soundList.terrain.name]);
    expect(soundsFor(1, 2)).toEqual([soundList.pull_up.name]);
  });

  it('mode 5: GLIDE SLOPE, louder when hard', () => {
    expect(soundsFor(4, 1)).toEqual([soundList.glideslope_quiet.name]);
    expect(soundsFor(4, 2)).toEqual([soundList.glideslope_loud.name]);
  });

  /** The mode 5 state, 2.5 dots below the glide slope at 500 ft, with or without the windshear / stall warnings */
  const mode5StateWith = (windshear: boolean, stallFws1: boolean, stallFws2 = false) => {
    vi.stubGlobal('Simplane', { getVerticalSpeed: () => -800 });
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
    // FWS discrete word 126, bit 17 = STALL warning (FwsCore.ts)
    const fwsWord126 = (stall: boolean) =>
      Arinc429Word.getRawWord(stall ? 1 << 16 : 0, Arinc429SignStatusMatrix.NormalOperation);
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => {
      switch (name) {
        case 'L:A32NX_RA_1_RADIO_ALTITUDE':
          return Arinc429Word.getRawWord(500, Arinc429SignStatusMatrix.NormalOperation);
        case 'L:A32NX_WXR_TAWS_SYS_SELECTED':
          return 1;
        case 'L:A32NX_RADIO_RECEIVER_GS_IS_VALID':
          return 1;
        case 'L:A32NX_RADIO_RECEIVER_GS_DEVIATION':
          return -1; // 2.5 dots below the glide slope
        case 'L:A32NX_REACTIVE_WINDSHEAR_WARNING':
          return windshear ? 1 : 0;
        case 'L:A32NX_FWC_1_DISCRETE_WORD_126':
          return fwsWord126(stallFws1);
        case 'L:A32NX_FWC_2_DISCRETE_WORD_126':
          return fwsWord126(stallFws2);
        case 'GEAR TOTAL PCT EXTENDED':
          return 100;
        default:
          return 0;
      }
    });
    const gpws = new LegacyGpws(new EventBus(), {
      addPeriodicSound: () => {},
      removePeriodicSound: () => {},
    } as unknown as LegacySoundManager);
    gpws.gpws(125);
    return gpws.modes[4].current;
  };

  it('a STALL warning of either FWS removes the GPWS alerts', () => {
    expect(mode5StateWith(false, false)).toBeGreaterThan(0);
    expect(mode5StateWith(false, true)).toBe(0);
    expect(mode5StateWith(false, false, true)).toBe(0);
  });

  it('a reactive windshear warning removes the GPWS alerts', () => {
    expect(mode5StateWith(false, false)).toBeGreaterThan(0);
    expect(mode5StateWith(true, false)).toBe(0);
  });
});
