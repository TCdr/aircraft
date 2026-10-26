// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The threat areas of the A32NX look-ahead terrain alerts: pure decoding and geometry (no MSFS dependency), tested
// natively by test/threat_areas_test.cpp.
//
// The GPWS (Rust ThreatAreas) finds the 1 arcminute terrain cells that break the caution or the
// warning envelope ahead of the aircraft and sends them, while TERR AHEAD is shown, as runs of cells along the rows of
// the grid: L:A32NX_GPWS_TERR_AREA_REF_LAT / _REF_LON hold the row and column of the aircraft's cell, and
// L:A32NX_GPWS_TERR_AREA_0..31 two runs each. A run is 24 bits: the row offset + 128 in bits 0-7, the first column
// offset + 128 in bits 8-15, the number of cells in bits 16-21 and the level in bits 22-23 (1 caution: solid yellow,
// 2 warning: solid red, 3 AVOID TERRAIN: red/black crosshatch); the second run of a slot is multiplied by 2^24.

#pragma once

#include <cmath>

namespace ndwxr {

constexpr int kThreatAreaSlots = 32;
constexpr int kThreatRunsPerSlot = 2;
constexpr int kThreatAreaMaxRuns = kThreatAreaSlots * kThreatRunsPerSlot;

struct ThreatRun {
  int latitudeOffset;
  int longitudeStart;
  int length;
  int level;
};

struct NdPoint {
  float x;
  float y;
};

// What the GPWS sends: the aircraft's cell and the runs counted from it
struct ThreatAreaSet {
  double referenceRow = 0.0;
  double referenceColumn = 0.0;
  ThreatRun runs[kThreatAreaMaxRuns];
  int count = 0;
};

// The cells of a run on the ND: south-west, south-east, north-east, north-west corners
struct ThreatQuad {
  NdPoint corners[4];
  int level;
};

// The runs of one slot, into out[0..1]; returns how many there are.
inline int decodeThreatSlot(double slot, ThreatRun* out) {
  constexpr int kOffsetBias = 128;
  const unsigned long long bits = static_cast<unsigned long long>(slot);
  int count = 0;
  for (int i = 0; i < kThreatRunsPerSlot; ++i) {
    const unsigned int run = static_cast<unsigned int>(bits >> (24 * i)) & 0xffffffu;
    if (run == 0) {
      continue;
    }
    out[count].latitudeOffset = static_cast<int>(run & 0xffu) - kOffsetBias;
    out[count].longitudeStart = static_cast<int>((run >> 8) & 0xffu) - kOffsetBias;
    out[count].length = static_cast<int>((run >> 16) & 0x3fu);
    out[count].level = static_cast<int>(run >> 22);
    ++count;
  }
  return count;
}

// A run's cells as a quad on the ND. The cells are small enough (1 NM north-south) for flat geometry about the
// aircraft. The ND is heading up (true heading): a point north of the aircraft is turned by minus the heading, like
// the north-up terrain picture.
inline ThreatQuad threatRunQuad(const ThreatRun& run,
                                double referenceRow,
                                double referenceColumn,
                                double aircraftLatitude,
                                double aircraftLongitude,
                                float headingDegrees,
                                float centerX,
                                float centerY,
                                float pixelsPerNm) {
  constexpr double kCellsPerDegree = 60.0;
  constexpr double kDegToRad = 3.14159265358979 / 180.0;
  const double south = (referenceRow + run.latitudeOffset) / kCellsPerDegree;
  const double north = south + 1.0 / kCellsPerDegree;
  const double west = (referenceColumn + run.longitudeStart) / kCellsPerDegree;
  const double east = west + run.length / kCellsPerDegree;
  const double eastWestNmPerDegree = 60.0 * std::cos(aircraftLatitude * kDegToRad);

  const double angle = -static_cast<double>(headingDegrees) * kDegToRad;
  const double sinA = std::sin(angle);
  const double cosA = std::cos(angle);
  const double scale = static_cast<double>(pixelsPerNm);
  const double x0 = static_cast<double>(centerX);
  const double y0 = static_cast<double>(centerY);
  auto toNd = [&](double latitude, double longitude) {
    // the longitude difference taken the short way, across the antimeridian too
    const double longitudeDelta = std::remainder(longitude - aircraftLongitude, 360.0);
    const double x = longitudeDelta * eastWestNmPerDegree * scale;
    const double y = -(latitude - aircraftLatitude) * 60.0 * scale;
    return NdPoint{static_cast<float>(x0 + x * cosA - y * sinA), static_cast<float>(y0 + x * sinA + y * cosA)};
  };

  return ThreatQuad{{toNd(south, west), toNd(south, east), toNd(north, east), toNd(north, west)}, run.level};
}

}  // namespace ndwxr
