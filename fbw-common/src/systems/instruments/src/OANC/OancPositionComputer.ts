// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FeatureType } from '@flybywiresim/fbw-sdk';

import { booleanPointInPolygon } from '@turf/turf';
import { Polygon, Position } from 'geojson';
import { Oanc } from './Oanc';

const OANC_VALID_POSITION_INDICATION_FEATURE_TYPES = [
  FeatureType.ParkingStandArea,
  FeatureType.TaxiwayElement,
  FeatureType.RunwayElement,
  FeatureType.Stopway,
  FeatureType.RunwayDisplacedArea,
  FeatureType.BlastPad,
];

export class OancPositionComputer<T extends number> {
  constructor(private readonly oanc: Oanc<T>) {}

  private lastData?: Oanc<T>['data'];

  private lastX = NaN;

  private lastY = NaN;

  private lastPosition?: string;

  /** Scanning every feature is costly, and the answer only changes when the aircraft moves or the map is replaced. */
  public computePosition(): string | undefined {
    const data = this.oanc.data;
    if (!data) {
      this.lastData = undefined;
      return;
    }

    const ppos = this.oanc.projectedPpos.get();
    const [x, y] = ppos;
    if (data !== this.lastData || x !== this.lastX || y !== this.lastY) {
      this.lastData = data;
      this.lastX = x;
      this.lastY = y;
      this.lastPosition = this.scanFeatures(data, ppos);
    }

    return this.lastPosition;
  }

  private scanFeatures(data: NonNullable<Oanc<T>['data']>, ppos: Position): string | undefined {
    const features = data.features;

    for (const feature of features) {
      if (!OANC_VALID_POSITION_INDICATION_FEATURE_TYPES.includes(feature.properties.feattype)) {
        continue;
      }

      if (feature.geometry.type !== 'Polygon') {
        continue;
      }

      const polygon = feature.geometry as Polygon;

      if (booleanPointInPolygon(ppos, polygon)) {
        switch (feature.properties.feattype) {
          case FeatureType.ParkingStandArea:
            return feature.properties.idstd;
          case FeatureType.TaxiwayElement:
            return feature.properties.idlin;
          case FeatureType.RunwayElement:
          case FeatureType.Stopway:
            return feature.properties.idrwy?.replace('.', '-');
          case FeatureType.BlastPad:
          case FeatureType.RunwayDisplacedArea:
            return feature.properties.idthr;
          default:
            return feature.properties.ident;
        }
      }
    }

    return undefined;
  }
}
