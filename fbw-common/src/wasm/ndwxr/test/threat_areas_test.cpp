// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the threat areas of the terrain alerts (src/threat_areas.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/threat_areas.h"

using ndwxr::decodeThreatSlot;
using ndwxr::ThreatQuad;
using ndwxr::ThreatRun;
using ndwxr::threatRunQuad;

static int failures = 0;

static void expectNear(const char* what, double actual, double expected, double tolerance = 1e-3) {
  if (std::fabs(actual - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

static void expectEqual(const char* what, int actual, int expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

static void expectRun(const char* what, const ThreatRun& run, int latitudeOffset, int longitudeStart, int length, int level) {
  expectEqual(what, run.latitudeOffset, latitudeOffset);
  expectEqual(what, run.longitudeStart, longitudeStart);
  expectEqual(what, run.length, length);
  expectEqual(what, run.level, level);
}

int main() {
  ThreatRun runs[2];

  // An unused slot holds no run
  expectEqual("empty slot", decodeThreatSlot(0.0, runs), 0);

  // The slot of the Rust test two_runs_share_a_slot_exactly: the same encoding on both sides
  const double nearest = static_cast<double>(1 << 22 | 1 << 16 | 255 << 8 | 255);
  const double farthest = static_cast<double>(3 << 22 | 1 << 16);
  expectEqual("two runs", decodeThreatSlot(nearest + farthest * 16777216.0, runs), 2);
  expectRun("first run", runs[0], 127, 127, 1, 1);
  expectRun("second run", runs[1], -128, -128, 1, 3);

  expectEqual("one run", decodeThreatSlot(static_cast<double>(2 << 22 | 5 << 16 | 126 << 8 | 131), runs), 1);
  expectRun("the run", runs[0], 3, -2, 5, 2);

  // The aircraft at 35.25 N 138.91 E: its cell is row 2115, column 8334 (138.9 E to 138.9167 E). One cell north of it,
  // heading north, 10 px per NM, ND centre (384, 626).
  const ThreatRun north{1, 0, 1, 1};
  const double cellWidthNm = std::cos(35.25 * 3.14159265358979 / 180.0);
  ThreatQuad quad = threatRunQuad(north, 2115.0, 8334.0, 35.25, 138.91, 0.0f, 384.0f, 626.0f, 10.0f);
  expectEqual("level", quad.level, 1);
  // corners: south-west, south-east, north-east, north-west
  expectNear("south edge 1 NM ahead", quad.corners[0].y, 626.0 - 10.0, 1e-2);
  expectNear("north edge 2 NM ahead", quad.corners[2].y, 626.0 - 20.0, 1e-2);
  expectNear("west edge", quad.corners[0].x, 384.0 - 10.0 * 0.6 * cellWidthNm, 1e-2);
  expectNear("east edge", quad.corners[1].x, 384.0 + 10.0 * 0.4 * cellWidthNm, 1e-2);

  // Heading east, terrain to the north is on the left
  quad = threatRunQuad(north, 2115.0, 8334.0, 35.25, 138.91, 90.0f, 384.0f, 626.0f, 10.0f);
  expectNear("heading east: south edge on the left", quad.corners[0].x, 384.0 - 10.0, 1e-2);
  expectNear("heading east: west edge behind", quad.corners[0].y, 626.0 + 10.0 * 0.6 * cellWidthNm, 1e-2);

  // A run of 3 cells is one quad 3 cells wide
  const ThreatRun wide{1, -1, 3, 2};
  quad = threatRunQuad(wide, 2115.0, 8334.0, 35.25, 138.91, 0.0f, 384.0f, 626.0f, 10.0f);
  expectNear("wide run", quad.corners[1].x - quad.corners[0].x, 10.0 * 3.0 * cellWidthNm, 1e-2);

  // Across the antimeridian: the aircraft at 179.99 E, the cell just east of it at 180 (-180) to 179.9833 W
  const ThreatRun east{0, 1, 1, 1};
  quad = threatRunQuad(east, 600.0, 10799.0, 10.0, 179.99, 0.0f, 384.0f, 626.0f, 10.0f);
  const double cellWidthAt10Nm = std::cos(10.0 * 3.14159265358979 / 180.0);
  expectNear("antimeridian west edge", quad.corners[0].x, 384.0 + 10.0 * 0.6 * cellWidthAt10Nm, 1e-2);
  expectNear("antimeridian east edge", quad.corners[1].x, 384.0 + 10.0 * 1.6 * cellWidthAt10Nm, 1e-2);

  if (failures == 0) {
    std::printf("threat_areas_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
