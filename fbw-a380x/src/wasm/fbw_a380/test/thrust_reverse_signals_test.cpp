// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the thrust lever reverse signals of the thrust reverser lines of defense (src/ThrustReverseSignals.h): run
// test/run_tests.sh. Build with -DWITHOUT_THE_FIX to give the PRIM signal without looking at its health: the check of the
// failed PRIM must fail.

#include <cstdio>

#include "ThrustReverseSignals.h"

using namespace ThrustReverseSignals;

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

int main() {
  expect(!reverseSwitchClosed(0.0), "switch open at idle");
  expect(!reverseSwitchClosed(25.0), "switch open in the forward sector");
  expect(!reverseSwitchClosed(-3.0), "switch still open at the start of the reverse sector");
  expect(reverseSwitchClosed(-6.0), "switch closed at reverse idle");
  expect(reverseSwitchClosed(-20.0), "switch closed at full reverse");

  expect(!primReverseSelected(true, 0.0), "healthy PRIM sees no reverse at idle");
  expect(!primReverseSelected(true, -3.7), "healthy PRIM sees no reverse before its angle");
  expect(primReverseSelected(true, -6.0), "healthy PRIM sees reverse at reverse idle");
  expect(primReverseSelected(true, -20.0), "healthy PRIM sees reverse at full reverse");
  expect(!primReverseSelected(false, -20.0), "failed PRIM gives no reverse signal");

  expect(!primControlsThirdLine(0, 2) && primControlsThirdLine(1, 2) && primControlsThirdLine(2, 2),
         "PRIMs 2 and 3 control the third line of engine 2");
  expect(primControlsThirdLine(0, 3) && primControlsThirdLine(1, 3) && !primControlsThirdLine(2, 3),
         "PRIMs 1 and 2 control the third line of engine 3");

  if (failures > 0) {
    std::printf("thrust_reverse_signals_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("thrust_reverse_signals_test: all checks passed\n");
  return 0;
}
