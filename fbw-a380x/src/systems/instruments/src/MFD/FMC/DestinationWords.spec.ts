// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { DestinationWords } from './DestinationWords';

interface Write {
  value: number;
  ssm: Arinc429SignStatusMatrix;
}

const recordingWord = () => {
  const writes: Write[] = [];
  return { writes, setBnrValue: (value: number, ssm: Arinc429SignStatusMatrix) => writes.push({ value, ssm }) };
};

const setup = () => {
  const elevation = recordingWord();
  const latitude = recordingWord();
  const longitude = recordingWord();
  return { elevation, latitude, longitude, words: new DestinationWords(elevation, latitude, longitude) };
};

const noDestination = { landingElevation: null, latitude: null, longitude: null };
const noData: Write = { value: 0, ssm: Arinc429SignStatusMatrix.NoComputedData };

describe('Destination words', () => {
  it('the first update without a destination writes no computed data to all three words', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update(noDestination);

    expect(elevation.writes).toEqual([noData]);
    expect(latitude.writes).toEqual([noData]);
    expect(longitude.writes).toEqual([noData]);
  });

  it('a destination airport writes its elevation and position as normal operation', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update({ landingElevation: 433, latitude: 49.0097, longitude: 2.5479 });

    expect(elevation.writes).toEqual([{ value: 433, ssm: Arinc429SignStatusMatrix.NormalOperation }]);
    expect(latitude.writes).toHaveLength(1);
    expect(latitude.writes[0].ssm).toBe(Arinc429SignStatusMatrix.NormalOperation);
    expect(latitude.writes[0].value).toBeCloseTo(49.0097, 3);
    expect(longitude.writes[0].ssm).toBe(Arinc429SignStatusMatrix.NormalOperation);
    expect(longitude.writes[0].value).toBeCloseTo(2.5479, 3);
  });

  it('a new destination replaces the previous one', () => {
    const { elevation, words } = setup();

    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update({ landingElevation: 12, latitude: 51, longitude: -0.4 });

    expect(elevation.writes[1]).toEqual({ value: 12, ssm: Arinc429SignStatusMatrix.NormalOperation });
  });

  it('an airport at 0 ft is a valid elevation, not missing data', () => {
    const { elevation, words } = setup();

    words.update({ landingElevation: 0, latitude: 51.5, longitude: 0.1 });

    expect(elevation.writes).toEqual([{ value: 0, ssm: Arinc429SignStatusMatrix.NormalOperation }]);
  });

  it('an airport without a known elevation still sends its position', () => {
    const { elevation, latitude, words } = setup();

    words.update({ landingElevation: null, latitude: 51.5, longitude: 0.1 });

    expect(elevation.writes).toEqual([noData]);
    expect(latitude.writes[0].ssm).toBe(Arinc429SignStatusMatrix.NormalOperation);
  });

  it('removing the destination goes back to no computed data', () => {
    const { elevation, latitude, longitude, words } = setup();

    words.update({ landingElevation: 433, latitude: 49, longitude: 2.5 });
    words.update(noDestination);

    expect(elevation.writes[1]).toEqual(noData);
    expect(latitude.writes[1]).toEqual(noData);
    expect(longitude.writes[1]).toEqual(noData);
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

  it('reports whether the landing elevation was written', () => {
    const { words } = setup();

    expect(words.update(noDestination)).toBe(true);
    expect(words.update(noDestination)).toBe(false);
    expect(words.update({ landingElevation: 0, latitude: 1, longitude: 1 })).toBe(true);
  });
});
