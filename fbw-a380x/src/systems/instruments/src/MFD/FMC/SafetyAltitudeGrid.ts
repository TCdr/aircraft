// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Units } from '@flybywiresim/fbw-sdk';

/**
 * The safety altitudes of the FMS navigation database: the grid MORA of each 1° x 1° cell and the MSA around an
 * airport. The MSFS navigation data has neither, so both come from a terrain grid shipped with the aircraft
 * (`safety-altitude-grid.bin`, built from the SRTM elevation grid of FBW SimBridge): the highest terrain of each 1° cell,
 * and of each 10' sub-cell where the cell holds land.
 *
 * File layout (little endian): 'FBWSAG', uint8 version, uint8 sub-cells per degree, uint32 sub-cell block count,
 * uint32 reserved; int16[180][360] highest terrain of each 1° cell in metres (row 0 = 90S, column 0 = 180W; 0 without
 * land, -32768 where the terrain data does not reach: the polar caps); uint16[180][360] sub-cell block number + 1 of each
 * cell (0 = none: every sub-cell has the cell's value); uint8 blocks of sub-cells (row 0 = south, column 0 = west), in
 * units of 40 m rounded up.
 */

const SAFETY_ALTITUDE_GRID_URL = '/VFS/config/a380x/safety-altitude-grid.bin';

const MAGIC = 'FBWSAG';
const HEADER_BYTES = 16;
const ROWS = 180;
const COLUMNS = 360;
const CELLS = ROWS * COLUMNS;
const NO_DATA = -32768;
const SUB_CELL_UNIT_METRES = 40;

/**
 * Grid MORA clearance: 1000 ft over the highest terrain of the cell up to 5000 ft, 2000 ft above, rounded up to the next
 * 100 ft (the rule of the charts the FMS grid MORA matches).
 */
const MORA_LOW_TERRAIN_LIMIT_FT = 5000;
const MORA_LOW_TERRAIN_CLEARANCE_FT = 1000;
const MORA_HIGH_TERRAIN_CLEARANCE_FT = 2000;

/** MSA: 1000 ft (300 m) over the highest terrain within the 25 NM sector and its 5 NM buffer, rounded up to 100 ft. */
export const MSA_SECTOR_RADIUS_NM = 25;
const MSA_BUFFER_NM = 5;
const MSA_CLEARANCE_FT = 1000;

/**
 * @param highestTerrainFt the highest terrain of the cell(s)
 * @returns the grid MORA in feet
 */
export function gridMoraFromHighestTerrain(highestTerrainFt: number): number {
  const clearance =
    highestTerrainFt <= MORA_LOW_TERRAIN_LIMIT_FT ? MORA_LOW_TERRAIN_CLEARANCE_FT : MORA_HIGH_TERRAIN_CLEARANCE_FT;
  return Math.ceil((Math.max(0, highestTerrainFt) + clearance) / 100) * 100;
}

/**
 * Design choice: the navigation database gives each MSA sector its own value; without that data the MSA is one value
 * for the whole 25 NM circle, from the highest terrain within it.
 * @param highestTerrainFt the highest terrain within the MSA circle and its buffer
 * @returns the MSA in feet
 */
export function msaFromHighestTerrain(highestTerrainFt: number): number {
  return Math.ceil((Math.max(0, highestTerrainFt) + MSA_CLEARANCE_FT) / 100) * 100;
}

/** The safety altitude lookups the VD profile needs (an interface, so the specs can use a small grid of their own) */
export interface SafetyAltitudeSource {
  /**
   * @param lat latitude in degrees
   * @param long longitude in degrees
   * @param halfWidthNm half width of the vertical cut: every cell the square of this half size around the point touches
   * @returns the grid MORA in feet, null where a touched cell has no terrain data
   */
  gridMoraFeet(lat: number, long: number, halfWidthNm: number): number | null;

  /**
   * @param lat latitude of the MSA centre (the airport) in degrees
   * @param long longitude of the MSA centre in degrees
   * @returns the MSA in feet, null without terrain data
   */
  msaFeet(lat: number, long: number): number | null;
}

export class SafetyAltitudeGrid implements SafetyAltitudeSource {
  private constructor(
    private readonly view: DataView,
    private readonly subCellsPerDegree: number,
    private readonly subCellOffset: number,
  ) {}

  /**
   * @param buffer the content of the grid file
   * @returns the grid, null when the file is not a grid of this version
   */
  public static parse(buffer: ArrayBuffer): SafetyAltitudeGrid | null {
    if (buffer.byteLength < HEADER_BYTES + CELLS * 4) {
      return null;
    }
    const view = new DataView(buffer);
    for (let i = 0; i < MAGIC.length; i++) {
      if (view.getUint8(i) !== MAGIC.charCodeAt(i)) {
        return null;
      }
    }
    const version = view.getUint8(6);
    const subCellsPerDegree = view.getUint8(7);
    const blockCount = view.getUint32(8, true);
    const subCellOffset = HEADER_BYTES + CELLS * 4;
    if (
      version !== 1 ||
      subCellsPerDegree < 1 ||
      buffer.byteLength < subCellOffset + blockCount * subCellsPerDegree * subCellsPerDegree
    ) {
      return null;
    }
    return new SafetyAltitudeGrid(view, subCellsPerDegree, subCellOffset);
  }

