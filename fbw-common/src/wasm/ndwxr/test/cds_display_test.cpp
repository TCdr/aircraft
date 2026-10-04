// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the CDS reconfiguration check (src/cds_display.h): run test/run_tests.sh.

#include <cstdio>

#include "../src/cds_display.h"

using ndwxr::isNdShownOnNdDisplayUnit;

static int failures = 0;

static void expect(const char* what, bool actual, bool expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  expect("own display (normal operation)", isNdShownOnNdDisplayUnit(0.0), true);
  expect("ND", isNdShownOnNdDisplayUnit(2.0), true);
  expect("PFD on the ND DU", isNdShownOnNdDisplayUnit(1.0), false);
  expect("MFD on the ND DU", isNdShownOnNdDisplayUnit(3.0), false);
  expect("EWD on the ND DU", isNdShownOnNdDisplayUnit(4.0), false);
  expect("SD on the ND DU", isNdShownOnNdDisplayUnit(5.0), false);
  if (failures == 0) {
    std::printf("cds_display_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
