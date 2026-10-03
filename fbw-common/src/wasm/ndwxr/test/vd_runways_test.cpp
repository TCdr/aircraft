// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the VD runway stretches (src/vd_runways.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/vd_runways.h"

using ndwxr::VdCutSegment;
using ndwxr::VdFlatStretch;
using ndwxr::VdRunwayArea;
using ndwxr::vdRunwayStretches;

static int failures = 0;

static void expectNear(const char* what, float actual, float expected, float tolerance = 1e-3f) {
  if (std::fabs(actual - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

static void expectCount(const char* what, int actual, int expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d stretches, expected %d\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  VdFlatStretch out[8];
  // Along the track, north, 10 NM: one piece from the aircraft
  const VdCutSegment north[] = {{0.0f, 0.0f, 0.0f, 10.0f, 0.0f}};

  {
    // A runway along the cut, centre 5 NM ahead, 2 NM long: flat over its length
    const VdRunwayArea along[] = {{0.0f, 5.0f, 0.0f, 1.0f, 0.05f, 118.0f}};
    const int n = vdRunwayStretches(north, 1, 0.5f, 10.0f, along, 1, out, 8);
    expectCount("along", n, 1);
    expectNear("along start", out[0].startNm, 4.0f);
    expectNear("along end", out[0].endNm, 6.0f);
    expectNear("along elevation", out[0].elevationFeet, 118.0f);
  }
  {
    // A runway across the cut at 5 NM: flat over its width only, the terrain on both sides stays
    const VdRunwayArea across[] = {{0.0f, 5.0f, 90.0f, 1.0f, 0.05f, 0.0f}};
    const int n = vdRunwayStretches(north, 1, 1.0f, 10.0f, across, 1, out, 8);
    expectCount("across", n, 1);
    expectNear("across start", out[0].startNm, 4.95f);
    expectNear("across end", out[0].endNm, 5.05f);
  }
  {
    // A parallel runway 1.5 NM beside the cut, band 1 NM: outside; 1.0 NM beside: inside
    const VdRunwayArea beside[] = {{1.5f, 5.0f, 0.0f, 1.0f, 0.05f, 0.0f}};
    expectCount("beside, outside the band", vdRunwayStretches(north, 1, 1.0f, 10.0f, beside, 1, out, 8), 0);
    const VdRunwayArea inBand[] = {{1.0f, 5.0f, 0.0f, 1.0f, 0.05f, 0.0f}};
    const int n = vdRunwayStretches(north, 1, 1.0f, 10.0f, inBand, 1, out, 8);
    expectCount("beside, inside the band", n, 1);
    expectNear("beside start", out[0].startNm, 4.0f);
    expectNear("beside end", out[0].endNm, 6.0f);
  }
  {
    // A runway crossing the cut at 45 degrees, band 0.5 NM: where the band's edges cross it
    const VdRunwayArea diagonal[] = {{0.0f, 5.0f, 45.0f, 1.0f, 0.0f, 0.0f}};
    const int n = vdRunwayStretches(north, 1, 0.5f, 10.0f, diagonal, 1, out, 8);
    expectCount("diagonal", n, 1);
    expectNear("diagonal start", out[0].startNm, 4.5f);
    expectNear("diagonal end", out[0].endNm, 5.5f);
    // with no band, a thin runway crossing the cut is a point: nothing to draw
    expectCount("diagonal, no band", vdRunwayStretches(north, 1, 0.0f, 10.0f, diagonal, 1, out, 8), 0);
  }
  {
    // The aircraft on a runway (CYUL 06/24, course 057): flat from the aircraft
    const VdRunwayArea here[] = {{0.2f, 0.3f, 57.0f, 0.9f, 0.1f, 118.0f}};
    const int n = vdRunwayStretches(north, 1, 1.0f, 10.0f, here, 1, out, 8);
    expectCount("on the runway", n, 1);
    expectNear("on the runway start", out[0].startNm, 0.0f);
    if (n == 1 && !(out[0].endNm > 0.5f && out[0].endNm < 2.0f)) {
      std::printf("FAIL on the runway end: %f\n", out[0].endNm);
      ++failures;
    }
  }
  {
    // Behind the aircraft and beyond the range: nothing; at the range edge: clipped
    const VdRunwayArea none[] = {{0.0f, -5.0f, 0.0f, 1.0f, 0.05f, 0.0f}, {0.0f, 14.0f, 0.0f, 1.0f, 0.05f, 0.0f}};
    expectCount("behind, beyond", vdRunwayStretches(north, 1, 1.0f, 10.0f, none, 2, out, 8), 0);
    const VdRunwayArea atEdge[] = {{0.0f, 9.5f, 0.0f, 1.0f, 0.05f, 0.0f}};
    const int n = vdRunwayStretches(north, 1, 1.0f, 10.0f, atEdge, 1, out, 8);
    expectCount("range edge", n, 1);
    expectNear("range edge end", out[0].endNm, 10.0f);
  }
  {
    // Along a plan that turns east after 4 NM: a runway along the second piece
    const VdCutSegment plan[] = {{0.0f, 0.0f, 0.0f, 4.0f, 0.0f}, {0.0f, 4.0f, 90.0f, 20.0f, 4.0f}};
    const VdRunwayArea onLeg[] = {{3.0f, 4.0f, 90.0f, 0.5f, 0.05f, 300.0f}};
    const int n = vdRunwayStretches(plan, 2, 0.0f, 10.0f, onLeg, 1, out, 8);
    expectCount("second piece", n, 1);
    expectNear("second piece start", out[0].startNm, 6.5f);
    expectNear("second piece end", out[0].endNm, 7.5f);
    expectNear("second piece elevation", out[0].elevationFeet, 300.0f);
  }
  {
    // No more than maxOut stretches
    const VdRunwayArea many[] = {
        {0.0f, 2.0f, 0.0f, 0.5f, 0.05f, 0.0f}, {0.0f, 5.0f, 0.0f, 0.5f, 0.05f, 0.0f}, {0.0f, 8.0f, 0.0f, 0.5f, 0.05f, 0.0f}};
    expectCount("maxOut", vdRunwayStretches(north, 1, 0.0f, 10.0f, many, 3, out, 2), 2);
  }

  if (failures == 0) {
    std::printf("vd_runways_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
