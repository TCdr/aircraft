// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the TERR ON ND reference altitude (src/terrain_reference.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>
#include <vector>

#include "../src/constants.h"
#include "../src/terrain_reference.h"

using ndwxr::IrVerticalSpeed;
using ndwxr::kTerrainLookAheadFromFpm;
using ndwxr::kTerrainLookAheadOffFpm;
using ndwxr::kTerrainLookAheadSeconds;
using ndwxr::kTerrainLookAheadStepFeet;
using ndwxr::selectVerticalSpeed;
using ndwxr::TerrainLookAhead;
using ndwxr::updateTerrainLookAhead;

static int failures = 0;

static void expect(const char* what, bool actual, bool expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

static void expectFeet(const char* what, float actual, float expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %g, expected %g\n", what, actual, expected);
    ++failures;
  }
}

static float update(TerrainLookAhead& state, bool valid, float verticalSpeedFpm) {
  return updateTerrainLookAhead(state, valid, verticalSpeedFpm, kTerrainLookAheadFromFpm, kTerrainLookAheadOffFpm,
                                kTerrainLookAheadSeconds, kTerrainLookAheadStepFeet);
}

static void testThreshold() {
  TerrainLookAhead state;
  expectFeet("-990 is no look-ahead", update(state, true, -990.0f), 0.0f);
  expectFeet("-1000 is not below the limit", update(state, true, -1000.0f), 0.0f);
  // 1010 ft/min for 30 s is 505 ft, rounded to the 100 ft step
  expectFeet("-1010 is 500", update(state, true, -1010.0f), 500.0f);
}

static void testHysteresis() {
  TerrainLookAhead state;
  expectFeet("-1010 starts", update(state, true, -1010.0f), 500.0f);
  // raw 480 is within one step of 500: stays active and unchanged
  expectFeet("-960 stays active", update(state, true, -960.0f), 500.0f);
  expectFeet("-900 stays active", update(state, true, -900.0f), 500.0f);
  expectFeet("-890 ends", update(state, true, -890.0f), 0.0f);
  expectFeet("-990 stays off", update(state, true, -990.0f), 0.0f);
}

static void testNotValid() {
  TerrainLookAhead state;
  update(state, true, -1010.0f);
  expectFeet("not valid is 0", update(state, false, -1500.0f), 0.0f);
  expectFeet("-950 after not valid is off", update(state, true, -950.0f), 0.0f);
}

static void testDeadband() {
  TerrainLookAhead state;
  // raw 750 is a tie between 700 and 800: it rounds up (away from zero)
  expectFeet("-1500 rounds the tie up", update(state, true, -1500.0f), 800.0f);
  expectFeet("jitter -1480", update(state, true, -1480.0f), 800.0f);
  expectFeet("jitter -1520", update(state, true, -1520.0f), 800.0f);
  expectFeet("back to -1500", update(state, true, -1500.0f), 800.0f);
  // raw 850 is 50 ft from the value in use: inside the deadband
  expectFeet("-1700 is inside the deadband", update(state, true, -1700.0f), 800.0f);
  // raw 900 is a full step from 800
  expectFeet("-1800 moves", update(state, true, -1800.0f), 900.0f);
  // raw 700 is two steps from 900
  expectFeet("-1400 moves down", update(state, true, -1400.0f), 700.0f);
}

