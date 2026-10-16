// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the wing tank leak (src/Fadec/WingTankLeak_A32NX.hpp): run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the leak takes nothing out of the tank, as EngineControlA32NX.cpp did before the leak
// failures: the test then fails.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/WingTankLeak_A32NX.hpp"

#ifdef WITHOUT_THE_FIX
static double leaked(bool, double, double) {
  return 0.0;
}
#else
static double leaked(bool leaking, double deltaTimeHours, double tankPounds) {
  return WingTankLeak_A32NX::leakedPounds(leaking, deltaTimeHours, tankPounds);
}
#endif

static int failures = 0;

static void expectNear(const char* what, double actual, double expected) {
  if (std::fabs(actual - expected) > 1e-6) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  // 3 000 kg/h: one frame of 50 ms takes 3000 * 2.2046226218 * 50 / 3 600 000 lb
  expectNear("a leaking tank loses 3 000 kg/h", leaked(true, 0.05 / 3600.0, 10000.0), 3000.0 * 2.2046226218 * 0.05 / 3600.0);

  // Over 30 min of 50 ms frames the tank loses 1 500 kg (the F. USED/FOB DISAGREE threshold)
  double tankPounds = 10000.0;
  for (int frame = 0; frame < 30 * 60 * 20; ++frame) {
    tankPounds -= leaked(true, 0.05 / 3600.0, tankPounds);
  }
  expectNear("1 500 kg lost in 30 min", (10000.0 - tankPounds) / 2.2046226218, 1500.0);

  // Never more than the tank holds, nothing without the failure or without time
  expectNear("never more than the tank holds", leaked(true, 1.0, 100.0), 100.0);
  expectNear("no failure, no leak", leaked(false, 1.0, 10000.0), 0.0);
  expectNear("no time, no leak", leaked(true, 0.0, 10000.0), 0.0);

  if (failures > 0) {
    std::printf("wing_tank_leak_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("wing_tank_leak_test: OK\n");
  return 0;
}
