// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the VD airport stretches (src/vd_airports.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/vd_airports.h"

using ndwxr::VdAirportArea;
using ndwxr::VdCutSegment;
using ndwxr::VdFlatStretch;
using ndwxr::vdAirportStretches;

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
    // An airport on the cut, centre 5 NM ahead, radius 1.5 NM: flat over its diameter, at its elevation
    const VdAirportArea ahead[] = {{0.0f, 5.0f, 1.5f, 118.0f}};
    const int n = vdAirportStretches(north, 1, 0.5f, 10.0f, ahead, 1, out, 8);
    expectCount("ahead", n, 1);
    expectNear("ahead start", out[0].startNm, 3.5f);
    expectNear("ahead end", out[0].endNm, 6.5f);
    expectNear("ahead elevation", out[0].elevationFeet, 118.0f);
  }
  {
    // An airport 1.8 NM beside the cut, radius 1 NM, band 0.5 NM: the band's edge is 1.3 NM from the centre, outside
    const VdAirportArea beside[] = {{1.8f, 5.0f, 1.0f, 0.0f}};
    expectCount("beside, outside", vdAirportStretches(north, 1, 0.5f, 10.0f, beside, 1, out, 8), 0);
    // 1.1 NM beside: the band's edge is 0.6 NM from the centre, so it reaches the circle over 2 sqrt(1 - 0.36) = 1.6 NM
    const VdAirportArea near[] = {{1.1f, 5.0f, 1.0f, 0.0f}};
    const int n = vdAirportStretches(north, 1, 0.5f, 10.0f, near, 1, out, 8);
    expectCount("beside, inside", n, 1);
    expectNear("beside start", out[0].startNm, 4.2f);
    expectNear("beside end", out[0].endNm, 5.8f);
    // a centre within the band: the whole diameter
    const VdAirportArea inBand[] = {{-0.3f, 5.0f, 1.0f, 0.0f}};
    const int m = vdAirportStretches(north, 1, 0.5f, 10.0f, inBand, 1, out, 8);
    expectCount("centre in the band", m, 1);
    expectNear("centre in the band start", out[0].startNm, 4.0f);
    expectNear("centre in the band end", out[0].endNm, 6.0f);
  }
  {
    // A taxiway 0.25 NM beside a runway (the spike the 0.15 NM rectangles left): the airport's circle holds it, so a cut
    // over the taxiway only, with no band, is flat there
    const VdCutSegment overTaxiway[] = {{1.25f, 3.0f, 0.0f, 10.0f, 0.0f}};
    // two parallel runways at east 0 and 1, 2 NM long, centred 5 NM north: the circle around them plus 0.3 NM
    const float radius = std::hypot(0.5f, 1.0f) + 0.3f;
    const VdAirportArea airport[] = {{0.5f, 5.0f, radius, 0.0f}};
    expectCount("taxiway beside the runway", vdAirportStretches(overTaxiway, 1, 0.0f, 10.0f, airport, 1, out, 8), 1);
  }
  {
    // The aircraft at the airport: flat from the aircraft
    const VdAirportArea here[] = {{0.2f, 0.3f, 1.2f, 118.0f}};
    const int n = vdAirportStretches(north, 1, 1.0f, 10.0f, here, 1, out, 8);
    expectCount("at the airport", n, 1);
    expectNear("at the airport start", out[0].startNm, 0.0f);
    expectNear("at the airport end", out[0].endNm, 1.5f);
  }
  {
    // Behind the aircraft and beyond the range: nothing; at the range edge: clipped
    const VdAirportArea none[] = {{0.0f, -5.0f, 1.0f, 0.0f}, {0.0f, 14.0f, 1.0f, 0.0f}};
    expectCount("behind, beyond", vdAirportStretches(north, 1, 1.0f, 10.0f, none, 2, out, 8), 0);
    const VdAirportArea atEdge[] = {{0.0f, 9.5f, 1.0f, 0.0f}};
    const int n = vdAirportStretches(north, 1, 1.0f, 10.0f, atEdge, 1, out, 8);
    expectCount("range edge", n, 1);
    expectNear("range edge start", out[0].startNm, 8.5f);
    expectNear("range edge end", out[0].endNm, 10.0f);
  }
  {
    // Along a plan that turns east after 4 NM: an airport on the second piece
    const VdCutSegment plan[] = {{0.0f, 0.0f, 0.0f, 4.0f, 0.0f}, {0.0f, 4.0f, 90.0f, 20.0f, 4.0f}};
    const VdAirportArea onLeg[] = {{3.0f, 4.0f, 0.5f, 300.0f}};
    const int n = vdAirportStretches(plan, 2, 0.0f, 10.0f, onLeg, 1, out, 8);
    expectCount("second piece", n, 1);
    expectNear("second piece start", out[0].startNm, 6.5f);
    expectNear("second piece end", out[0].endNm, 7.5f);
    expectNear("second piece elevation", out[0].elevationFeet, 300.0f);
  }
  {
    // No more than maxOut stretches
    const VdAirportArea many[] = {{0.0f, 2.0f, 0.5f, 0.0f}, {0.0f, 5.0f, 0.5f, 0.0f}, {0.0f, 8.0f, 0.5f, 0.0f}};
    expectCount("maxOut", vdAirportStretches(north, 1, 0.0f, 10.0f, many, 3, out, 2), 2);
  }

  if (failures == 0) {
    std::printf("vd_airports_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
