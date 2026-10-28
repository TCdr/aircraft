// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the obstacle grid decoding and the choice of the obstacle cells (src/obstacle_grid.h): run
// test/run_tests.sh.

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

#include "../src/obstacle_grid.h"

using namespace ndwxr;

static int failures = 0;

static void expectEqual(const char* what, long long actual, long long expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %lld, expected %lld\n", what, actual, expected);
    ++failures;
  }
}

static void expectNear(const char* what, double actual, double expected, double tolerance = 1e-3) {
  if (std::fabs(actual - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

static void putU32(std::vector<uint8_t>& bytes, size_t offset, uint32_t value) {
  for (size_t i = 0; i < 4; ++i) {
    bytes[offset + i] = static_cast<uint8_t>(value >> (8 * i));
  }
}

// A grid of 2 block rows from 30 degrees north and the whole 360 degrees of longitude (72 block columns); the block at
// row 0, column 0 is deflated (at offset 1000, 77 bytes), the one at row 0, column 1 a constant 7, the others constant 0.
static std::vector<uint8_t> makeGridFile() {
  const size_t index = 64;
  std::vector<uint8_t> bytes(index + 2 * 72 * 12, 0);
  std::memcpy(bytes.data(), "TAWSGRID", 8);
  putU32(bytes, 8, 1);
  putU32(bytes, 12, 60);
  putU32(bytes, 16, 30);
  putU32(bytes, 20, static_cast<uint32_t>(-180));
  putU32(bytes, 24, 10);
  putU32(bytes, 28, 360);
  putU32(bytes, 32, 5);
  putU32(bytes, 36, 2);
  putU32(bytes, 40, 72);
  putU32(bytes, 44, static_cast<uint32_t>(index));
  for (size_t entry = 0; entry < 2 * 72; ++entry) {
    bytes[index + entry * 12 + 8] = 1;
  }
  putU32(bytes, index, 1000);
  putU32(bytes, index + 4, 77);
  bytes[index + 8] = 0;
  bytes[index + 12 + 9] = 7;
  return bytes;
}

static ObstacleGridLayout parsedLayout() {
  const std::vector<uint8_t> file = makeGridFile();
  ObstacleGridLayout layout;
  if (!parseObstacleGridLayout(file.data(), file.size(), &layout)) {
    std::printf("FAIL the synthetic file does not parse\n");
    ++failures;
  }
  return layout;
}

static void testHeaderAndIndex() {
  std::vector<uint8_t> file = makeGridFile();
  ObstacleGridLayout layout;
  expectEqual("header parses", parseObstacleGridLayout(file.data(), file.size(), &layout), 1);
  expectEqual("south", layout.southDegrees, 30);
  expectEqual("west", layout.westDegrees, -180);
  expectEqual("block rows", layout.blockRows, 2);
  expectEqual("block columns", layout.blockColumns, 72);
  expectEqual("cells per block side", obstacleCellsPerBlockSide(layout), 300);
  expectEqual("index bytes", static_cast<long long>(obstacleIndexBytes(layout)), 2 * 72 * 12);

  std::vector<uint8_t> badMagic = file;
  badMagic[0] = 'X';
  expectEqual("bad magic", parseObstacleGridLayout(badMagic.data(), badMagic.size(), &layout), 0);
  std::vector<uint8_t> badVersion = file;
  badVersion[8] = 2;
  expectEqual("bad version", parseObstacleGridLayout(badVersion.data(), badVersion.size(), &layout), 0);
  std::vector<uint8_t> badCells = file;
  badCells[12] = 30;
  expectEqual("cells per degree other than 60", parseObstacleGridLayout(badCells.data(), badCells.size(), &layout), 0);
  expectEqual("too short", parseObstacleGridLayout(file.data(), 63, &layout), 0);

  ObstacleBlockEntry entry;
  expectEqual("deflated entry", obstacleBlockEntry(layout, file.data(), file.size(), {0, 0}, &entry), 1);
  expectEqual("deflated", entry.isDeflated, 1);
  expectEqual("offset", entry.offset, 1000);
  expectEqual("length", entry.length, 77);
  expectEqual("constant entry", obstacleBlockEntry(layout, file.data(), file.size(), {0, 1}, &entry), 1);
  expectEqual("not deflated", entry.isDeflated, 0);
  expectEqual("constant value", entry.value, 7);
  expectEqual("row outside", obstacleBlockEntry(layout, file.data(), file.size(), {2, 0}, &entry), 0);
  expectEqual("column outside", obstacleBlockEntry(layout, file.data(), file.size(), {0, 72}, &entry), 0);
  file[64 + 8] = 9;
  expectEqual("unknown kind", obstacleBlockEntry(layout, file.data(), file.size(), {0, 0}, &entry), 0);
  file[64 + 8] = 0;
  putU32(file, 64 + 4, 0);
  expectEqual("empty deflated block", obstacleBlockEntry(layout, file.data(), file.size(), {0, 0}, &entry), 0);
}

static void testBlocksInBox() {
  const ObstacleGridLayout layout = parsedLayout();
  ObstacleBlockId blocks[8];
  // inside the block at row 1 (35 to 40 north), column 17 (-95 to -90 west)
  int count = obstacleBlocksInBox(layout, 36.0, 37.0, -93.0, -92.0, blocks, 8);
  expectEqual("one block", count, 1);
  expectEqual("block row", blocks[0].row, 1);
  expectEqual("block column", blocks[0].column, 17);
  // across the corner of four blocks
  count = obstacleBlocksInBox(layout, 34.0, 36.0, -96.0, -94.0, blocks, 8);
  expectEqual("four blocks", count, 4);
  // across the antimeridian: columns 71 and 0
  count = obstacleBlocksInBox(layout, 31.0, 32.0, 178.0, 182.0, blocks, 8);
  expectEqual("antimeridian", count, 2);
  expectEqual("last column", blocks[0].column, 71);
  expectEqual("wrapped column", blocks[1].column, 0);
  // rows outside the grid have no block
  expectEqual("north of the grid", obstacleBlocksInBox(layout, 41.0, 42.0, 0.0, 1.0, blocks, 8), 0);
  expectEqual("capacity", obstacleBlocksInBox(layout, 34.0, 36.0, -96.0, -94.0, blocks, 3), 3);
}

static void testCells() {
  const ObstacleGridLayout layout = parsedLayout();
  std::vector<uint8_t> block(300 * 300, 0);
  block[0] = 3;                // south-west corner cell
  block[1] = 4;                // next cell east
  block[5 * 300 + 299] = 200;  // row 5, last column
  std::vector<ObstacleCell> cells;
  expectEqual("wrong size", collectObstacleCells(layout, {1, 17}, block.data(), 10, &cells), 0);
  expectEqual("collect", collectObstacleCells(layout, {1, 17}, block.data(), block.size(), &cells), 1);
  expectEqual("cell count", static_cast<long long>(cells.size()), 3);
  // block row 1 starts at 35 degrees north = 2100 arcminutes, column 17 at -95 degrees = -5700
  expectEqual("first row", cells[0].row, 2100);
  expectEqual("first column", cells[0].column, -5700);
  expectEqual("first step", cells[0].step, 3);
  expectEqual("second column", cells[1].column, -5699);
  expectEqual("last row", cells[2].row, 2105);
  expectEqual("last column", cells[2].column, -5700 + 299);
  expectEqual("last step", cells[2].step, 200);

  expectNear("step 0", obstacleStepToFeet(0), 0.0);
  expectNear("step 1 is 0 m", obstacleStepToFeet(1), 0.0);
  expectNear("step 2 is 50 m", obstacleStepToFeet(2), 164.04199, 1e-3);
  expectNear("step 63", obstacleStepToFeet(63), 62.0 * 50.0 * 3.280839895, 1e-3);
}

static void testBandIndex() {
  // 128 bands over [-29500, 2500]: 250 ft each; v = altitude - top
  expectEqual("level with the aircraft", obstacleBandIndex(5000.0, 5000.0, -29500.0f, 2500.0f, 128), 118);
  expectEqual("1000 ft above", obstacleBandIndex(5000.0, 6000.0, -29500.0f, 2500.0f, 128), 114);
  expectEqual("far below takes the last band", obstacleBandIndex(40000.0, 100.0, -29500.0f, 2500.0f, 128), 127);
  expectEqual("far above takes the first band", obstacleBandIndex(1000.0, 60000.0, -29500.0f, 2500.0f, 128), 0);
  // the look-ahead shifts the range up: the same obstacle falls in a band further from the first
  expectEqual("with look-ahead", obstacleBandIndex(5000.0, 6000.0, -29500.0f + 500.0f, 2500.0f + 500.0f, 128), 112);
}

// Band colours: bands 0..3 red, 4..7 green, the rest black
static void fillBandColors(ObstacleBandColor* colors) {
  for (int band = 0; band < 128; ++band) {
    colors[band] = band < 4 ? ObstacleBandColor{0.7f, 0.0f} : (band < 8 ? ObstacleBandColor{0.0f, 0.7f} : ObstacleBandColor{0.0f, 0.0f});
  }
}

static void testRuns() {
  ObstacleBandColor colors[128];
  fillBandColors(colors);
  // aircraft at 47 N 97 W at 10000 ft, 10 NM range, 128 bands of 250 ft over [0, 32000]: v = 10000 - top,
  // so tops above 9000 ft are in the red bands 0..3 and tops of 8000..9000 ft in the green ones
  const ObstacleView view{47.0, -97.0, 10000.0, 10.0f, 0.0f, 32000.0f, colors, 128};
  const int row = 47 * 60;
  const int column = -97 * 60;
  const uint8_t red = 60;    // (60 - 1) * 164.04 = 9678 ft
  const uint8_t green = 52;  // 8366 ft
  const uint8_t black = 5;   // 656 ft: far below

  std::vector<ObstacleCell> cells = {
      {row, column, red},  // a run of 3 red cells ...
      {row, column + 1, red},
      {row, column + 2, red},
      {row, column + 3, green},  // ... then one green cell
      {row, column + 5, green},  // a gap: not joined
      {row, column + 6, black},  // black: skipped, and it splits the run
      {row, column + 7, green},
      {row + 1, column + 8, green},  // next row: not joined
      {row + 40, column, red},       // 40 NM north: out of range
  };
  ThreatRun runs[16];
  int count = appendObstacleRuns(cells, view, runs, 16, 0);
  expectEqual("run count", count, 5);
  expectEqual("first run row", runs[0].latitudeOffset, row);
  expectEqual("first run column", runs[0].longitudeStart, column);
  expectEqual("first run length", runs[0].length, 3);
  expectEqual("first run band", runs[0].level, obstacleBandIndex(10000.0, obstacleStepToFeet(red), 0.0f, 32000.0f, 128));
  expectEqual("second run length", runs[1].length, 1);
  expectEqual("second run column", runs[1].longitudeStart, column + 3);
  expectEqual("gap splits", runs[2].longitudeStart, column + 5);
  expectEqual("black is skipped", runs[3].longitudeStart, column + 7);
  expectEqual("row change splits", runs[4].latitudeOffset, row + 1);

  // runs are appended after the ones already there
  count = appendObstacleRuns(cells, view, runs, 16, 2);
  expectEqual("appended", count, 7);

  // the run cap
  count = appendObstacleRuns(cells, view, runs, 3, 0);
  expectEqual("capped", count, 3);
  count = appendObstacleRuns(cells, view, runs, 3, 3);
  expectEqual("already full", count, 3);

  // a cell beyond the range circle is dropped, one inside is kept, on either side of the aircraft
  const double cellEastWestNm = 60.0 * std::cos(47.0 * 3.14159265358979 / 180.0) / 60.0;
  std::vector<ObstacleCell> far = {{row, column + static_cast<int>(std::ceil(12.0 / cellEastWestNm)), red}};
  expectEqual("outside the range", appendObstacleRuns(far, view, runs, 16, 0), 0);
  std::vector<ObstacleCell> east = {{row, column + static_cast<int>(std::floor(9.0 / cellEastWestNm)), red}};
  expectEqual("east inside the range", appendObstacleRuns(east, view, runs, 16, 0), 1);
  std::vector<ObstacleCell> west = {{row, column - static_cast<int>(std::floor(9.0 / cellEastWestNm)), red}};
  expectEqual("west inside the range", appendObstacleRuns(west, view, runs, 16, 0), 1);
}

int main() {
  testHeaderAndIndex();
  testBlocksInBox();
  testCells();
  testBandIndex();
  testRuns();
  if (failures == 0) {
    std::printf("obstacle_grid_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
