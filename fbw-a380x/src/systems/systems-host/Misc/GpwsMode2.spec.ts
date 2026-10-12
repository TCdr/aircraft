// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { GpwsMode2, GpwsMode2Alert, GpwsMode2Inputs } from './GpwsMode2';
import { LegacyGpws } from './LegacyGpws';
import { LegacySoundManager } from './LegacySoundManager';

/** The LegacyGpws update period, 125 ms */
const DT = 0.125;

interface Flight extends Omit<GpwsMode2Inputs, 'deltaTimeS'> {
  onGround: boolean;
}

function cruiseLow(): Flight {
  return {
    onGround: false,
    radioAltitudeFt: 1500,
    computedAirspeedKt: 250,
    verticalSpeedFtMin: 0,
    altitudeFt: 3000,
    landingFlaps: false,
    gearDown: false,
    ilsDeviationsBelowTwoDots: false,
  };
}

/**
 * Flies for the given time, applying change before each step. Returns the alerts seen, in order, without repeats.
 */
function fly(
  mode2: GpwsMode2,
  flight: Flight,
  seconds: number,
  change: (f: Flight) => void = () => {},
): GpwsMode2Alert[] {
  const seen: GpwsMode2Alert[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    change(flight);
    mode2.updateAirGroundState(flight.onGround, DT);
    const alert = mode2.update({ ...flight, deltaTimeS: DT });
    if (seen[seen.length - 1] !== alert) {
      seen.push(alert);
    }
  }
  return seen;
}

/** Terrain rising under the aircraft: the radio altitude decreases at the given rate */
const risingTerrain = (ftPerMin: number) => (f: Flight) => {
  f.radioAltitudeFt -= (ftPerMin / 60) * DT;
};

/* A380 FCOM DSC-34-20-20-10 EXCESSIVE TERRAIN CLOSURE RATE (MODE 2), a380_fcom.txt:88221-88294 */
describe('GPWS mode 2 (excessive terrain closure rate)', () => {
  it('gives no alert over flat terrain', () => {
    const mode2 = new GpwsMode2();
    expect(fly(mode2, cruiseLow(), 20)).toEqual([GpwsMode2Alert.None]);
  });

  it('gives no alert over rough terrain without a closure trend (the noise that switched the old mode 2 off)', () => {
    const mode2 = new GpwsMode2();
    const flight = cruiseLow();
    flight.radioAltitudeFt = 900;
    let step = 0;
    const seen = fly(mode2, flight, 30, (f) => {
      step++;
      // +-150 ft ridges every step and +-300 ft every 4 steps
      f.radioAltitudeFt = 900 + (step % 2 === 0 ? 150 : -150) + (step % 8 < 4 ? 300 : -300);
    });
    expect(seen).toEqual([GpwsMode2Alert.None]);
  });

  it('mode 2A: TERRAIN, TERRAIN then PULL UP while the closure rate stays excessive, even when not descending', () => {
    const mode2 = new GpwsMode2();
    const flight = cruiseLow();
    const seen = fly(mode2, flight, 8, risingTerrain(5000));
    expect(seen).toEqual([GpwsMode2Alert.None, GpwsMode2Alert.Terrain, GpwsMode2Alert.PullUp]);
  });

  it('mode 2A: after the PULL UP, TERRAIN goes on out of the envelope until 300 ft of altitude gain', () => {
    const mode2 = new GpwsMode2();
    const flight = cruiseLow();
    fly(mode2, flight, 8, risingTerrain(5000));
    // Level terrain again, the aircraft climbs at 1 200 ft/min
    const climb = (f: Flight) => {
      f.altitudeFt += (1200 / 60) * DT;
      f.radioAltitudeFt += (1200 / 60) * DT;
    };
    expect(fly(mode2, flight, 5, climb)).toEqual([GpwsMode2Alert.PullUp, GpwsMode2Alert.Terrain]);
    // 300 ft after leaving the envelope (15 s at 1 200 ft/min): the alert stops
    expect(fly(mode2, flight, 15, climb)).toEqual([GpwsMode2Alert.Terrain, GpwsMode2Alert.None]);
  });

  it('mode 2A: after the PULL UP, the TERRAIN alert stops after 45 s without altitude gain', () => {
    const mode2 = new GpwsMode2();
    const flight = cruiseLow();
    fly(mode2, flight, 8, risingTerrain(5000));
    expect(fly(mode2, flight, 40)).toEqual([GpwsMode2Alert.PullUp, GpwsMode2Alert.Terrain]);
    expect(fly(mode2, flight, 10)).toEqual([GpwsMode2Alert.Terrain, GpwsMode2Alert.None]);
  });

  it('mode 2B, landing gear and flaps in landing configuration: TERRAIN only, no PULL UP', () => {
    const mode2 = new GpwsMode2();
    const flight = cruiseLow();
    flight.radioAltitudeFt = 780;
    flight.computedAirspeedKt = 150;
    flight.verticalSpeedFtMin = -700;
    flight.landingFlaps = true;
    flight.gearDown = true;
    expect(fly(mode2, flight, 5, risingTerrain(4000))).toEqual([GpwsMode2Alert.None, GpwsMode2Alert.Terrain]);
  });

  it('mode 2B in the first 60 s after takeoff: no alert above 789 ft, where mode 2A would alert', () => {
    // On the ground LegacyGpws only follows the air/ground state (below 10 ft RA the GPWS modes are not computed)
    const afterTakeoff = new GpwsMode2();
    for (let t = 0; t < 1; t += DT) {
      afterTakeoff.updateAirGroundState(true, DT);
    }
    const flight = cruiseLow();
    flight.radioAltitudeFt = 1200;
    expect(fly(afterTakeoff, flight, 4.5, risingTerrain(5000))).toEqual([GpwsMode2Alert.None]);

    const later = new GpwsMode2();
    const flight2 = cruiseLow();
    flight2.radioAltitudeFt = 1200;
    expect(fly(later, flight2, 4.5, risingTerrain(5000))).toContain(GpwsMode2Alert.Terrain);
  });
});

/*
 * The PFD PULL UP (EGPWS alert discrete word 1 bit 12, AttitudeIndicatorWarningsA380) of a mode 1 PULL UP: the mode 2
 * bit used to be written over it.
 */
describe('EGPWS alert word PULL UP bit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is set by a mode 1 PULL UP without a mode 2 alert, and by a mode 2 PULL UP', () => {
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation(() => 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
    const gpws = new LegacyGpws(new EventBus(), {} as LegacySoundManager);

    gpws.modes[0].current = 2;
    gpws.modes[1].current = 0;
    gpws.gpwsUpdateDiscreteWords();
    expect(gpws.egpwsAlertDiscreteWord1.bitValue(12)).toBe(true);

    gpws.modes[0].current = 0;
    gpws.modes[1].current = 2;
    gpws.gpwsUpdateDiscreteWords();
    expect(gpws.egpwsAlertDiscreteWord1.bitValue(12)).toBe(true);
    expect(gpws.egpwsAlertDiscreteWord1.bitValue(13)).toBe(false);

    gpws.modes[1].current = 0;
    gpws.gpwsUpdateDiscreteWords();
    expect(gpws.egpwsAlertDiscreteWord1.bitValue(12)).toBe(false);
  });
});
