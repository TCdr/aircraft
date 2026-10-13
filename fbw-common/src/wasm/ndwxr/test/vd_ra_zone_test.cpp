// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the VD radio altitude zone wipe (src/vd_ra_zone.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/vd_ra_zone.h"

using ndwxr::VdWipeRect;
using ndwxr::vdRadioAltitudeZoneWipe;

static int failures = 0;

static void expectNear(const char* what, float actual, float expected) {
  if (std::fabs(actual - expected) > 1e-3f) {
    std::printf("FAIL %s: %f, expected %f\n", what, static_cast<double>(actual), static_cast<double>(expected));
    ++failures;
  }
}

static void expectTrue(const char* what, bool actual, bool expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  VdWipeRect rect{0.0f, 0.0f, 0.0f, 0.0f};

  // The VD plot of the A380X ND: x 150..690, y 800..1000 (kVdLeft, kVdTop, kVdHeight)
  expectTrue("no block: nothing wiped", vdRadioAltitudeZoneWipe(0.0, 150.0f, 800.0f, 200.0f, &rect), false);

  // The block (18 px centred on x = 150) covers the plot from x = 150 to 159, the whole height
  expectTrue("block shown: wiped", vdRadioAltitudeZoneWipe(1.0, 150.0f, 800.0f, 200.0f, &rect), true);
  expectNear("wipe x", rect.x, 150.0f);
  expectNear("wipe width", rect.width, 9.0f);
  expectNear("wipe y", rect.y, 800.0f);
  expectNear("wipe height", rect.height, 200.0f);

  if (failures == 0) {
    std::printf("vd_ra_zone_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
