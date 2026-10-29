// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the dome light switch positions a lighting preset loads (LightingPresets/DomeLightSwitch.hpp):
// run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../LightingPresets/DomeLightSwitch.hpp"

using lighting_presets::domeLightSwitchLevel;

static int failures = 0;

static void expectNear(const char* what, double actual, double expected) {
  if (std::fabs(actual - expected) > 1e-9) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  // The three switch positions load unchanged
  expectNear("OFF stays OFF", domeLightSwitchLevel(0.0), 0.0);
  expectNear("DIM stays DIM", domeLightSwitchLevel(20.0), 20.0);
  expectNear("BRT stays BRT", domeLightSwitchLevel(100.0), 100.0);

  // Nothing below OFF
  expectNear("a negative level is OFF", domeLightSwitchLevel(-5.0), 0.0);

  // Levels between the positions go to the nearest one
  expectNear("a low level is DIM", domeLightSwitchLevel(1.0), 20.0);
  expectNear("DIM saved as 50 by the old rounding loads as DIM", domeLightSwitchLevel(50.0), 20.0);
  expectNear("60 is still DIM", domeLightSwitchLevel(60.0), 20.0);
  expectNear("61 is BRT", domeLightSwitchLevel(61.0), 100.0);
  expectNear("above BRT is BRT", domeLightSwitchLevel(150.0), 100.0);

  // No level in between: the model only moves the switch for an exact position
  for (double level = -10.0; level <= 110.0; level += 0.5) {
    const double position = domeLightSwitchLevel(level);
    if (position != 0.0 && position != 20.0 && position != 100.0) {
      std::printf("FAIL %f maps to %f, not a switch position\n", level, position);
      ++failures;
    }
  }

  if (failures == 0) {
    std::printf("dome_light_switch_test: all tests passed\n");
    return 0;
  }
  std::printf("dome_light_switch_test: %d failure(s)\n", failures);
  return 1;
}
