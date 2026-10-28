// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Decodes the obstacle grid file the aircraft ships with the decoder of the gauge and the repository's zlib (the way
// src/obstacles.cpp does), and looks up a known obstacle (the Galesburg ND television tower), and runs the whole pipeline
// of the gauge (blocks in the box, inflate, cells, runs) at Hillsboro, ND. Run by test/run_tests.sh, which links the
// inflate part of zlib.

#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "../src/constants.h"
#include "../src/obstacle_grid.h"
#include "../../fbw_common/src/zlib/zlib.h"

using namespace ndwxr;

static const char* kGridPath =
    "../../../../../fbw-a32nx/src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/obstacle_grid.bin";

static bool inflateBlock(const ObstacleGridLayout& layout, const std::vector<uint8_t>& bytes, ObstacleBlockId block, std::vector<uint8_t>* out) {
  ObstacleBlockEntry entry;
  if (!obstacleBlockEntry(layout, bytes.data(), bytes.size(), block, &entry) || !entry.isDeflated) {
    return false;
  }
  const size_t side = static_cast<size_t>(obstacleCellsPerBlockSide(layout));
  out->resize(side * side);
  z_stream stream = {};
  stream.next_in = const_cast<Bytef*>(bytes.data() + entry.offset);
  stream.avail_in = entry.length;
  stream.next_out = out->data();
  stream.avail_out = static_cast<uInt>(out->size());
  if (inflateInit2(&stream, -15) != Z_OK) {
    return false;
  }
  const bool complete = inflate(&stream, Z_FINISH) == Z_STREAM_END && stream.total_out == out->size();
  inflateEnd(&stream);
  return complete;
}

// Same mapping as terrainBandColor in terrain.cpp. That function is file-static in a file that needs the MSFS SDK, so
// it cannot be linked here; keep the two in step.
static ObstacleBandColor bandColor(int band, bool gearDown) {
  const float mediumYellowFrom = gearDown ? -250.0f : -500.0f;
  const float denseGreenFrom = gearDown ? -500.0f : -1000.0f;
  const float lo = kTerrainMinFeet + kTerrainBandFeet * static_cast<float>(band);
  const float relMid = -(lo + 0.5f * kTerrainBandFeet);
  ObstacleBandColor color{0.0f, 0.0f};
  if (relMid >= kTerrainRedFromFeet) {
    color.r = kTerrainDense;
  } else if (relMid >= kTerrainDenseYellowFromFeet) {
    color.r = kTerrainDense;
    color.g = kTerrainDense;
  } else if (relMid >= mediumYellowFrom) {
    color.r = kTerrainMedium;
    color.g = kTerrainMedium;
  } else if (relMid >= denseGreenFrom) {
    color.g = kTerrainDense;
  } else if (relMid >= kTerrainLightGreenFromFeet) {
    color.g = kTerrainLight;
  }
  return color;
}

static double distanceNm(double latitudeA, double longitudeA, double latitudeB, double longitudeB) {
  const double dy = (latitudeA - latitudeB) * 60.0;
  const double dx = (longitudeA - longitudeB) * 60.0 * std::cos(latitudeB * kObstacleDegreesToRadians);
  return std::sqrt(dx * dx + dy * dy);
}

static const char* colorName(const ObstacleBandColor& color) {
  if (color.r > 0.0f && color.g > 0.0f) {
    return color.r > kTerrainMedium + 0.01f ? "dense yellow" : "medium yellow";
  }
  if (color.r > 0.0f) {
    return "dense red";
  }
  return color.g > kTerrainDense - 0.01f ? "dense green" : (color.g > 0.0f ? "light green" : "black");
}

// Every obstacle cell in the blocks around a point, to count what is within a range of it.
static std::vector<ObstacleCell> allCellsAround(const ObstacleGridLayout& layout, const std::vector<uint8_t>& bytes, double latitude, double longitude) {
  std::vector<ObstacleCell> all;
  ObstacleBlockId blocks[kObstacleMaxBlocksInView];
  const int count = obstacleBlocksInBox(layout, latitude - 1.0, latitude + 1.0, longitude - 1.5, longitude + 1.5, blocks, kObstacleMaxBlocksInView);
  std::vector<uint8_t> inflated;
  std::vector<ObstacleCell> cells;
  for (int i = 0; i < count; ++i) {
    if (inflateBlock(layout, bytes, blocks[i], &inflated) &&
        collectObstacleCells(layout, blocks[i], inflated.data(), inflated.size(), &cells)) {
      all.insert(all.end(), cells.begin(), cells.end());
    }
  }
  return all;
}