static void testRecordedTrace() {
  const float trace[] = {-992.0f,  -1010.0f, -1048.0f, -1062.0f, -1069.0f, -1070.0f, -1067.0f, -1055.0f, -1036.0f,
                         -1005.0f, -976.0f,  -956.0f,  -946.0f,  -931.0f,  -912.0f,  -901.0f,  -899.0f,  -898.0f,
                         -899.0f,  -905.0f,  -910.0f,  -914.0f,  -922.0f,  -929.0f,  -934.0f};
  TerrainLookAhead state;
  std::vector<float> values;
  int changes = 0;
  float previous = 0.0f;
  for (const float verticalSpeed : trace) {
    const float feet = update(state, true, verticalSpeed);
    values.push_back(feet);
    if (feet != previous) {
      ++changes;
    }
    previous = feet;
  }
  // Vertical speed slowly crossing the limits: off at -992 (above the on limit), on from -1010 down to -901, off from -899 on.
  for (size_t i = 0; i < values.size(); ++i) {
    expectFeet("trace value", values[i], (i >= 1 && i <= 15) ? 500.0f : 0.0f);
  }
  expect("the trace changes twice", changes == 2, true);
}

static void testRepeatedCallGivesSameValue() {
  TerrainLookAhead state;
  const float captain = update(state, true, -1234.0f);
  const float firstOfficer = update(state, true, -1234.0f);
  expectFeet("a second call with the same input gives the same value", firstOfficer, captain);
  // 1234 ft/min for 30 s is 617 ft, rounded to 600
  expectFeet("the value is 600", captain, 600.0f);
}

static void testNonFiniteVerticalSpeed() {
  TerrainLookAhead state;
  expectFeet("valid NaN is 0", update(state, true, std::nanf("")), 0.0f);
  expect("valid NaN is not active", state.active, false);
  expectFeet("-1500 after NaN", update(state, true, -1500.0f), 800.0f);
  TerrainLookAhead other;
  expectFeet("valid -infinity is 0", update(other, true, -INFINITY), 0.0f);
}

static void testStepEdges() {
  TerrainLookAhead state;
  update(state, true, -1010.0f);
  // raw 599.5 is 99.5 ft from 500: still inside the step
  expectFeet("-1199 stays 500", update(state, true, -1199.0f), 500.0f);
  // raw 600 is a full step from 500
  expectFeet("-1200 gives 600", update(state, true, -1200.0f), 600.0f);

  TerrainLookAhead again;
  expectFeet("-1010 first time", update(again, true, -1010.0f), 500.0f);
  expectFeet("-890 ends", update(again, true, -890.0f), 0.0f);
  expectFeet("-1010 on again", update(again, true, -1010.0f), 500.0f);

  TerrainLookAhead fast;
  expectFeet("-6000 is 3000", update(fast, true, -6000.0f), 3000.0f);

  TerrainLookAhead inactive;
  expectFeet("exactly -1000 from inactive is 0", update(inactive, true, -1000.0f), 0.0f);
  TerrainLookAhead active;
  update(active, true, -1010.0f);
  // exactly -900 is not above the off limit, so it stays active; raw 450 is 50 ft from 500, inside the step, so 500 stays
  expectFeet("exactly -900 while active stays 500", update(active, true, -900.0f), 500.0f);
}

static void testSelectVerticalSpeed() {
  IrVerticalSpeed irs[3] = {{false, -700.0f}, {true, -800.0f}, {true, -900.0f}};
  expectFeet("IR 2 when IR 1 is not valid", selectVerticalSpeed(irs).fpm, -800.0f);
  irs[1].valid = false;
  expectFeet("IR 3 when IR 1 and 2 are not valid", selectVerticalSpeed(irs).fpm, -900.0f);
  irs[2].valid = false;
  expect("none when all are not valid", selectVerticalSpeed(irs).valid, false);
  const IrVerticalSpeed both[3] = {{true, -990.0f}, {true, -1010.0f}, {false, 0.0f}};
  expectFeet("IR 1 wins", selectVerticalSpeed(both).fpm, -990.0f);
  expect("IR 1 is valid", selectVerticalSpeed(both).valid, true);
}

int main() {
  testThreshold();
  testHysteresis();
  testNotValid();
  testDeadband();
  testRecordedTrace();
  testRepeatedCallGivesSameValue();
  testStepEdges();
  testNonFiniteVerticalSpeed();
  testSelectVerticalSpeed();
  if (failures == 0) {
    std::printf("terrain_reference_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
