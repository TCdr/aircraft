// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  IntermediateCalloutHeight,
  IntermediateHeightCallout,
  intermediateCalloutHeight,
} from './IntermediateHeightCallout';

/** A step exact in binary floating point, so the times add up exactly */
const STEP = 0.125;

interface Segment {
  seconds: number;
  /** radio height, constant or as a function of the time in the segment */
  height: number | null | ((t: number) => number);
  /** a predetermined callout at the first update of the segment */
  predetermined?: boolean;
  inhibited?: boolean;
}

/** Runs the callout over the segments, returns each height said with its time from the start */
function fly(segments: Segment[], callout = new IntermediateHeightCallout()) {
  const said: { height: IntermediateCalloutHeight; at: number }[] = [];
  let time = 0;
  for (const segment of segments) {
    const steps = Math.round(segment.seconds / STEP);
    for (let step = 1; step <= steps; step++) {
      time += STEP;
      const height = typeof segment.height === 'function' ? segment.height(step * STEP) : segment.height;
      const word = callout.update(height, !!segment.predetermined && step === 1, !!segment.inhibited, STEP);
      if (word !== null) {
        said.push({ height: word, at: time });
      }
    }
  }
  return said;
}

describe('A320 intermediate callout (a320_fcom.txt l.53585-53594)', () => {
  it('above 50 ft: the present height 11 s after the last predetermined callout, then every 4 s', () => {
    const said = fly([
      { seconds: 0.125, height: 250, predetermined: true },
      { seconds: 20, height: 250 },
    ]);
    expect(said).toEqual([
      { height: 200, at: 11.125 },
      { height: 200, at: 15.125 },
      { height: 200, at: 19.125 },
    ]);
  });

  it('below 50 ft: 4 s after the last predetermined callout, then every 4 s', () => {
    const said = fly([
      { seconds: 0.125, height: 32, predetermined: true },
      { seconds: 9, height: 32 },
    ]);
    expect(said).toEqual([
      { height: 30, at: 4.125 },
      { height: 30, at: 8.125 },
    ]);
  });

  it('a predetermined callout restarts the time', () => {
    const said = fly([
      { seconds: 0.125, height: 380, predetermined: true },
      { seconds: 8, height: 380 },
      { seconds: 0.125, height: 300, predetermined: true },
      { seconds: 12, height: 290 },
    ]);
    expect(said).toEqual([{ height: 200, at: 8.25 + 11 }]);
  });

  it('says the present height with the callout words, rounded down', () => {
    expect([409, 399, 300, 299, 101, 99, 50, 49, 41, 39, 21, 12, 9, 5, 4].map(intermediateCalloutHeight)).toEqual([
      400,
      300,
      300,
      200,
      100,
      50,
      50,
      40,
      40,
      30,
      20,
      10,
      5,
      5,
      null,
    ]);
  });

  it('nothing at or above 410 ft, and the time starts at the descent below 410 ft', () => {
    const said = fly([
      { seconds: 30, height: 600 },
      { seconds: 12, height: 405 },
    ]);
    expect(said).toEqual([{ height: 400, at: 30 + 11 }]);
  });

  it('nothing with an invalid radio height, and the time starts again', () => {
    const said = fly([
      { seconds: 8, height: 200 },
      { seconds: 1, height: null },
      { seconds: 8, height: 200 },
    ]);
    expect(said).toEqual([]);
  });

  it('waits while the callouts are inhibited, then comes at once', () => {
    const said = fly([
      { seconds: 15, height: 150, inhibited: true },
      { seconds: 0.125, height: 150 },
    ]);
    expect(said).toEqual([{ height: 100, at: 15.125 }]);
  });

  it('follows the height in a slow descent', () => {
    // 2 ft/s from 400 ft after the FOUR HUNDRED callout
    const said = fly([
      { seconds: 0.125, height: 400, predetermined: true },
      { seconds: 30, height: (t) => 400 - 2 * t },
    ]);
    expect(said).toEqual([
      { height: 300, at: 11.125 }, // 378 ft
      { height: 300, at: 15.125 }, // 370 ft
      { height: 300, at: 19.125 }, // 362 ft
      { height: 300, at: 23.125 }, // 354 ft
      { height: 300, at: 27.125 }, // 346 ft
    ]);
  });
});
