// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { bbox, bboxPolygon, booleanPointInPolygon } from '@turf/turf';
import { BBox, Feature, FeatureCollection, Polygon, Position } from 'geojson';

/**
 * The bounding box of the loaded airport map. The map does not change between load and unload, and walking all its
 * coordinates every frame is costly at large airports, so the box is computed once per map.
 */
export class OancAirportBounds {
  private mapBoxPolygon: Feature<Polygon> | null = null;

  /**
   * Keeps the bounding box of an airport map, replacing the one of the previous map.
   * @returns the bounding box of the map
   */
  public set(airportMap: FeatureCollection): BBox {
    const mapBox = bbox(airportMap);
    this.mapBoxPolygon = bboxPolygon(mapBox);
    return mapBox;
  }

  public clear(): void {
    this.mapBoxPolygon = null;
  }

  /** Whether a position, in the projection of the map, is inside the bounding box of the loaded map */
  public contains(position: Position): boolean {
    return this.mapBoxPolygon !== null && booleanPointInPolygon(position, this.mapBoxPolygon);
  }
}
