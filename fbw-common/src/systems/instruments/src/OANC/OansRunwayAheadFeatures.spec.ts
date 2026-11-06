// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import {
  AmdbFeature,
  AmdbFeatureCollection,
  Arinc429SignStatusMatrix,
  FeatureType,
  OansMapProjection,
} from '@flybywiresim/fbw-sdk';
import { featureCollection, polygon } from '@turf/turf';
import { Position } from 'geojson';
import { bearingTo, Coordinates, placeBearingDistance } from 'msfs-geo';
import { OansBrakeToVacateSelection } from './OansBrakeToVacateSelection';
import { oansRunwayAheadFeatures } from './OansRunwayAheadFeatures';

const FEET_TO_NM = 0.3048 / 1_852;

const deg = (degrees: number, minutes: number) => degrees + minutes / 60;

/** KLAX aerodrome reference point and runway ends (FAA data as published by AirNav) */
const KLAX_ARP: Coordinates = { lat: 33.9424964, long: -118.4080486 };
const KLAX_RUNWAY_ENDS: Record<string, Coordinates> = {
  '06L': { lat: deg(33, 56.946748), long: -deg(118, 25.869592) },
  '24R': { lat: deg(33, 57.126235), long: -deg(118, 24.116935) },
  '06R': { lat: deg(33, 56.808947), long: -deg(118, 26.08007) },
  '24L': { lat: deg(33, 57.027797), long: -deg(118, 23.94276) },
  '07L': { lat: deg(33, 56.133107), long: -deg(118, 25.323892) },
  '25R': { lat: deg(33, 56.392673), long: -deg(118, 22.786675) },
  '07R': { lat: deg(33, 56.018963), long: -deg(118, 25.1411) },
  '25L': { lat: deg(33, 56.241782), long: -deg(118, 22.962835) },
};

const toAirport = (coordinates: Coordinates): Position =>
  OansMapProjection.globalToAirportCoordinates(KLAX_ARP, coordinates, [0, 0]);

let featureId = 0;

/** A runway element of the airport map, in airport coordinates */
function runwayElement(lowEnd: string, highEnd: string, widthFeet: number): AmdbFeature {
  const low = KLAX_RUNWAY_ENDS[lowEnd];
  const high = KLAX_RUNWAY_ENDS[highEnd];
  const course = bearingTo(low, high);
  const halfWidth = (widthFeet / 2) * FEET_TO_NM;
  const corners = [
    placeBearingDistance(low, course - 90, halfWidth),
    placeBearingDistance(high, course - 90, halfWidth),
    placeBearingDistance(high, course + 90, halfWidth),
    placeBearingDistance(low, course + 90, halfWidth),
  ].map(toAirport);
  return polygon([[...corners, corners[0]]], {
    feattype: FeatureType.RunwayElement,
    id: featureId++,
    idrwy: `${lowEnd}.${highEnd}`,
  }) as AmdbFeature;
}

/** The KLAX runways and a taxiway; 07L/25R first, the runway the drawn runway layer named for every runway */
const KLAX_MAP: AmdbFeatureCollection = featureCollection([
  runwayElement('07L', '25R', 150),
  runwayElement('07R', '25L', 200),
  runwayElement('06L', '24R', 150),
  runwayElement('06R', '24L', 150),
  polygon(
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ],
    ],
    {
      feattype: FeatureType.TaxiwayElement,
      id: featureId++,
      idlin: 'Y',
    },
  ) as AmdbFeature,
]) as AmdbFeatureCollection;

/** From the centreline of a 150 ft runway to the aircraft reference point when the A380 nose is 40 m short of its edge */
const NOSE_40_M_SHORT_OF_EDGE_NM = (150 / 2) * FEET_TO_NM + (36.5 + 40) / 1_852;

/** A point north of a runway, its distance from the runway centreline, measured from the runway's high (east) end */
function northOf(lowEnd: string, highEnd: string, fromHighEndNm: number, fromCentrelineNm: number): Coordinates {
  const high = KLAX_RUNWAY_ENDS[highEnd];
  const course = bearingTo(high, KLAX_RUNWAY_ENDS[lowEnd]);
  return placeBearingDistance(placeBearingDistance(high, course, fromHighEndNm), course + 90, fromCentrelineNm);
}

/** The RWY AHEAD runway of an A380 taxiing at 15 kt from a position on a true heading */
function rwyAhead(position: Coordinates, trueHeading: number): string {
  const btv = new OansBrakeToVacateSelection(new EventBus(), undefined, undefined, Subject.create(toAirport(position)));
  Object.assign(btv, {
    onGround: Subject.create(true),
    groundSpeed: Subject.create({ ssm: Arinc429SignStatusMatrix.NormalOperation, value: 15 }),
  });
  const transmit = vi.spyOn(btv, 'transmitRwyAheadAdvisory').mockImplementation(() => {});
  // The advisory is computed on every 10th position update
  for (let i = 0; i < 10; i++) {
    btv.updateRwyAheadAdvisory(position, KLAX_ARP, trueHeading, oansRunwayAheadFeatures(KLAX_MAP));
  }
  const [active, qfu] = transmit.mock.calls[transmit.mock.calls.length - 1];
  return active ? qfu : '';
}

describe('OANS RWY AHEAD runway surfaces', () => {
  it('keeps every runway surface with its own ident and nothing else', () => {
    const runways = oansRunwayAheadFeatures(KLAX_MAP).features.map((feature) => feature.properties.idrwy);
    expect(runways).toEqual(['07L.25R', '07R.25L', '06L.24R', '06R.24L']);
  });

  it('names 06R - 24L between 24R and 24L, about to cross 24L', () => {
    expect(rwyAhead(northOf('06R', '24L', 0.5, NOSE_40_M_SHORT_OF_EDGE_NM), 173)).toBe('06R - 24L');
  });

  it('names 07L - 25R about to cross 25R', () => {
    expect(rwyAhead(northOf('07L', '25R', 0.5, NOSE_40_M_SHORT_OF_EDGE_NM), 173)).toBe('07L - 25R');
  });
});