static void printCellsWithin(const ObstacleGridLayout& layout, const std::vector<uint8_t>& bytes, const char* name, double latitude, double longitude,
                             double altitudeFeet, const ObstacleBandColor* colors) {
  const std::vector<ObstacleCell> all = allCellsAround(layout, bytes, latitude, longitude);
  for (const double rangeNm : {20.0, 40.0}) {
    std::map<int, int> perBand;
    int total = 0;
    for (const ObstacleCell& cell : all) {
      if (distanceNm((cell.row + 0.5) / 60.0, (cell.column + 0.5) / 60.0, latitude, longitude) <= rangeNm) {
        ++total;
        ++perBand[obstacleBandIndex(altitudeFeet, obstacleStepToFeet(cell.step), kTerrainMinFeet, kTerrainMaxFeet, kTerrainBandCount)];
      }
    }
    std::printf("%s within %.0f NM (aircraft %.0f ft): %d obstacle cells\n", name, rangeNm, altitudeFeet, total);
    for (const auto& entry : perBand) {
      std::printf("    band %d (%s): %d cells\n", entry.first, colorName(colors[entry.first]), entry.second);
    }
  }
}

// The run pipeline of collectObstacleRuns (obstacles.cpp, without the simulator file loading) at Hillsboro ND airport, on the ground, ND range 20 NM, gear
// down, no look-ahead.
static bool testRunPipeline(const ObstacleGridLayout& layout, const std::vector<uint8_t>& bytes) {
  constexpr double kHillsboroLatitude = 47.3594;
  constexpr double kHillsboroLongitude = -97.0604;
  constexpr double kFieldElevationFeet = 905.0;
  constexpr float kRangeNm = 20.0f;
  ObstacleBandColor colors[kTerrainBandCount];
  for (int band = 0; band < kTerrainBandCount; ++band) {
    colors[band] = bandColor(band, true);
  }
  const ObstacleView view{kHillsboroLatitude, kHillsboroLongitude, kFieldElevationFeet, kRangeNm, kTerrainMinFeet, kTerrainMaxFeet, colors, kTerrainBandCount};

  ObstacleBlockId blocks[kObstacleMaxBlocksInView];
  const int blockCount = obstacleBlocksInView(layout, view, blocks, kObstacleMaxBlocksInView);
  static ThreatRun runs[kObstacleMaxRuns];
  int runCount = 0;
  std::vector<uint8_t> inflated;
  std::vector<ObstacleCell> cells;
  for (int i = 0; i < blockCount; ++i) {
    if (!inflateBlock(layout, bytes, blocks[i], &inflated) ||
        !collectObstacleCells(layout, blocks[i], inflated.data(), inflated.size(), &cells)) {
      continue;
    }
    runCount = appendObstacleRuns(cells, view, runs, kObstacleMaxRuns, runCount);
  }

  struct Landmark {
    const char* name;
    double latitude;
    double longitude;
    bool foundRed;
  };
  Landmark landmarks[] = {{"KVLY tower", 47.3417, -97.2889, false}, {"Galesburg tower", 47.2783, -97.3417, false}};

  std::map<std::string, int> perColor;
  std::printf("pipeline at 3H4: %d blocks, %d runs (limit %d)\n", blockCount, runCount, kObstacleMaxRuns);
  for (int i = 0; i < runCount; ++i) {
    const ObstacleBandColor color = colors[runs[i].level];
    perColor[colorName(color)] += runs[i].length;
    if (color.r > 0.0f && color.g == 0.0f) {
      const double latitude = (runs[i].latitudeOffset + 0.5) / 60.0;
      std::printf("  red run: lat %.4f, lon %.4f..%.4f, %d cells, band %d\n", latitude, runs[i].longitudeStart / 60.0,
                  (runs[i].longitudeStart + runs[i].length) / 60.0, runs[i].length, runs[i].level);
      for (Landmark& landmark : landmarks) {
        for (int c = 0; c < runs[i].length; ++c) {
          if (distanceNm(latitude, (runs[i].longitudeStart + c + 0.5) / 60.0, landmark.latitude, landmark.longitude) <= 2.0) {
            landmark.foundRed = true;
          }
        }
      }
    }
  }
  for (const auto& entry : perColor) {
    std::printf("  %s: %d cells\n", entry.first.c_str(), entry.second);
  }

  printCellsWithin(layout, bytes, "3H4", kHillsboroLatitude, kHillsboroLongitude, kFieldElevationFeet, colors);
  // The airport elevation of KFAR (about 902 ft) is close enough for the band of a tower tens of NM away
  printCellsWithin(layout, bytes, "KFAR", 46.9207, -96.8158, 902.0, colors);

  // One 1 arcminute cell is 1 NM tall and cos(latitude) NM wide; ROSE NAV draws kRoseNavPixelRadius pixels for the range
  for (const float rangeNm : {20.0f, 40.0f}) {
    const double pixelsPerNm = kRoseNavPixelRadius / rangeNm;
    std::printf("ROSE NAV, range %.0f: cell %.1f px tall x %.1f px wide\n", rangeNm, pixelsPerNm,
                pixelsPerNm * std::cos(kHillsboroLatitude * kObstacleDegreesToRadians));
  }

  bool ok = runCount < kObstacleMaxRuns;
  if (!ok) {
    std::printf("FAIL the run count reaches the limit\n");
  }
  for (const Landmark& landmark : landmarks) {
    if (!landmark.foundRed) {
      std::printf("FAIL no dense red run within 2 NM of the %s\n", landmark.name);
      ok = false;
    }
  }
  return ok;
}

