// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { DestinationWords, destinationDataOf } from './DestinationWords';

interface Write {
  value: number;
  ssm: Arinc429SignStatusMatrix;
  bits: number;
  rangeMax: number;
  rangeMin: number;
}

const recordingWord = () => {
  const writes: Write[] = [];
  return {
    writes,
    setBnrValue: (value: number, ssm: Arinc429SignStatusMatrix, bits: number, rangeMax: number, rangeMin: number) => {
      writes.push({ value, ssm, bits, rangeMax, rangeMin });
    },
  };
};

const setup = () => {
  const elevation = recordingWord();
  const latitude = recordingWord();
  const longitude = recordingWord();
  return { elevation, latitude, longitude, words: new DestinationWords(elevation, latitude, longitude) };
};

const elevationEncoding = { bits: 14, rangeMax: 16384, rangeMin: -2048 };
const positionEncoding = { bits: 18, rangeMax: 180, rangeMin: -180 };
const normal = Arinc429SignStatusMatrix.NormalOperation;
const noData = { value: 0, ssm: Arinc429SignStatusMatrix.NoComputedData };
const elevationNoData = { ...noData, ...elevationEncoding };
const positionNoData = { ...noData, ...positionEncoding };
const noDestination = { landingElevation: null, latitude: null, longitude: null };

describe('Destination words', () => {
  it('the first update without a destination writes no computed data to all three words', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update(noDestination);

    expect(elevation.writes).toEqual([elevationNoData]);
    expect(latitude.writes).toEqual([positionNoData]);
    expect(longitude.writes).toEqual([positionNoData]);
  });

  it('a destination airport writes its elevation and position as normal operation', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update({ landingElevation: 433, latitude: 49.0097, longitude: 2.5479 });

    expect(elevation.writes).toEqual([{ value: 433, ssm: normal, ...elevationEncoding }]);
    expect(latitude.writes).toEqual([{ value: 49.0097, ssm: normal, ...positionEncoding }]);
    expect(longitude.writes).toEqual([{ value: 2.5479, ssm: normal, ...positionEncoding }]);
  });

  it('a new destination replaces the previous one', () => {
    const { elevation, words } = setup();

    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update({ landingElevation: 12, latitude: 51, longitude: -0.4 });

    expect(elevation.writes[1]).toEqual({ value: 12, ssm: normal, ...elevationEncoding });
  });

  it('an airport at 0 ft is a valid elevation, not missing data', () => {
    const { elevation, words } = setup();

    words.update({ landingElevation: 0, latitude: 51.5, longitude: 0.1 });

    expect(elevation.writes).toEqual([{ value: 0, ssm: normal, ...elevationEncoding }]);
  });

  it('an airport without a known elevation still sends its position', () => {
    const { elevation, latitude, words } = setup();

    words.update({ landingElevation: null, latitude: 51.5, longitude: 0.1 });

    expect(elevation.writes).toEqual([elevationNoData]);
    expect(latitude.writes[0].ssm).toBe(normal);
  });

  it('removing the destination goes back to no computed data', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update(noDestination);

    expect(elevation.writes[1]).toEqual(elevationNoData);
    expect(latitude.writes[1]).toEqual(positionNoData);
    expect(longitude.writes[1]).toEqual(positionNoData);
  });

  it('the same data twice is written once', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update(noDestination);
    words.update(noDestination);

    expect(elevation.writes).toHaveLength(2);
    expect(latitude.writes).toHaveLength(2);
    expect(longitude.writes).toHaveLength(2);
  });

  it('reports a changed landing elevation, but not the first absence of a destination', () => {
    const { words } = setup();

    expect(words.update(noDestination)).toBe(false);
    expect(words.update({ landingElevation: 0, latitude: 1, longitude: 1 })).toBe(true);
    expect(words.update({ landingElevation: 0, latitude: 2, longitude: 2 })).toBe(false);
    expect(words.update({ landingElevation: 433, latitude: 2, longitude: 2 })).toBe(true);
    expect(words.update(noDestination)).toBe(true);
    expect(words.update(noDestination)).toBe(false);
  });

  it('reports the first landing elevation', () => {
    const { words } = setup();

    expect(words.update({ landingElevation: 433, latitude: 1, longitude: 1 })).toBe(true);
  });

  it('a latitude that is not a number is sent as no computed data and not rewritten', () => {
    const { latitude, longitude, words } = setup();
    const airport = { location: { lat: NaN, long: 2.5, alt: 433 } };

    words.update(destinationDataOf(undefined, airport));
    words.update(destinationDataOf(undefined, airport));

    expect(latitude.writes).toEqual([positionNoData]);
    expect(longitude.writes).toEqual([{ value: 2.5, ssm: normal, ...positionEncoding }]);
  });
});

describe('Destination data', () => {
  const runway = { thresholdLocation: { lat: 49.01, long: 2.55, alt: 392 } };
  const airport = { location: { lat: 49.0097, long: 2.5479, alt: 433 } };

  it('prefers the runway threshold over the airport', () => {
    expect(destinationDataOf(runway, airport)).toEqual({ landingElevation: 392, latitude: 49.01, longitude: 2.55 });
  });

  it('uses the airport when there is no runway', () => {
    const expected = { landingElevation: 433, latitude: 49.0097, longitude: 2.5479 };

    expect(destinationDataOf(undefined, airport)).toEqual(expected);
    expect(destinationDataOf(null, airport)).toEqual(expected);
  });

  it('has no data without a runway and an airport', () => {
    expect(destinationDataOf(undefined, undefined)).toEqual(noDestination);
    expect(destinationDataOf(null, null)).toEqual(noDestination);
  });

  it('treats values that are not numbers as missing', () => {
    expect(destinationDataOf({ thresholdLocation: { lat: NaN, long: 2.55, alt: NaN } }, airport)).toEqual({
      landingElevation: null,
      latitude: null,
      longitude: 2.55,
    });
    expect(destinationDataOf(undefined, { location: { lat: 49, long: NaN, alt: NaN } })).toEqual({
      landingElevation: null,
      latitude: 49,
      longitude: null,
    });
  });
});
