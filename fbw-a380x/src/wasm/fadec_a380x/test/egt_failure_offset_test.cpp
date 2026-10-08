// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the EGT with the failure offset (src/Fadec/EgtFailureOffset_A380X.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/EgtFailureOffset_A380X.hpp"

static int failures = 0;

static void expectNear(const char* what, double value, double expected, double tolerance) {
  if (std::fabs(value - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, value, expected);
    ++failures;
  }
}

int main() {
  // A healthy engine at its target EGT stays there.
  expectNear("healthy, steady", EgtFailureOffset_A380X::nextEgt(800.0, 0.0, 800.0, 0.0, 0.05), 800.0, 1e-9);

  // A stall offset appears at once on top of the lagged EGT: no 10 s lag on the failure rise.
  expectNear("offset added at once", EgtFailureOffset_A380X::nextEgt(800.0, 0.0, 800.0, 150.0, 0.05), 950.0, 1e-9);

  // The next update takes the applied offset out before the lag: the EGT does not creep with the offset.
  double egt     = 800.0;
  double applied = 0.0;
  for (int i = 0; i < 200; i++) {
    egt     = EgtFailureOffset_A380X::nextEgt(egt, applied, 800.0, 150.0, 0.05);
    applied = 150.0;
  }
  expectNear("offset steady", egt, 950.0, 1e-9);

  // The offset goes away at once when the failure ends.
  expectNear("offset removed", EgtFailureOffset_A380X::nextEgt(egt, applied, 800.0, 0.0, 0.05), 800.0, 1e-9);

  // The lag of the healthy EGT is unchanged by the offset: from 700 to a 800 target in 10 s (one time constant).
  egt     = 700.0;
  applied = 0.0;
  for (int i = 0; i < 200; i++) {
    egt     = EgtFailureOffset_A380X::nextEgt(egt, applied, 800.0, 100.0, 0.05);
    applied = 100.0;
  }
  expectNear("lag with offset", egt - 100.0, 800.0 - 100.0 * std::exp(-1.0), 1e-6);

  if (failures == 0) {
    std::printf("egt_failure_offset_test: all tests passed\n");
  }
  return failures == 0 ? 0 : 1;
}
