// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IntermediateCallout, IntermediateCalloutAural, intermediateCalloutWords } from './AutoCallOuts';

/** A step exact in binary floating point, so the times add up exactly */
const STEP = 0.125;

interface Segment {
  seconds: number;
  height: number | null | ((t: number) => number);
  /** a predetermined callout at the first update of the segment */
  predetermined?: boolean;
  inhibited?: boolean;
}

/** Runs the callout over the segments, returns each callout with its time from the start */
function fly(segments: Segment[]) {
  const callout = new IntermediateCallout();
  const said: { words: IntermediateCalloutAural[]; at: number }[] = [];
  let time = 0;
  for (const segment of segments) {
    for (let step = 1; step <= Math.round(segment.seconds / STEP); step++) {
      time += STEP;
      const height = typeof segment.height === 'function' ? segment.height(step * STEP) : segment.height;
      const words = callout.update(height, !!segment.predetermined && step === 1, !!segment.inhibited, STEP);
      if (words.length > 0) {
        said.push({ words, at: time });
      }
    }
  }
  return said;
}

describe('A380 intermediate callout words (a380_fcom.txt l.86544-86547)', () => {
  it('between 400 ft and 100 ft: the height rounded to the lower 10 ft, hundreds then tens', () => {
    expect(intermediateCalloutWords(229)).toEqual(['intermediate_200', 'intermediate_20']);
    expect(intermediateCalloutWords(399)).toEqual(['intermediate_300', 'intermediate_90']);
    expect(intermediateCalloutWords(300)).toEqual(['intermediate_300']);
    expect(intermediateCalloutWords(105)).toEqual(['intermediate_100']);
  });

  it('below 100 ft: the tens word (the bank has no unit words), FIVE from 5 to 9 ft, nothing below', () => {
    expect(intermediateCalloutWords(99)).toEqual(['intermediate_90']);
    expect(intermediateCalloutWords(47)).toEqual(['intermediate_40']);
    expect(intermediateCalloutWords(10)).toEqual(['intermediate_10']);
    expect(intermediateCalloutWords(9)).toEqual(['intermediate_5']);
    expect(intermediateCalloutWords(4)).toEqual([]);
  });
});

describe('A380 intermediate callout timing (a380_fcom.txt l.86539-86543)', () => {
  it('between 400 ft and 100 ft: 11 s after the previous predetermined callout, then every 11 s', () => {
    const said = fly([
      { seconds: 0.125, height: 400, predetermined: true },
      { seconds: 25, height: 270 },
    ]);
    expect(said).toEqual([
      { words: ['intermediate_200', 'intermediate_70'], at: 11.125 },
      { words: ['intermediate_200', 'intermediate_70'], at: 22.125 },
    ]);
  });

  it('below 100 ft: 4 s after the previous predetermined callout, then every 4 s', () => {
    const said = fly([
      { seconds: 0.125, height: 60, predetermined: true },
      { seconds: 9, height: 62 },
    ]);
    expect(said).toEqual([
      { words: ['intermediate_60'], at: 4.125 },
      { words: ['intermediate_60'], at: 8.125 },
    ]);
  });

  it('a predetermined callout restarts the time', () => {
    const said = fly([
      { seconds: 0.125, height: 390, predetermined: true },
      { seconds: 10, height: 380 },
      { seconds: 0.125, height: 300, predetermined: true },
      { seconds: 10, height: 290 },
    ]);
    expect(said).toEqual([]);
  });

  it('nothing at or above 400 ft; the time starts at the descent below 400 ft', () => {
    const said = fly([
      { seconds: 30, height: 450 },
      { seconds: 11, height: 350 },
    ]);
    expect(said).toEqual([{ words: ['intermediate_300', 'intermediate_50'], at: 41 }]);
  });

  it('waits while inhibited (climbing, RETARD, GPWS), then comes at once', () => {
    const said = fly([
      { seconds: 15, height: 150, inhibited: true },
      { seconds: 0.125, height: 150 },
    ]);
    expect(said).toEqual([{ words: ['intermediate_100', 'intermediate_50'], at: 15.125 }]);
  });

  it('nothing with an invalid radio height', () => {
    expect(fly([{ seconds: 20, height: null }])).toEqual([]);
  });
});
