// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the idle setting of the FADEC (src/Fadec/IdleSetting_A380X.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/IdleSetting_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static bool near(double value, double expected) {
  return std::fabs(value - expected) <= 1e-9;
}

using Inputs = IdleSetting_A380X::Inputs;

/// In flight, FLAPS 0, gear up, no bleed, normal oil temperature
static Inputs cleanInFlight() {
  return {false, 0, false, false, false, false, 90.0};
}

static void testApproachIdleWithFlaps2Or3OrFullOrTheGearDown() {
  for (int flaps = 0; flaps <= 4; flaps++) {
    Inputs in             = cleanInFlight();
    in.flapsLeverPosition = flaps;
    char what[64];
    std::snprintf(what, sizeof(what), "approach idle at FLAPS lever %d: %s", flaps, flaps >= 2 ? "yes" : "no");
    expect(IdleSetting_A380X::isApproachIdle(in) == (flaps >= 2), what);
  }
  Inputs gearDown          = cleanInFlight();
  gearDown.landingGearDown = true;
  expect(IdleSetting_A380X::isApproachIdle(gearDown), "approach idle with the landing gear down");
  expect(near(IdleSetting_A380X::correctedN3Increase(gearDown), IdleSetting_A380X::APPROACH_IDLE_CN3_INCREASE),
         "approach idle raises the idle");
}

static void testNormalIdleOnTheGround() {
  Inputs in             = cleanInFlight();
  in.onGround           = true;
  in.flapsLeverPosition = 3;
  in.landingGearDown    = true;
  expect(!IdleSetting_A380X::isApproachIdle(in), "on the ground: normal idle, whatever the flaps and gear");
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 0.0), "on the ground without bleed: the basic idle");
}

static void testCleanFlightIsTheBasicIdle() {
  Inputs flaps1             = cleanInFlight();
  flaps1.flapsLeverPosition = 1;
  expect(near(IdleSetting_A380X::correctedN3Increase(cleanInFlight()), 0.0), "FLAPS 0, no bleed: the basic idle");
  expect(near(IdleSetting_A380X::correctedN3Increase(flaps1), 0.0), "FLAPS 1 is normal idle");
}

static void testBleedDemandRaisesTheNormalIdle() {
  Inputs in = cleanInFlight();
  in.packs  = true;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 0.5), "packs");
  in.nacelleAntiIce = true;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 1.5), "packs and nacelle anti-ice");
  in.wingAntiIce = true;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 3.0), "packs, nacelle and wing anti-ice");

  Inputs groundAntiIce         = cleanInFlight();
  groundAntiIce.onGround       = true;
  groundAntiIce.nacelleAntiIce = true;
  expect(near(IdleSetting_A380X::correctedN3Increase(groundAntiIce), 1.0), "engine anti-ice raises the ground idle");
}

static void testHighOilTemperatureRaisesTheNormalIdle() {
  Inputs in                = cleanInFlight();
  in.highestOilTemperature = 163.0;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 0.0), "oil at 163 C: no raise yet");
  in.highestOilTemperature = 170.0;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 1.5), "oil at 170 C: half the raise");
  in.highestOilTemperature = 200.0;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 3.0), "oil above 177 C: the full raise");
}

static void testApproachIdleTakesTheHighestOfTheTwo() {
  Inputs in             = cleanInFlight();
  in.flapsLeverPosition = 4;
  in.packs              = true;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 4.0), "approach idle covers the packs demand");
  in.wingAntiIce           = true;
  in.nacelleAntiIce        = true;
  in.highestOilTemperature = 177.0;
  expect(near(IdleSetting_A380X::correctedN3Increase(in), 6.0), "a higher normal idle demand is kept in approach");
}

int main() {
  testApproachIdleWithFlaps2Or3OrFullOrTheGearDown();
  testNormalIdleOnTheGround();
  testCleanFlightIsTheBasicIdle();
  testBleedDemandRaisesTheNormalIdle();
  testHighOilTemperatureRaisesTheNormalIdle();
  testApproachIdleTakesTheHighestOfTheTwo();

  if (failures > 0) {
    std::printf("idle_setting_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("idle_setting_test: all passed\n");
  return 0;
}
