// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { SafetyAltitudeGrid, gridMoraFromHighestTerrain, msaFromHighestTerrain } from './SafetyAltitudeGrid';

const FT_PER_M = 3.28084;

interface TestCell {
  lat: number;
  long: number;
  highestMetres: number;
  /** 36 sub-cells (6 x 6, row 0 south), in metres */
  subCellsMetres?: number[];
}

/** A grid file with no land except the given cells, and no terrain data south of 83S and north of 83N */
function buildTestGridFile(cells: TestCell[]): ArrayBuffer {
  const withBlocks = cells.filter((c) => c.subCellsMetres);
  const buffer = new ArrayBuffer(16 + 180 * 360 * 4 + withBlocks.length * 36);
  const view = new DataView(buffer);
  'FBWSAG'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint8(6, 1);
  view.setUint8(7, 6);
  view.setUint32(8, withBlocks.length, true);
  for (let row = 0; row < 180; row++) {
    const lat = row - 90;
    for (let column = 0; column < 360; column++) {
      view.setInt16(16 + (row * 360 + column) * 2, lat < -83 || lat > 82 ? -32768 : 0, true);
    }
  }
  let block = 0;
  for (const cell of cells) {
    const index = (cell.lat + 90) * 360 + (cell.long + 180);
    view.setInt16(16 + index * 2, cell.highestMetres, true);
    if (cell.subCellsMetres) {
      view.setUint16(16 + 180 * 360 * 2 + index * 2, block + 1, true);
      cell.subCellsMetres.forEach((m, i) => view.setUint8(16 + 180 * 360 * 4 + block * 36 + i, Math.ceil(m / 40)));
      block++;
    }
  }
  return buffer;
}

describe('grid MORA and MSA rules', () => {
  it('grid MORA: 1000 ft over terrain up to 5000 ft, 2000 ft above, rounded up to 100 ft', () => {
    expect(gridMoraFromHighestTerrain(0)).toBe(1000);
    expect(gridMoraFromHighestTerrain(4210)).toBe(5300);
    expect(gridMoraFromHighestTerrain(5000)).toBe(6000);
    expect(gridMoraFromHighestTerrain(5001)).toBe(7100);
    expect(gridMoraFromHighestTerrain(15246)).toBe(17300);
  });

  it('MSA: 1000 ft over the terrain, rounded up to 100 ft', () => {
    expect(msaFromHighestTerrain(853)).toBe(1900);
    expect(msaFromHighestTerrain(6000)).toBe(7000);
  });
});

describe('SafetyAltitudeGrid', () => {
  const alps = { lat: 45, long: 6, highestMetres: 4647 };
  const grid = SafetyAltitudeGrid.parse(buildTestGridFile([alps]))!;

  it('rejects a file that is not a grid', () => {
    expect(SafetyAltitudeGrid.parse(new ArrayBuffer(100))).toBeNull();
    const wrongMagic = buildTestGridFile([]);
    new DataView(wrongMagic).setUint8(0, 0);
    expect(SafetyAltitudeGrid.parse(wrongMagic)).toBeNull();
  });

  it('reads the highest terrain of the 1° cell holding the point', () => {
    expect(grid.cellHighestTerrainFeet(45.83, 6.86)).toBeCloseTo(4647 * FT_PER_M, 3);
    expect(grid.cellHighestTerrainFeet(44.99, 6.5)).toBe(0);
    expect(grid.cellHighestTerrainFeet(88, 0)).toBeNull();
  });

  it('grid MORA of the cell, or of every cell the cut width touches', () => {
    expect(grid.gridMoraFeet(45.5, 6.5, 0)).toBe(17300);
    expect(grid.gridMoraFeet(44.5, 6.5, 0)).toBe(1000);
    // 2 NM from the cell boundary at 45N: a 4 NM wide cut reaches into the Alps cell
    expect(grid.gridMoraFeet(45 - 1.9 / 60, 6.5, 2)).toBe(17300);
    expect(grid.gridMoraFeet(45 - 2.1 / 60, 6.5, 2)).toBe(1000);
  });

  it('grid MORA across the antimeridian', () => {
    const pacific = SafetyAltitudeGrid.parse(buildTestGridFile([{ lat: 10, long: 179, highestMetres: 1000 }]))!;
    expect(pacific.gridMoraFeet(10.5, -179.99, 2)).toBe(gridMoraFromHighestTerrain(1000 * FT_PER_M));
  });

  it('no grid MORA where the terrain data does not reach', () => {
    expect(grid.gridMoraFeet(84, 10, 0)).toBeNull();
    expect(grid.gridMoraFeet(83 - 1 / 60, 10, 2)).toBeNull();
  });

  it('MSA from the sub-cells within 30 NM (25 NM sector and its buffer)', () => {
    // Highest sub-cell (2000 m) in the north-east corner of the cell: 45 50'..46N, 6 50'..7E
    const subCells = new Array(36).fill(200);
    subCells[35] = 2000;
    const hills = SafetyAltitudeGrid.parse(
      buildTestGridFile([{ ...alps, highestMetres: 2000, subCellsMetres: subCells }]),
    )!;
    // An airport 20 NM south of the corner sub-cell: within reach
    expect(hills.msaFeet(45.5, 6.9)).toBe(msaFromHighestTerrain(2000 * FT_PER_M));
    // An airport in the south-west of the cell, more than 30 NM from that sub-cell: only the 200 m sub-cells
    expect(hills.msaFeet(45.05, 6.05)).toBe(msaFromHighestTerrain(200 * FT_PER_M));
  });

  it('MSA over cells without sub-cells uses the cell value', () => {
    expect(grid.msaFeet(45.2, 6.5)).toBe(msaFromHighestTerrain(4647 * FT_PER_M));
    expect(grid.msaFeet(40, -40)).toBe(1000);
  });

  it('no MSA where the terrain data does not reach', () => {
    expect(grid.msaFeet(82.9, 0)).toBeNull();
  });
});

describe('the grid file of the aircraft package', () => {
  const file = readFileSync(
    resolve(__dirname, '../../../../../base/flybywire-aircraft-a380-842/config/a380x/safety-altitude-grid.bin'),
  );
  const buffer = new ArrayBuffer(file.byteLength);
  new Uint8Array(buffer).set(file);
  const grid = SafetyAltitudeGrid.parse(buffer)!;

  it('is a grid', () => {
    expect(grid).not.toBeNull();
  });

  it('has the Alps, the ocean and no data at the poles', () => {
    // Mont Blanc cell: about 4650 m in the elevation grid, grid MORA about 17 300 ft
    expect(grid.gridMoraFeet(45.83, 6.86, 0)).toBeGreaterThan(16000);
    expect(grid.gridMoraFeet(40, -40, 0)).toBe(1000);
    expect(grid.gridMoraFeet(88, 0, 0)).toBeNull();
  });

  it('London Heathrow MSA about 2000 ft (charts: 2100 ft with the obstacles)', () => {
    const msa = grid.msaFeet(51.4775, -0.4614)!;
    expect(msa).toBeGreaterThanOrEqual(1800);
    expect(msa).toBeLessThanOrEqual(2500);
  });
});
