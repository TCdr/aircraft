// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the thrust lever reverse signal of the SEC: run test/run_tests.sh.
//
// The thrust reverser deploys only with a reverse thrust lever signal from at least one SEC. A SEC gives the signal for
// the lever of an engine only while it runs; a SEC that is switched off or has lost its power gives none.

#include <cstdio>

#include "../src/sec/Sec.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

static void run(Sec& sec, double seconds, bool isPowered) {
  for (double t = 0; t < seconds; t += frameTime) {
    sec.update(frameTime, 0, false, isPowered);
  }
}

static void secGivesTheReverseSignalOfTheLeverInTheReverseSector() {
  Sec sec(true, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = -20;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = 0;
  run(sec, 40, true);

  expect(sec.isThrustReverseSelected(0), "lever 1 in reverse gives the signal");
  expect(!sec.isThrustReverseSelected(1), "lever 2 at idle gives no signal");

  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = 25;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = -6;
  run(sec, 1, true);
  expect(!sec.isThrustReverseSelected(0), "lever 1 in the forward sector gives no signal");
  expect(sec.isThrustReverseSelected(1), "lever 2 in reverse idle gives the signal");
}

static void switchedOffSecGivesNoReverseSignal() {
  Sec sec(true, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = false;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = -20;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = -20;
  run(sec, 40, true);

  expect(!sec.isThrustReverseSelected(0), "switched off SEC gives no signal for lever 1");
  expect(!sec.isThrustReverseSelected(1), "switched off SEC gives no signal for lever 2");
}

static void unpoweredSecGivesNoReverseSignal() {
  Sec sec(true, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = -20;
  run(sec, 40, true);
  expect(sec.isThrustReverseSelected(0), "powered SEC gives the signal");

  run(sec, 1, false);
  expect(!sec.isThrustReverseSelected(0), "SEC without power gives no signal");
}

int main() {
  secGivesTheReverseSignalOfTheLeverInTheReverseSector();
  switchedOffSecGivesNoReverseSignal();
  unpoweredSecGivesNoReverseSignal();

  if (failures > 0) {
    std::printf("sec_thrust_reverse_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("sec_thrust_reverse_test: all checks passed\n");
  return 0;
}
