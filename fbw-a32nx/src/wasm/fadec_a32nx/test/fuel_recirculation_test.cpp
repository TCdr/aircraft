// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the IDG cooling fuel the FADEC moves from the inner to the outer wing tank (src/Fadec/FuelRecirculation_A32NX.hpp):
// run test/run_tests.sh. Built with -DWITHOUT_THE_FIX, no fuel moves and the checks fail.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/FuelRecirculation_A32NX.hpp"

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.4f)\n", what, value);
    ++failures;
  }
}

static double returnedPounds(double flowKgPerHour, double deltaTimeHours, double innerPounds, double outerPounds, double capacityPounds) {
#ifdef WITHOUT_THE_FIX
  (void)flowKgPerHour;
  (void)deltaTimeHours;
  (void)innerPounds;
  (void)outerPounds;
  (void)capacityPounds;
  return 0.0;
#else
  return FuelRecirculation_A32NX::returnedPounds(flowKgPerHour, deltaTimeHours, innerPounds, outerPounds, capacityPounds);
#endif
}

int main() {
  constexpr double CAPACITY = 1500.0;  // lb
  constexpr double HOUR     = 1.0;

  // 300 kg/h for one hour moves 300 kg
  const double hour = returnedPounds(300.0, HOUR, 10000.0, 0.0, CAPACITY);
  expect("300 kg/h for an hour moves 661 lb", std::fabs(hour - 300.0 * FuelRecirculation_A32NX::POUNDS_PER_KG) < 0.01, hour);

  // A frame of 50 ms at 600 kg/h
  const double frame = returnedPounds(600.0, 0.05 / 3600.0, 10000.0, 0.0, CAPACITY);
  expect("a frame of 50 ms at 600 kg/h moves 0.018 lb", std::fabs(frame - 600.0 * 2.2046226218 * 0.05 / 3600.0) < 1e-6, frame);

  // No flow, no fuel moves
  expect("a closed valve moves nothing", returnedPounds(0.0, HOUR, 10000.0, 0.0, CAPACITY) == 0.0, 0.0);

  // A full outer tank spills into the inner tank: nothing moves; a nearly full one takes only its room
  expect("a full outer tank takes nothing", returnedPounds(300.0, HOUR, 10000.0, CAPACITY, CAPACITY) == 0.0, 0.0);
  const double nearlyFull = returnedPounds(300.0, HOUR, 10000.0, CAPACITY - 10.0, CAPACITY);
  expect("a nearly full outer tank takes its room", std::fabs(nearlyFull - 10.0) < 1e-9, nearlyFull);

  // An almost empty inner tank gives what it holds
  const double emptyInner = returnedPounds(300.0, HOUR, 5.0, 0.0, CAPACITY);
  expect("the inner tank gives at most what it holds", std::fabs(emptyInner - 5.0) < 1e-9, emptyInner);

  if (failures == 0) {
    std::printf("fuel_recirculation_test: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
