// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the engine oil failures shared by the FADECs (src/EngineOilFailures.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/EngineOilFailures.hpp"

static int failures = 0;

static void expectNear(const char* what, double value, double expected, double tolerance = 1e-6) {
  if (std::fabs(value - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, value, expected);
    ++failures;
  }
}

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

int main() {
  using namespace EngineOilFailures;

  // Leak: 2 qt/min while the core turns the oil pump, nothing without the failure or with the core stopped.
  const double rate = 2.0 / 60.0;
  expectNear("leak, 1 s at 2 qt/min", leakedQuantity(true, 85.0, 15.0, rate, 1.0), rate);
  expectNear("no leak without the failure", leakedQuantity(false, 85.0, 15.0, rate, 1.0), 0.0);
  expectNear("no leak with the core stopped", leakedQuantity(true, 0.0, 15.0, rate, 1.0), 0.0);
  expectNear("no leak below the oil pump speed", leakedQuantity(true, 9.0, 15.0, rate, 1.0), 0.0);
  expectNear("windmilling core above the oil pump speed leaks", leakedQuantity(true, 12.0, 15.0, rate, 1.0), rate);
  expectNear("never more than the oil left", leakedQuantity(true, 85.0, 0.01, rate, 1.0), 0.01);
  expectNear("an empty system loses nothing", leakedQuantity(true, 85.0, 0.0, rate, 1.0), 0.0);

  // A whole leak: 15 qt at 2 qt/min in 0.1 s steps is empty after 7.5 min, never below 0.
  double total = 15.0;
  for (int step = 0; step < 4500; ++step) {
    total -= leakedQuantity(true, 85.0, total, rate, 0.1);
  }
  expectNear("15 qt gone after 7.5 min", total, 0.0, 1e-6);
  expectTrue("the quantity never goes below 0", total >= 0.0);

  // Pressure: the pump delivers its normal pressure down to 2 qt in the tank, none at 0.5 qt, linear in between.
  expectNear("normal pressure with a full tank", pressureFactor(12.0, 2.0, 0.5), 1.0);
  expectNear("normal pressure at the threshold", pressureFactor(2.0, 2.0, 0.5), 1.0);
  expectNear("half pressure half way", pressureFactor(1.25, 2.0, 0.5), 0.5);
  expectNear("no pressure with an empty tank", pressureFactor(0.5, 2.0, 0.5), 0.0);
  expectNear("no pressure below the empty quantity", pressureFactor(0.0, 2.0, 0.5), 0.0);

  // Overheat: heads to 135 C at idle, 175 C at 100 % core speed, with a 60 s time constant.
  const OverheatParameters overheat{135.0, 175.0, 60.0};
  expectNear("target at idle", overheatTargetTemperature(68.0, 68.0, overheat), 135.0);
  expectNear("target below idle", overheatTargetTemperature(20.0, 68.0, overheat), 135.0);
  expectNear("target at 100 %", overheatTargetTemperature(100.0, 68.0, overheat), 175.0);
  expectNear("target half way", overheatTargetTemperature(84.0, 68.0, overheat), 155.0);
  expectNear("one time constant: 63 % of the way", overheatTemperature(85.0, 100.0, 68.0, 60.0, overheat),
             85.0 + 90.0 * (1.0 - std::exp(-1.0)));

  double temperature = 85.0;
  for (int step = 0; step < 6000; ++step) {
    temperature = overheatTemperature(temperature, 100.0, 68.0, 0.1, overheat);
  }
  expectNear("10 min at full thrust: at the full thrust temperature", temperature, 175.0, 0.1);
  for (int step = 0; step < 6000; ++step) {
    temperature = overheatTemperature(temperature, 68.0, 68.0, 0.1, overheat);
  }
  expectNear("then 10 min at idle: back at the idle temperature", temperature, 135.0, 0.1);

  if (failures == 0) {
    std::printf("engine_oil_failures_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