int main() {
  std::FILE* file = std::fopen(kGridPath, "rb");
  if (file == nullptr) {
    std::printf("FAIL cannot open %s\n", kGridPath);
    return 1;
  }
  std::vector<uint8_t> bytes;
  uint8_t chunk[65536];
  size_t got = 0;
  while ((got = std::fread(chunk, 1, sizeof(chunk), file)) > 0) {
    bytes.insert(bytes.end(), chunk, chunk + got);
  }
  std::fclose(file);

  ObstacleGridLayout layout;
  if (!parseObstacleGridLayout(bytes.data(), bytes.size(), &layout)) {
    std::printf("FAIL the shipped file does not parse\n");
    return 1;
  }

  const double latitude = 47.2783;
  const double longitude = -97.3417;
  ObstacleBlockId block;
  if (obstacleBlocksInBox(layout, latitude, latitude, longitude, longitude, &block, 1) != 1) {
    std::printf("FAIL the tower is outside the grid\n");
    return 1;
  }
  std::vector<uint8_t> inflated;
  if (!inflateBlock(layout, bytes, block, &inflated)) {
    std::printf("FAIL the block of the tower has no data or does not inflate\n");
    return 1;
  }

  std::vector<ObstacleCell> cells;
  if (!collectObstacleCells(layout, block, inflated.data(), inflated.size(), &cells)) {
    std::printf("FAIL the block does not decode\n");
    return 1;
  }

  const int row = static_cast<int>(std::floor(latitude * 60.0));
  const int column = static_cast<int>(std::floor(longitude * 60.0));
  for (const ObstacleCell& cell : cells) {
    if (cell.row == row && cell.column == column) {
      const double feet = obstacleStepToFeet(cell.step);
      std::printf("Galesburg cell: step %d = %.0f ft AMSL (%zu obstacle cells in its block)\n", cell.step, feet, cells.size());
      // The tower top is about 3125 ft AMSL; the stored step rounds up by less than 50 m (164 ft)
      if (feet >= 3125.0 && feet < 3125.0 + 165.0) {
        if (!testRunPipeline(layout, bytes)) {
          return 1;
        }
        std::printf("obstacle_grid_file_test: all passed\n");
        return 0;
      }
      std::printf("FAIL the top is not the tower's\n");
      return 1;
    }
  }
  std::printf("FAIL no obstacle in the tower's cell\n");
  return 1;
}
