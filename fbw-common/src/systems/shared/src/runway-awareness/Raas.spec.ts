// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AwarenessRunway, AwarenessRunwayGeometry } from './AwarenessRunway';
import { Raas, RaasAdvisory, RaasCallout, RaasConfig, RaasInputs } from './Raas';

const FT_PER_M = 3.28084;
const EARTH_RADIUS_M = 6_371_000;

/** Runway 09/27, 3000 m by 45 m, threshold elevation 100 m */
const RUNWAY: AwarenessRunway = {
  airport: 'TEST',
  latitude: 45,
  longitude: 5,
  length: 3_000,
  width: 45,
  ends: [
    { number: 9, designator: '', ident: '09', course: 90, displacedThreshold: 0, elevation: 100 },
    { number: 27, designator: '', ident: '27', course: 270, displacedThreshold: 0, elevation: 100 },
  ],
};

const ELEVATION_FT = 100 * FT_PER_M;

const CONFIG: RaasConfig = {
  distanceUnit: 'feet',
  flightDeckOffset: 0,
  takeoffNominalLength: 1_800,
  landingNominalLength: 1_500,
  suppressWindow: [450, 350],
  extendedHoldingInitial: 90,
  extendedHoldingRepeat: 120,
};

/** The latitude and longitude of a point given in the runway frame */
function position(along: number, cross: number): { latitude: number; longitude: number } {
  const course = (RUNWAY.ends[0].course * Math.PI) / 180;
  const east = along * Math.sin(course) + cross * Math.cos(course);
  const north = along * Math.cos(course) - cross * Math.sin(course);
  return {
    latitude: RUNWAY.latitude + (north / EARTH_RADIUS_M) * (180 / Math.PI),
    longitude:
      RUNWAY.longitude + (east / (EARTH_RADIUS_M * Math.cos((RUNWAY.latitude * Math.PI) / 180))) * (180 / Math.PI),
  };
}

function ground(along: number, cross: number, heading: number, groundSpeed: number): RaasInputs {
  return {
    ...position(along, cross),
    trueHeading: heading,
    trueTrack: heading,
    groundSpeed,
    onGround: true,
    altitude: ELEVATION_FT,
    radioAltitude: 0,
    verticalSpeed: 0,
  };
}

function air(along: number, cross: number, track: number, heightAbove: number, verticalSpeed = -700): RaasInputs {
  return {
    ...position(along, cross),
    trueHeading: track,
    trueTrack: track,
    groundSpeed: 140,
    onGround: false,
    altitude: ELEVATION_FT + heightAbove,
    radioAltitude: heightAbove,
    verticalSpeed,
  };
}

function words(callouts: RaasCallout[]): string[] {
  return callouts.map((c) => c.words.map((w) => w.replace(/([A-Z])/g, ' $1').toLowerCase()).join(' '));
}

describe('AwarenessRunwayGeometry', () => {
  it('places points in the runway frame', () => {
    const pos = AwarenessRunwayGeometry.toRunwayFrame(
      RUNWAY,
      position(-1_000, 20).latitude,
      position(-1_000, 20).longitude,
    );
    expect(pos.along).toBeCloseTo(-1_000, 0);
    expect(pos.cross).toBeCloseTo(20, 0);
    expect(AwarenessRunwayGeometry.isOnRunway(RUNWAY, pos)).toBe(true);
    expect(AwarenessRunwayGeometry.distanceToEnd(RUNWAY, 0, pos)).toBeCloseTo(2_500, 0);
    expect(AwarenessRunwayGeometry.distanceToEnd(RUNWAY, 1, pos)).toBeCloseTo(500, 0);
  });

  it('moves the point forward to the flight deck', () => {
    const { latitude, longitude } = position(-1_000, 0);
    const pos = AwarenessRunwayGeometry.toRunwayFrame(RUNWAY, latitude, longitude, 15, 90);
    expect(pos.along).toBeCloseTo(-985, 0);
  });

  it('finds the distance to enter the runway', () => {
    const pos = { along: 0, cross: 100 };
    // Heading north towards the runway from its south side (right of 090)
    expect(AwarenessRunwayGeometry.distanceToEnter(RUNWAY, pos, 0)).toBeCloseTo(77.5, 1);
    expect(AwarenessRunwayGeometry.distanceToEnter(RUNWAY, pos, 180)).toBeNull();
    expect(AwarenessRunwayGeometry.distanceToEnter(RUNWAY, { along: 0, cross: 0 }, 0)).toBe(0);
  });
});

