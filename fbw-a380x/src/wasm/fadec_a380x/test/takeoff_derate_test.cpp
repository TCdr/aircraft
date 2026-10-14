// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the DOx derated takeoff rating of the FADEC (src/Fadec/TakeoffDerate_A380X.hpp): run
// test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/TakeoffDerate_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static bool near(double value, double expected, double tolerance) {
  return std::fabs(value - expected) <= tolerance;
}

/// The corrected N1 of the TOGA rating at sea level below the corner point (ThrustLimits_A380X TO row 0 ft, CN1 Flat)
static constexpr double SEA_LEVEL_TOGA_CN1 = 83.832;

/// FCOM DSC-70-20-40 (l.111564-111565): "6 derated takeoff levels are defined: DO4 , DO8 , D12 , D16 , D20 , D24 . Each
/// level reduces the maximum thrust from 4 % up to 24 %."
static void testEachLevelReducesTheRatedThrustByItsPercentage() {
  const double ratedThrust = TakeoffDerate_A380X::thrustOfCorrectedN1(SEA_LEVEL_TOGA_CN1);
  double       previousN1  = SEA_LEVEL_TOGA_CN1;
  for (int level = 4; level <= 24; level += 4) {
    const double deratedN1 = TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, level);
    const double thrust    = TakeoffDerate_A380X::thrustOfCorrectedN1(deratedN1);
    char         what[96];
    std::snprintf(what, sizeof(what), "D%02d gives %.1f %% of the rated thrust", level, 100.0 * thrust / ratedThrust);
    expect(near(thrust / ratedThrust, 1.0 - level / 100.0, 1e-9), what);
    std::snprintf(what, sizeof(what), "D%02d N1 %.2f below the previous level %.2f", level, deratedN1, previousN1);
    expect(deratedN1 < previousN1, what);
    previousN1 = deratedN1;
  }
}

static void testTheD24LimitOfTheSeaLevelRating() {
  // engines.cfg Mach 0 thrust: 1.198 at 83.8 % corrected N1, 76 % of it (0.910) at 71.5 %
  const double d24 = TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, 24.0);
  expect(near(d24, 71.49, 0.01), "D24 at sea level: 71.49 % corrected N1");
}

static void testNoDerateKeepsTheRating() {
  expect(TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, 0.0) == SEA_LEVEL_TOGA_CN1, "no derate: rated N1");
  expect(TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, -3.0) == SEA_LEVEL_TOGA_CN1,
         "negative derate: rated N1");
  expect(TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, 40.0) ==
             TakeoffDerate_A380X::deratedCorrectedN1(SEA_LEVEL_TOGA_CN1, 24.0),
         "a derate above D24 is limited to D24");
}

static void testTheThrustTableRoundTrips() {
  for (double n1 = 20.0; n1 <= 105.0; n1 += 2.5) {
    const double back = TakeoffDerate_A380X::correctedN1OfThrust(TakeoffDerate_A380X::thrustOfCorrectedN1(n1));
    expect(near(back, n1, 1e-9), "thrust table inverse");
  }
}

int main() {
  testEachLevelReducesTheRatedThrustByItsPercentage();
  testTheD24LimitOfTheSeaLevelRating();
  testNoDerateKeepsTheRating();
  testTheThrustTableRoundTrips();

  if (failures > 0) {
    std::printf("takeoff_derate_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("takeoff_derate_test: all passed\n");
  return 0;
}
