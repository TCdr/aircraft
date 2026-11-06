// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AmdbFeatureCollection, AmdbProperties, FeatureType } from '@flybywiresim/fbw-sdk';
import { featureCollection } from '@turf/turf';
import { FeatureCollection, Geometry } from 'geojson';

const RUNWAY_SURFACE_FEATURE_TYPES = [
  FeatureType.RunwayElement,
  FeatureType.RunwayIntersection,
  FeatureType.RunwayDisplacedArea,
  FeatureType.Stopway,
];

/**
 * The runway surfaces RWY AHEAD tests its prediction volume against, each with its own runway ident. The drawn runway
 * layer cannot serve: it merges every runway of the airport into one shape carrying the ident of the first runway, so
 * RWY AHEAD would name that runway whichever one the aircraft is about to enter.
 */
export function oansRunwayAheadFeatures(data: AmdbFeatureCollection): FeatureCollection<Geometry, AmdbProperties> {
  return featureCollection(
    data.features.filter(
      (feature) => RUNWAY_SURFACE_FEATURE_TYPES.includes(feature.properties.feattype) && !!feature.properties.idrwy,
    ),
  );
}