  /**
   * @param lat latitude in degrees
   * @param long longitude in degrees
   * @returns the highest terrain of the 1° cell holding the point in feet, null without terrain data
   */
  public cellHighestTerrainFeet(lat: number, long: number): number | null {
    const cell = SafetyAltitudeGrid.cellIndex(Math.floor(lat), Math.floor(long));
    if (cell === null) {
      return null;
    }
    const metres = this.view.getInt16(HEADER_BYTES + cell * 2, true);
    return metres === NO_DATA ? null : Units.metreToFoot(metres);
  }

  public gridMoraFeet(lat: number, long: number, halfWidthNm: number): number | null {
    const halfLat = halfWidthNm / 60;
    const halfLong = halfWidthNm / (60 * Math.max(0.01, Math.cos(lat * (Math.PI / 180))));
    let highest = -Infinity;
    for (let row = Math.floor(lat - halfLat); row <= Math.floor(lat + halfLat); row++) {
      for (let column = Math.floor(long - halfLong); column <= Math.floor(long + halfLong); column++) {
        const terrain = this.cellHighestTerrainFeet(row, column);
        if (terrain === null) {
          return null;
        }
        highest = Math.max(highest, terrain);
      }
    }
    return gridMoraFromHighestTerrain(highest);
  }

  /**
   * @param lat latitude of the centre in degrees
   * @param long longitude of the centre in degrees
   * @param radiusNm radius of the circle
   * @returns the highest terrain of the sub-cells reaching into the circle in feet, null where one has no terrain data
   */
  private highestTerrainWithinFeet(lat: number, long: number, radiusNm: number): number | null {
    const step = 1 / this.subCellsPerDegree;
    const nmPerDegreeLong = 60 * Math.max(0.01, Math.cos(lat * (Math.PI / 180)));
    const halfLat = radiusNm / 60;
    const halfLong = radiusNm / nmPerDegreeLong;
    let highest = -Infinity;
    for (let south = Math.floor((lat - halfLat) / step) * step; south < lat + halfLat; south += step) {
      for (let west = Math.floor((long - halfLong) / step) * step; west < long + halfLong; west += step) {
        // The point of the sub-cell nearest to the centre decides whether it reaches into the circle
        const nearestLat = Math.min(Math.max(lat, south), south + step);
        const nearestLong = Math.min(Math.max(long, west), west + step);
        if (Math.hypot((nearestLat - lat) * 60, (nearestLong - long) * nmPerDegreeLong) > radiusNm) {
          continue;
        }
        const terrain = this.subCellHighestTerrainFeet(south + step / 2, west + step / 2);
        if (terrain === null) {
          return null;
        }
        highest = Math.max(highest, terrain);
      }
    }
    return highest === -Infinity ? null : highest;
  }

  public msaFeet(lat: number, long: number): number | null {
    const terrain = this.highestTerrainWithinFeet(lat, long, MSA_SECTOR_RADIUS_NM + MSA_BUFFER_NM);
    return terrain === null ? null : msaFromHighestTerrain(terrain);
  }

  private subCellHighestTerrainFeet(lat: number, long: number): number | null {
    const row = Math.floor(lat);
    const column = Math.floor(long);
    const cell = SafetyAltitudeGrid.cellIndex(row, column);
    if (cell === null) {
      return null;
    }
    const block = this.view.getUint16(HEADER_BYTES + CELLS * 2 + cell * 2, true);
    if (block === 0) {
      return this.cellHighestTerrainFeet(lat, long);
    }
    const n = this.subCellsPerDegree;
    const subRow = Math.min(n - 1, Math.floor((lat - row) * n));
    const subColumn = Math.min(n - 1, Math.floor((long - column) * n));
    const units = this.view.getUint8(this.subCellOffset + (block - 1) * n * n + subRow * n + subColumn);
    return Units.metreToFoot(units * SUB_CELL_UNIT_METRES);
  }

  /**
   * @param row the latitude of the south edge of the cell (-90..89)
   * @param column the longitude of the west edge of the cell, any value (wrapped to -180..179)
   * @returns the index of the cell, null beyond the poles
   */
  private static cellIndex(row: number, column: number): number | null {
    if (row < -90 || row > 89) {
      return null;
    }
    const columnFrom180W = (((column + 180) % COLUMNS) + COLUMNS) % COLUMNS;
    return (row + 90) * COLUMNS + columnFrom180W;
  }
}

let gridLoading: Promise<SafetyAltitudeGrid | null> | null = null;

/**
 * Loads the grid file of the aircraft package, once per instrument.
 * @returns the grid, null when the file cannot be read
 */
export function loadSafetyAltitudeGrid(): Promise<SafetyAltitudeGrid | null> {
  if (gridLoading === null) {
    gridLoading = fetch(SAFETY_ALTITUDE_GRID_URL)
      .then((response) => response.arrayBuffer())
      .then((buffer) => SafetyAltitudeGrid.parse(buffer))
      .catch((e) => {
        console.error('[FMS] Cannot read the safety altitude grid', e);
        return null;
      });
  }
  return gridLoading;
}
