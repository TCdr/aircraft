// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Runway } from '@flybywiresim/fbw-sdk';
import { placeBearingDistance } from 'msfs-geo';
import { EgpwcRunwayWords, egpwcDestinationRunway, egpwcOriginRunway } from './EgpwcRunwayWords';

const START = { lat: 47.0, long: 8.0 };

/** 3000 m towards 340 degrees true, the threshold displaced 300 m from the start */
function runway(thresholdElevation = 1_400): Runway {
  const threshold = placeBearingDistance(START, 340, 300 / 1852);
  return {
    startLocation: START,
    thresholdLocation: { ...threshold, alt: thresholdElevation },
    bearing: 340,
    length: 3_000,
  } as unknown as Runway;
}

function wordValues(words: EgpwcRunwayWords): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const word of words.words) {
    values[word.name] = word.valueOr(null);
  }
  return values;
}

describe('EGPWC runway words', () => {
  it('the origin runway starts at the physical start, for its whole length', () => {
    const origin = egpwcOriginRunway(runway());
    expect(origin?.latitude).toBe(47.0);
    expect(origin?.longitude).toBe(8.0);
    expect(origin?.elevation).toBe(1_400);
    expect(origin?.trueBearing).toBe(340);
    expect(origin?.length).toBeCloseTo(9_842.5, 0);
  });

  it('the destination runway starts at the threshold, for the length beyond it', () => {
    const destination = egpwcDestinationRunway(runway());
    const threshold = runway().thresholdLocation;
    expect(destination?.latitude).toBe(threshold.lat);
    expect(destination?.longitude).toBe(threshold.long);
    expect(destination?.length).toBeCloseTo(2_700 / 0.3048, 0);
  });

  it('a runway without a threshold elevation is not sent', () => {
    expect(egpwcOriginRunway(runway(NaN))).toBeNull();
    expect(egpwcDestinationRunway(runway(NaN))).toBeNull();
    expect(egpwcOriginRunway(undefined)).toBeNull();
  });

  it('writes the origin runway and the destination direction and length', () => {
    const words = new EgpwcRunwayWords();
    words.update({ originRunway: runway(), destinationRunway: runway() });
    const values = wordValues(words);
    expect(values.ORIGIN_RWY_LAT).toBeCloseTo(47.0, 3);
    expect(values.ORIGIN_RWY_LONG).toBeCloseTo(8.0, 3);
    expect(values.ORIGIN_RWY_ELEVATION).toBeCloseTo(1_400, 0);
    // A BNR angle word holds -180 to 180 degrees
    expect(values.ORIGIN_RWY_TRUE_BEARING).toBeCloseTo(-20, 2);
    expect(values.ORIGIN_RWY_LENGTH).toBeCloseTo(9_842.5, -1);
    expect(values.DEST_RWY_TRUE_BEARING).toBeCloseTo(-20, 2);
    expect(values.DEST_RWY_LENGTH).toBeCloseTo(8_858, -1);
  });

  it('sends no computed data without the runways', () => {
    const words = new EgpwcRunwayWords();
    words.update({ originRunway: runway(), destinationRunway: runway() });
    words.update({});
    expect(Object.values(wordValues(words)).every((value) => value === null)).toBe(true);
    words.update(null);
    expect(Object.values(wordValues(words)).every((value) => value === null)).toBe(true);
  });

  it('sends the origin runway alone when there is no destination runway', () => {
    const words = new EgpwcRunwayWords();
    words.update({ originRunway: runway() });
    const values = wordValues(words);
    expect(values.ORIGIN_RWY_LAT).not.toBeNull();
    expect(values.DEST_RWY_TRUE_BEARING).toBeNull();
    expect(values.DEST_RWY_LENGTH).toBeNull();
  });
});
