// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the ELAC and SEC inputs under the flyPad failures of the sidesticks, of the sidestick priority logic
// and of the stabilizer electrical control (src/failures/FlightControlFailureInputs.h), with the generated ElacComputer:
// run test/run_tests.sh.

#include <cstdio>

#include "../src/elac/Elac.h"
#include "../src/failures/FlightControlFailureInputs.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

static void sidestickInputsFollowTheSidestickFailures() {
  const SidestickPositions normal = sidestickPositions(0.5, -0.25, false, false);
  expect(normal.captPitch == 0.5 && normal.captRoll == -0.25, "the sim input is the CAPT sidestick");
  expect(normal.foPitch == 0 && normal.foRoll == 0, "the F/O sidestick sends nothing without a failure");

  const SidestickPositions captFailed = sidestickPositions(0.5, -0.25, true, false);
  expect(captFailed.captPitch == 0 && captFailed.captRoll == 0, "a failed CAPT sidestick sends nothing");
  expect(captFailed.foPitch == 0.5 && captFailed.foRoll == -0.25, "with the CAPT sidestick failed the input is the F/O one");

  const SidestickPositions foFailed = sidestickPositions(0.5, -0.25, false, true);
  expect(foFailed.captPitch == 0.5 && foFailed.foPitch == 0, "a failed F/O sidestick leaves the CAPT sidestick");

  const SidestickPositions bothFailed = sidestickPositions(0.5, -0.25, true, true);
  expect(bothFailed.captPitch == 0 && bothFailed.captRoll == 0 && bothFailed.foPitch == 0 && bothFailed.foRoll == 0,
         "with both sidesticks failed no order reaches the computers");
}

static void priorityLogicFailureStopsTheTakeover() {
  expect(priorityTakeoverPressed(true, false), "the take over pb reaches the computers");
  expect(!priorityTakeoverPressed(true, true), "a failed priority logic does not pass the take over pb");
  expect(!priorityTakeoverPressed(false, false), "no take over without the pb");
}

/// ELAC 2 engaged with the three hydraulic systems pressurised, after its first (long) self-test, then 2 s with the
/// given THS motor fault input.
static bool elac2PitchAxisOk(bool thsMotorFault) {
  Elac elac(false);
  elac.modelInputs.in.discrete_inputs.elac_engaged_from_switch = true;
  elac.modelInputs.in.analog_inputs.blue_hyd_pressure_psi = 3000;
  elac.modelInputs.in.analog_inputs.green_hyd_pressure_psi = 3000;
  elac.modelInputs.in.analog_inputs.yellow_hyd_pressure_psi = 3000;
  elac.modelInputs.in.time.dt = frameTime;
  for (double t = 0; t < 10; t += frameTime) {
    elac.update(frameTime, t, false, true);
  }
  elac.modelInputs.in.discrete_inputs.ths_motor_fault = thsMotorFault;
  for (double t = 10; t < 12; t += frameTime) {
    elac.update(frameTime, t, false, true);
  }
  return elac.getDiscreteOutputs().pitch_axis_ok;
}

// F/CTL STABILIZER JAM: the loss of the electrical control of the THS makes the ELACs lose the pitch axis, the pitch
// law reverts to alternate law on the SECs.
static void thsMotorFaultMakesTheElacLoseThePitchAxis() {
  expect(elac2PitchAxisOk(false), "ELAC 2 has the pitch axis with the THS controlled");
  expect(!elac2PitchAxisOk(true), "ELAC 2 loses the pitch axis with the THS motor fault");
}

int main() {
  sidestickInputsFollowTheSidestickFailures();
  priorityLogicFailureStopsTheTakeover();
  thsMotorFaultMakesTheElacLoseThePitchAxis();
  if (failures > 0) {
    std::printf("flight_control_failure_inputs_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("flight_control_failure_inputs_test: all checks passed\n");
  return 0;
}
