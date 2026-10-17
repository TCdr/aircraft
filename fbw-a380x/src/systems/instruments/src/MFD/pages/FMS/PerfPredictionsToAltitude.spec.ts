// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  NO_PREDICTION_TO_ALTITUDE,
  PredictionsToAltitudeProfile,
  predictionToAltitudeText,
} from './PerfPredictionsToAltitude';

/** A profile that reaches the asked altitude 12 min and 74.4 NM ahead (climb) or 9 min and 31.6 NM ahead (descent) */
function profile(ready = true): PredictionsToAltitudeProfile & { asked: number[] } {
  const asked: number[] = [];
  return {
    asked,
    isReadyToDisplay: ready,
    computeClimbPredictionToAltitude: (altitude) => {
      asked.push(altitude);
      return altitude > 41_000 ? undefined : { altitude, distanceFromStart: 74.4, secondsFromPresent: 720 };
    },
    computeDescentPredictionToAltitude: (altitude) => {
      asked.push(altitude);
      return { altitude, distanceFromStart: 31.6, secondsFromPresent: 540 };
    },
  };
}

const minutes = (seconds: number) => `+${(seconds / 60).toFixed(0).padStart(4, '0')}`;

describe('PERF CLB / DES time and distance to the PRED TO altitude', () => {
  it('shows the time and distance to the reference altitude under the placeholder dashes', () => {
    const climb = profile();
    const text = predictionToAltitudeText(climb, 35_000, true, minutes);
    expect(text).toBe('+0012     74');
    expect(text.length).toBe(NO_PREDICTION_TO_ALTITUDE.length);
    expect(climb.asked).toEqual([35_000]);

    const descent = profile();
    expect(predictionToAltitudeText(descent, 10_000, false, minutes)).toBe('+0009     32');
    expect(descent.asked).toEqual([10_000]);
  });

  it('shows dashes without reference altitude, without profile, or when the altitude is not reached', () => {
    expect(predictionToAltitudeText(profile(), null, true, minutes)).toBe(NO_PREDICTION_TO_ALTITUDE);
    expect(predictionToAltitudeText(undefined, 35_000, true, minutes)).toBe(NO_PREDICTION_TO_ALTITUDE);
    expect(predictionToAltitudeText(profile(false), 35_000, true, minutes)).toBe(NO_PREDICTION_TO_ALTITUDE);
    expect(predictionToAltitudeText(profile(), 43_000, true, minutes)).toBe(NO_PREDICTION_TO_ALTITUDE);
  });
});