describe('Raas', () => {
  it('says the numbers the RAAS way', () => {
    expect(Raas.numberWords(3_800)).toEqual(['three', 'thousand', 'eight', 'hundred']);
    expect(Raas.numberWords(500)).toEqual(['five', 'hundred']);
    expect(Raas.numberWords(1_200)).toEqual(['one', 'thousand', 'two', 'hundred']);
    expect(Raas.runwayWords({ ...RUNWAY.ends[0], number: 25, designator: 'R' })).toEqual(['two', 'five', 'right']);
    expect(Raas.runwayWords(RUNWAY.ends[0])).toEqual(['zero', 'nine']);
  });

  it('gives Approaching Runway on the ground once, with the nearest runway end', () => {
    const raas = new Raas(CONFIG);
    const all: RaasCallout[] = [];
    // Taxi north at 15 kt towards the western half of the runway, from 300 m south of the centreline
    for (let t = 0, cross = 300; cross > 30; t += 1_000, cross -= 7.7) {
      all.push(...raas.update(ground(-800, cross, 0, 15), [RUNWAY], t));
    }
    expect(words(all)).toEqual(['approaching zero nine']);
    expect(all[0].advisory).toBe(RaasAdvisory.ApproachingRunwayOnGround);
  });

  it('gives On Runway when lining up, with the length remaining on a short runway', () => {
    const raas = new Raas(CONFIG);
    // Entering at 90 degrees: not aligned yet
    expect(raas.update(ground(-1_400, 10, 0, 8), [RUNWAY], 0)).toEqual([]);
    expect(words(raas.update(ground(-1_400, 0, 90, 5), [RUNWAY], 1_000))).toEqual(['on runway zero nine']);
    expect(raas.update(ground(-1_390, 0, 90, 5), [RUNWAY], 2_000)).toEqual([]);

    // An intersection takeoff: 1400 m (4600 ft) left, shorter than 1800 m
    const intersection = new Raas(CONFIG);
    expect(words(intersection.update(ground(100, 0, 90, 5), [RUNWAY], 0))).toEqual([
      'on runway zero nine four thousand six hundred remaining',
    ]);
    // Caution Short Runway when the takeoff roll starts above 40 kt
    expect(words(intersection.update(ground(150, 0, 90, 41), [RUNWAY], 10_000))).toEqual([
      'caution short runway pause short runway',
    ]);
  });

  it('gives On Taxiway above 40 kt off the runways', () => {
    const raas = new Raas(CONFIG);
    expect(raas.update(ground(0, 200, 90, 35), [RUNWAY], 0)).toEqual([]);
    expect(words(raas.update(ground(20, 200, 90, 41), [RUNWAY], 1_000))).toEqual(['on taxiway pause on taxiway']);
    expect(raas.update(ground(40, 200, 90, 45), [RUNWAY], 2_000)).toEqual([]);
    // Not on the runway
    expect(new Raas(CONFIG).update(ground(0, 0, 90, 60), [RUNWAY], 0)).not.toContainEqual(
      expect.objectContaining({ advisory: RaasAdvisory.OnTaxiway }),
    );
  });

  it('gives the distance remaining at a rejected takeoff on the last half of the runway', () => {
    const raas = new Raas(CONFIG);
    const all: RaasCallout[] = [];
    let along = -1_500;
    let gs = 0;
    let t = 0;
    // Accelerate to 130 kt at 3 kt/s, then reject and decelerate at 7 kt/s
    for (; gs < 130; t += 500, gs += 1.5) {
      along += gs * 0.5144 * 0.5;
      all.push(...raas.update(ground(along, 0, 90, gs), [RUNWAY], t));
    }
    for (; gs > 5; t += 500, gs -= 3.5) {
      along += gs * 0.5144 * 0.5;
      all.push(...raas.update(ground(along, 0, 90, gs), [RUNWAY], t));
    }
    const distances = words(all.filter((c) => c.advisory === RaasAdvisory.DistanceRemaining));
    expect(distances.length).toBeGreaterThan(0);
    expect(distances.every((d) => d.endsWith('remaining'))).toBe(true);
    // Never on the first half of the runway (half of 9843 ft)
    expect(distances).not.toContain('five thousand remaining');
  });

  it('gives no distance remaining on a normal takeoff', () => {
    const raas = new Raas(CONFIG);
    const all: RaasCallout[] = [];
    for (let t = 0, along = -1_500, gs = 0; along < 1_400; t += 500, gs = Math.min(gs + 2, 150)) {
      along += gs * 0.5144 * 0.5;
      all.push(...raas.update(ground(along, 0, 90, gs), [RUNWAY], t));
    }
    expect(all.filter((c) => c.advisory === RaasAdvisory.DistanceRemaining)).toEqual([]);
  });

  it('gives the distance remaining at landing, then no On Runway', () => {
    const raas = new Raas(CONFIG);
    const all: RaasCallout[] = [];
    let along = -1_300;
    let t = 0;
    // A long flare over the runway, then the roll-out
    for (let height = 50; height > 0; height -= 5, t += 500) {
      along += 140 * 0.5144 * 0.5;
      all.push(...raas.update(air(along, 0, 90, height, -300), [RUNWAY], t));
    }
    // Decelerate at 2 kt/s: the callouts stop below 40 kt
    for (let gs = 130; gs > 10; gs -= 1, t += 500) {
      along += gs * 0.5144 * 0.5;
      all.push(...raas.update(ground(along, 0, 90, gs), [RUNWAY], t));
    }
    expect(words(all)).toEqual(['four thousand remaining', 'three thousand remaining', 'two thousand remaining']);
  });

  it('gives Approaching Runway in the air outside the suppress window', () => {
    const raas = new Raas(CONFIG);
    const threshold = -1_500;
    // 2 NM out at 700 ft, then down through the 450-350 ft window
    expect(words(raas.update(air(threshold - 3_704, 0, 90, 700), [RUNWAY], 0))).toEqual(['approaching zero nine']);
    expect(raas.update(air(threshold - 2_000, 0, 90, 400), [RUNWAY], 1_000)).toEqual([]);

    const late = new Raas(CONFIG);
    expect(late.update(air(threshold - 1_500, 0, 90, 440), [RUNWAY], 0)).toEqual([]);
    expect(words(late.update(air(threshold - 1_200, 0, 90, 340), [RUNWAY], 1_000))).toEqual(['approaching zero nine']);
    // Below 300 ft: aborted
    expect(new Raas(CONFIG).update(air(threshold - 500, 0, 90, 250), [RUNWAY], 0)).toEqual([]);
  });

  it('gives the length available and the caution on a short runway approach', () => {
    const raas = new Raas({ ...CONFIG, landingNominalLength: 3_500 });
    const threshold = -1_500;
    expect(words(raas.update(air(threshold - 3_704, 0, 90, 700), [RUNWAY], 0))).toEqual([
      'approaching zero nine nine thousand eight hundred available',
    ]);
    expect(words(raas.update(air(threshold - 1_200, 0, 90, 340), [RUNWAY], 1_000))).toEqual([
      'caution short runway pause short runway',
    ]);
  });

  it('gives Caution Taxiway when not lined up with a runway at 200 ft', () => {
    const raas = new Raas(CONFIG);
    expect(words(raas.update(air(-2_000, 200, 90, 200), [RUNWAY], 0))).toEqual([
      'caution taxiway pause caution taxiway',
    ]);
    expect(new Raas(CONFIG).update(air(-2_000, 0, 90, 200), [RUNWAY], 0)).toEqual([]);
  });

  it('gives the extended holding advisory after 90 s, then every 120 s', () => {
    const raas = new Raas(CONFIG);
    const all: RaasCallout[] = [];
    for (let t = 0; t <= 215_000; t += 1_000) {
      all.push(...raas.update(ground(-1_450, 0, 90, 0), [RUNWAY], t));
    }
    expect(words(all)).toEqual([
      'on runway zero nine',
      'on runway zero nine pause on runway zero nine',
      'on runway zero nine pause on runway zero nine',
    ]);
    expect(all[1].time).toBe(90_000);
    expect(all[2].time).toBe(210_000);
  });

  it('gives Runway End within 100 ft of the end', () => {
    const raas = new Raas(CONFIG);
    raas.update(ground(1_400, 0, 90, 10), [RUNWAY], 0);
    expect(words(raas.update(ground(1_475, 0, 90, 10), [RUNWAY], 1_000))).toEqual(['one hundred remaining']);
    expect(raas.update(ground(1_478, 0, 90, 10), [RUNWAY], 2_000)).toEqual([]);
  });

  it('uses meters when set', () => {
    const raas = new Raas({ ...CONFIG, distanceUnit: 'meters' });
    raas.update(ground(1_400, 0, 90, 10), [RUNWAY], 0);
    expect(words(raas.update(ground(1_475, 0, 90, 10), [RUNWAY], 1_000))).toEqual(['thirty remaining']);
  });
});
