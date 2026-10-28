// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The obstacles in the A32NX terrain picture: decoding of the obstacle grid file, and the choice of the cells to draw
// (pure code, no MSFS dependency), tested natively by test/obstacle_grid_test.cpp.
//
// The file is the one the GPWS reads (Rust terrain_grid.rs, written by tools/taws-obstacle-grid): a 64 byte header, one
// 12 byte index entry per 5 degree block, and the blocks, each deflated (raw deflate, no zlib header) or a constant.
// A block holds 1 arcminute cells, rows from its south edge and columns from its west edge; a cell is 0 for no
// obstacle, otherwise 1 + ceil(metres / 50) of the highest obstacle top (AMSL) in it.

#pragma once

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "threat_areas.h"

namespace ndwxr {

constexpr size_t kObstacleHeaderBytes = 64;
constexpr size_t kObstacleIndexEntryBytes = 12;
constexpr double kObstacleCellsPerDegree = 60.0;
constexpr double kObstacleDegreesToRadians = 3.14159265358979 / 180.0;
// A cell is kept while any part of it can be inside the range circle: its diagonal (about 1.4 NM) beyond the range.
constexpr double kObstacleReachMarginNm = 1.5;

// The most blocks one ND range can reach (3 rows by 7 columns at 70 degrees north and 320 NM, rounded up).
constexpr int kObstacleMaxBlocksInView = 24;

struct ObstacleGridLayout {
  int cellsPerDegree = 0;
  int southDegrees = 0;
  int westDegrees = 0;
  int heightDegrees = 0;
  int widthDegrees = 0;
  int blockDegrees = 0;
  int blockRows = 0;
  int blockColumns = 0;
  uint32_t indexOffset = 0;
};

struct ObstacleBlockId {
  int row = 0;
  int column = 0;
};

// Where a block lives in the file; a constant block has no data (its cells all hold `value`).
struct ObstacleBlockEntry {
  bool isDeflated = false;
  uint32_t offset = 0;
  uint32_t length = 0;
  uint8_t value = 0;
};

// An obstacle cell by its absolute position: row and column count arcminutes from the equator and from the Greenwich
// meridian (south and west edges of the cell).
struct ObstacleCell {
  int row;
  int column;
  uint8_t step;
};

// What a band of the terrain colour list shows; a band without any colour (both zero) shows nothing.
struct ObstacleBandColor {
  float r;
  float g;
};

// Everything that places and colours the obstacles of one frame.
struct ObstacleView {
  double aircraftLatitude;
  double aircraftLongitude;
  double aircraftAltitudeFeet;
  float rangeNm;
  // The altitude range the terrain view spreads its bands over, and the colour of each band
  float bandRangeMinFeet;
  float bandRangeMaxFeet;
  const ObstacleBandColor* bandColors;
  int bandCount;
};

inline uint32_t readObstacleU32(const uint8_t* bytes, size_t offset) {
  return static_cast<uint32_t>(bytes[offset]) | static_cast<uint32_t>(bytes[offset + 1]) << 8 |
         static_cast<uint32_t>(bytes[offset + 2]) << 16 | static_cast<uint32_t>(bytes[offset + 3]) << 24;
}

// Reads the header; false for a file that is not an obstacle grid this code can read.
inline bool parseObstacleGridLayout(const uint8_t* bytes, size_t size, ObstacleGridLayout* layout) {
  constexpr uint32_t kSupportedVersion = 1;
  const char magic[8] = {'T', 'A', 'W', 'S', 'G', 'R', 'I', 'D'};
  if (size < kObstacleHeaderBytes) {
    return false;
  }
  for (size_t i = 0; i < sizeof(magic); ++i) {
    if (bytes[i] != static_cast<uint8_t>(magic[i])) {
      return false;
    }
  }
  if (readObstacleU32(bytes, 8) != kSupportedVersion) {
    return false;
  }
  ObstacleGridLayout parsed;
  parsed.cellsPerDegree = static_cast<int>(readObstacleU32(bytes, 12));
  parsed.southDegrees = static_cast<int>(readObstacleU32(bytes, 16));
  parsed.westDegrees = static_cast<int>(readObstacleU32(bytes, 20));
  parsed.heightDegrees = static_cast<int>(readObstacleU32(bytes, 24));
  parsed.widthDegrees = static_cast<int>(readObstacleU32(bytes, 28));
  parsed.blockDegrees = static_cast<int>(readObstacleU32(bytes, 32));
  parsed.blockRows = static_cast<int>(readObstacleU32(bytes, 36));
  parsed.blockColumns = static_cast<int>(readObstacleU32(bytes, 40));
  parsed.indexOffset = readObstacleU32(bytes, 44);
  // The cell geometry below is written for the 1 arcminute cells of the shipped file; a rejected file is better than
  // wrongly placed obstacles.
  const bool blocksCoverGrid = parsed.blockDegrees > 0 && parsed.blockRows * parsed.blockDegrees >= parsed.heightDegrees &&
                               parsed.blockColumns * parsed.blockDegrees >= parsed.widthDegrees;
  if (parsed.cellsPerDegree != static_cast<int>(kObstacleCellsPerDegree) || parsed.heightDegrees <= 0 ||
      parsed.widthDegrees <= 0 || !blocksCoverGrid) {
    return false;
  }
  *layout = parsed;
  return true;
}

inline size_t obstacleIndexBytes(const ObstacleGridLayout& layout) {
  return static_cast<size_t>(layout.blockRows) * static_cast<size_t>(layout.blockColumns) * kObstacleIndexEntryBytes;
}

inline int obstacleCellsPerBlockSide(const ObstacleGridLayout& layout) {
  return layout.cellsPerDegree * layout.blockDegrees;
}

// The index entry of a block; false when the block is outside the grid or the entry is not valid.
inline bool obstacleBlockEntry(const ObstacleGridLayout& layout,
                               const uint8_t* bytes,
                               size_t size,
                               ObstacleBlockId block,
                               ObstacleBlockEntry* entry) {
  constexpr uint8_t kKindDeflated = 0;
  constexpr uint8_t kKindConstant = 1;
  if (block.row < 0 || block.row >= layout.blockRows || block.column < 0 || block.column >= layout.blockColumns) {
    return false;
  }
  const size_t first = static_cast<size_t>(layout.indexOffset) +
                       (static_cast<size_t>(block.row) * static_cast<size_t>(layout.blockColumns) + static_cast<size_t>(block.column)) *
                           kObstacleIndexEntryBytes;
  if (first + kObstacleIndexEntryBytes > size) {
    return false;
  }
  const uint8_t kind = bytes[first + 8];
  ObstacleBlockEntry parsed;
  if (kind == kKindDeflated) {
    parsed.isDeflated = true;
    parsed.offset = readObstacleU32(bytes, first);
    parsed.length = readObstacleU32(bytes, first + 4);
    if (parsed.length == 0) {
      return false;
    }
  } else if (kind == kKindConstant) {
    parsed.value = bytes[first + 9];
  } else {
    return false;
  }
  *entry = parsed;
  return true;
}

// The blocks that cover a latitude / longitude box (degrees), longitudes wrapping around the antimeridian; returns how
// many were written to out (at most capacity).
inline int obstacleBlocksInBox(const ObstacleGridLayout& layout,
                               double southLatitude,
                               double northLatitude,
                               double westLongitude,
                               double eastLongitude,
                               ObstacleBlockId* out,
                               int capacity) {
  const double blockDegrees = static_cast<double>(layout.blockDegrees);
  const int firstRow = static_cast<int>(std::floor((southLatitude - layout.southDegrees) / blockDegrees));
  const int lastRow = static_cast<int>(std::floor((northLatitude - layout.southDegrees) / blockDegrees));
  const int firstColumn = static_cast<int>(std::floor((westLongitude - layout.westDegrees) / blockDegrees));
  const int lastColumn = static_cast<int>(std::floor((eastLongitude - layout.westDegrees) / blockDegrees));
  int count = 0;
  for (int row = firstRow; row <= lastRow; ++row) {
    if (row < 0 || row >= layout.blockRows) {
      continue;
    }
    // A box wider than the world is every column once
    const int columns = lastColumn - firstColumn + 1 > layout.blockColumns ? layout.blockColumns : lastColumn - firstColumn + 1;
    for (int i = 0; i < columns; ++i) {
      if (count >= capacity) {
        return count;
      }
      const int column = ((firstColumn + i) % layout.blockColumns + layout.blockColumns) % layout.blockColumns;
      out[count++] = ObstacleBlockId{row, column};
    }
  }
  return count;
}

// The non-zero cells of an inflated block, row by row (west to east inside a row); false for a block of the wrong
// size.
inline bool collectObstacleCells(const ObstacleGridLayout& layout,
                                 ObstacleBlockId block,
                                 const uint8_t* cells,
                                 size_t cellCount,
                                 std::vector<ObstacleCell>* out) {
  const size_t side = static_cast<size_t>(obstacleCellsPerBlockSide(layout));
  if (cellCount != side * side) {
    return false;
  }
  const int southRow = (layout.southDegrees + block.row * layout.blockDegrees) * layout.cellsPerDegree;
  const int westColumn = (layout.westDegrees + block.column * layout.blockDegrees) * layout.cellsPerDegree;
  out->clear();
  for (size_t row = 0; row < side; ++row) {
    for (size_t column = 0; column < side; ++column) {
      const uint8_t step = cells[row * side + column];
      if (step != 0) {
        out->push_back(ObstacleCell{southRow + static_cast<int>(row), westColumn + static_cast<int>(column), step});
      }
    }
  }
  return true;
}

// The cell's value is one step above the ceiling of the top in 50 m steps, so the feet never undershoot the obstacle.
inline double obstacleStepToFeet(uint8_t step) {
  constexpr double kMetresPerStep = 50.0;
  constexpr double kFeetPerMetre = 3.280839895;
  return step == 0 ? 0.0 : static_cast<double>(step - 1) * kMetresPerStep * kFeetPerMetre;
}

// The band of the terrain colour list an obstacle top falls in, as the terrain view colours a height: by the aircraft's
// altitude minus the height, in equal bands over [rangeMin, rangeMax]. Unlike the view, an obstacle far above the range
// takes the first band (the one of the highest terrain), the way a mountain does.
inline int obstacleBandIndex(double aircraftAltitudeFeet, double topFeet, float rangeMinFeet, float rangeMaxFeet, int bandCount) {
  const double bandFeet = (static_cast<double>(rangeMaxFeet) - static_cast<double>(rangeMinFeet)) / bandCount;
  const int band = static_cast<int>(std::floor((aircraftAltitudeFeet - topFeet - static_cast<double>(rangeMinFeet)) / bandFeet));
  return band < 0 ? 0 : (band >= bandCount ? bandCount - 1 : band);
}

// The blocks that can hold a cell within the view's range (the range plus the reach margin around the aircraft).
inline int obstacleBlocksInView(const ObstacleGridLayout& layout, const ObstacleView& view, ObstacleBlockId* out, int capacity) {
  // Design choice: the longitude half-width stops growing near the poles (cosine floor), where the grid has no data anyway.
  const double cosine = std::fmax(std::cos(view.aircraftLatitude * kObstacleDegreesToRadians), 0.05);
  const double halfLatitude = (static_cast<double>(view.rangeNm) + kObstacleReachMarginNm) / 60.0;
  const double halfLongitude = halfLatitude / cosine;
  return obstacleBlocksInBox(layout, view.aircraftLatitude - halfLatitude, view.aircraftLatitude + halfLatitude,
                             view.aircraftLongitude - halfLongitude, view.aircraftLongitude + halfLongitude, out, capacity);
}

// Appends the cells of one block that are inside the view's range and show a colour to out as runs along the rows
// (ThreatRun: latitudeOffset = the row and longitudeStart = the column, both absolute, level = the band), joining
// neighbouring cells of the same band; stops at capacity (`count` is the number already in out). Returns the new count.
inline int appendObstacleRuns(const std::vector<ObstacleCell>& cells,
                              const ObstacleView& view,
                              ThreatRun* out,
                              int capacity,
                              int count) {
  const double nmPerDegreeEastWest = 60.0 * std::cos(view.aircraftLatitude * kObstacleDegreesToRadians);
  const double reachNm = static_cast<double>(view.rangeNm) + kObstacleReachMarginNm;
  bool previousKept = false;
  ObstacleCell previous{0, 0, 0};
  for (const ObstacleCell& cell : cells) {
    const double southNm = (cell.row / kObstacleCellsPerDegree - view.aircraftLatitude) * 60.0;
    const double westLongitudeDelta = std::remainder(cell.column / kObstacleCellsPerDegree - view.aircraftLongitude, 360.0);
    const double westNm = westLongitudeDelta * nmPerDegreeEastWest;
    const double dy = southNm > 0.0 ? southNm : (southNm + 1.0 < 0.0 ? southNm + 1.0 : 0.0);
    const double cellWidthNm = nmPerDegreeEastWest / kObstacleCellsPerDegree;
    const double dx = westNm > 0.0 ? westNm : (westNm + cellWidthNm < 0.0 ? westNm + cellWidthNm : 0.0);
    bool kept = dx * dx + dy * dy <= reachNm * reachNm;
    int band = 0;
    if (kept) {
      band = obstacleBandIndex(view.aircraftAltitudeFeet, obstacleStepToFeet(cell.step), view.bandRangeMinFeet, view.bandRangeMaxFeet,
                               view.bandCount);
      const ObstacleBandColor& color = view.bandColors[band];
      // A black band must not wipe the terrain under the cell
      kept = color.r > 0.0f || color.g > 0.0f;
    }
    if (!kept) {
      previousKept = false;
      continue;
    }
    if (previousKept && previous.row == cell.row && previous.column + 1 == cell.column && count > 0 &&
        out[count - 1].level == band) {
      ++out[count - 1].length;
    } else {
      if (count >= capacity) {
        return count;
      }
      out[count++] = ThreatRun{cell.row, cell.column, 1, band};
    }
    previous = cell;
    previousKept = true;
  }
  return count;
}

}  // namespace ndwxr
