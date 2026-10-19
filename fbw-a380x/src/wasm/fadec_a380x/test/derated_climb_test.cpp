// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the derated climb rating of the FADEC (src/Fadec/DeratedClimb_A380X.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/DeratedClimb_A380X.hpp"

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

/// DCL1, DCL2 and DCL3 reduce the maximum climb thrust by 8, 16 and 24 % below their washout altitude.
static void testEachLevelReducesTheClimbThrust() {
  expect(near(DeratedClimb_A380X::thrustReductionPercent(1, 10000.0), 8.0), "DCL1 at 10 000 ft: 8 %");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(2, 10000.0), 16.0), "DCL2 at 10 000 ft: 16 %");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(3, 10000.0), 24.0), "DCL3 at 10 000 ft: 24 %");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(0, 10000.0), 0.0), "NONE: no reduction");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(4, 10000.0), 0.0), "no fourth level");
}

/// The washout to the maximum climb thrust starts at 29 000 ft (DCL1), 25 000 ft (DCL2), 21 000 ft (DCL3).
static void testTheWashoutToTheMaximumClimbThrust() {
  expect(near(DeratedClimb_A380X::thrustReductionPercent(1, 29000.0), 8.0), "DCL1 full at 29 000 ft");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(2, 25000.0), 16.0), "DCL2 full at 25 000 ft");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(3, 21000.0), 24.0), "DCL3 full at 21 000 ft");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(1, 32000.0), 4.0), "DCL1 half washed out at 32 000 ft");
  expect(near(DeratedClimb_A380X::thrustReductionPercent(3, 28000.0), 12.0), "DCL3 half washed out at 28 000 ft");
  for (int level = 1; level <= 3; level++) {
    expect(near(DeratedClimb_A380X::thrustReductionPercent(level, 35000.0), 0.0), "maximum climb thrust at 35 000 ft");
    expect(near(DeratedClimb_A380X::thrustReductionPercent(level, 41000.0), 0.0), "maximum climb thrust above");
  }
}

static void testTheClimbDetent() {
  expect(DeratedClimb_A380X::leversInClimbDetent(25.0), "TLA 25: CL detent");
  expect(!DeratedClimb_A380X::leversInClimbDetent(35.0), "TLA 35: FLX/MCT detent");
  expect(!DeratedClimb_A380X::leversInClimbDetent(0.0), "TLA 0: IDLE");
}

static void testAppliedFromTheSelectionThroughTheTakeoff() {
  DeratedClimb_A380X fadec;
  expect(fadec.update({2, true, false}) == 2, "on the ground: the selected level");
  // Takeoff: the levers pass the CL detent on the ground to FLX, the aircraft lifts off, the levers come back to CL
  expect(fadec.update({2, true, true}) == 2, "levers through CL on the ground");
  expect(fadec.update({2, false, false}) == 2, "airborne at FLX: still selected");
  expect(fadec.update({2, false, true}) == 2, "thrust reduction: the levers at CL, DCLB2");
  expect(fadec.update({2, false, true}) == 2, "climb at CL: DCLB2");
}

static void testNoneCancels() {
  DeratedClimb_A380X fadec;
  fadec.update({3, false, true});
  expect(fadec.update({0, false, true}) == 0, "NONE on the MFD: maximum climb thrust");
}

static void testLeversOutOfTheClimbDetentAndBackCancel() {
  DeratedClimb_A380X fadec;
  fadec.update({1, false, true});
  expect(fadec.update({1, false, false}) == 0, "levers out of CL: cancelled");
  expect(fadec.update({1, false, true}) == 0, "levers back at CL: stays cancelled");
  expect(fadec.update({2, false, true}) == 2, "a new MFD selection applies again");
}

static void testANewFlightStartsAgain() {
  DeratedClimb_A380X fadec;
  fadec.update({1, false, true});
  fadec.update({1, false, false});
  expect(fadec.update({1, true, false}) == 1, "after landing, the selection applies again");
}

int main() {
  testEachLevelReducesTheClimbThrust();
  testTheWashoutToTheMaximumClimbThrust();
  testTheClimbDetent();
  testAppliedFromTheSelectionThroughTheTakeoff();
  testNoneCancels();
  testLeversOutOfTheClimbDetentAndBackCancel();
  testANewFlightStartsAgain();

  if (failures > 0) {
    std::printf("derated_climb_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("derated_climb_test: all passed\n");
  return 0;
}
