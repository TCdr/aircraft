// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the flight control inputs and spoiler orders under the flyPad failures of the sidesticks, rudder pedals,
// rudder trim motors, speed brakes lever, PRIM wheel speed inputs and spoilers (src/FlightControlInputFailures.h): run
// test/run_tests.sh. The ground spoiler checks use the generated A380PrimComputerFctl model as it is, fed as
// FlyByWireInterface::updatePrim feeds it.
//
// Build with -DWITHOUT_THE_FIX to run the same checks with the inputs as before the failures: the checks of the failed parts
// must fail.

#include <cmath>
#include <cstdio>

#include "A380PrimComputerFctl.h"
#include "FlightControlInputFailures.h"

using namespace FlightControlInputFailures;

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

#ifdef WITHOUT_THE_FIX
static SidestickPositions sticksSent(double pitch, double roll, bool, bool) {
  return {pitch, roll, 0, 0};
}
static double pedalOrderSent(double pedal, double trim, bool) {
  return -(pedal + trim / 30);
}
static double steeringSent(double pedal, bool) {
  return -100. * pedal;
}
static bool trimMovesSent(bool sec1Active, bool sec3Active, bool, bool, bool, bool) {
  return sec1Active || sec3Active;
}
static double leverSent(bool armed, double lever, bool) {
  return armed ? -0.05 : lever;
}
static double wheelSpeedSent(double speed, bool) {
  return speed;
}
static bool fcdcArmedSent(bool armed, bool) {
  return armed;
}
static double fcdcLeverSent(double lever, bool) {
  return lever;
}
static double spoilerSent(double command, int, const SpoilerFailures&, const SpoilerFailures&) {
  return command;
}
#else
static SidestickPositions sticksSent(double pitch, double roll, bool captFailed, bool foFailed) {
  return sidestickPositions(pitch, roll, captFailed, foFailed);
}
static double pedalOrderSent(double pedal, double trim, bool failed) {
  return rudderPedalOrder(pedal, trim, failed);
}
static double steeringSent(double pedal, bool failed) {
  return rudderPedalSteeringPercent(pedal, failed);
}
static bool trimMovesSent(bool sec1Active, bool sec3Active, bool sec1Healthy, bool sec3Healthy, bool motor1Failed, bool motor2Failed) {
  return rudderTrimMoves(sec1Active, sec3Active, sec1Healthy, sec3Healthy, motor1Failed, motor2Failed);
}
static double leverSent(bool armed, double lever, bool failed) {
  return primSpeedBrakeLeverPosition(armed, lever, failed);
}
static double wheelSpeedSent(double speed, bool failed) {
  return primWheelSpeed(speed, failed);
}
static bool fcdcArmedSent(bool armed, bool failed) {
  return fcdcGroundSpoilersArmed(armed, failed);
}
static double fcdcLeverSent(double lever, bool failed) {
  return fcdcSpeedBrakeLeverPosition(lever, failed);
}
static double spoilerSent(double command, int index, const SpoilerFailures& own, const SpoilerFailures& other) {
  return spoilerCommand(command, index, own, other);
}
#endif

static void sidesticks() {
  const SidestickPositions normal = sticksSent(0.5, -0.25, false, false);
  expect(normal.captPitch == 0.5 && normal.captRoll == -0.25 && normal.foPitch == 0, "the sim input is the CAPT sidestick");

  const SidestickPositions captFailed = sticksSent(0.5, -0.25, true, false);
  expect(captFailed.captPitch == 0 && captFailed.captRoll == 0, "a failed CAPT sidestick sends nothing");
  expect(captFailed.foPitch == 0.5 && captFailed.foRoll == -0.25, "with the CAPT sidestick failed the input is the F/O one");

  const SidestickPositions bothFailed = sticksSent(0.5, -0.25, true, true);
  expect(bothFailed.captPitch == 0 && bothFailed.foPitch == 0 && bothFailed.foRoll == 0,
         "with both sidesticks failed no order reaches the computers");
}

static void rudderPedals() {
  expect(std::fabs(pedalOrderSent(0.5, 6, false) + 0.7) < 1e-9, "the pedal order is the pedal plus the trim offset");
  expect(pedalOrderSent(0.5, 6, true) == 0, "failed pedal transducers command no rudder and lose the manual trim");
  expect(steeringSent(0.5, false) == -50, "the pedals steer the nose wheel");
  expect(steeringSent(0.5, true) == 0, "failed pedal transducers lose the NWS through the pedals");
}

static void rudderTrim() {
  expect(trimMovesSent(true, false, true, true, false, false), "SEC 1 trims the rudder");
  expect(trimMovesSent(true, false, true, true, true, false), "with motor 1 failed SEC 3 and motor 2 take over");
  expect(trimMovesSent(true, false, true, true, false, true), "with motor 2 failed motor 1 trims");
  expect(!trimMovesSent(true, false, true, true, true, true), "with both motors failed the rudder trim is lost");
  expect(!trimMovesSent(true, false, true, false, true, false), "motor 1 and SEC 3 failed: the rudder trim is lost");
}

static void speedBrakeLever() {
  expect(leverSent(true, 0, false) == -0.05, "the armed lever reaches the PRIMs");
  expect(leverSent(false, 0.6, false) == 0.6, "the lever position reaches the PRIMs");
  expect(leverSent(false, 0.6, true) == 0, "a failed lever commands no speed brakes");
  expect(leverSent(true, 0, true) == 0, "a failed lever does not arm the ground spoilers");
  expect(fcdcArmedSent(true, false) && fcdcLeverSent(0.6, false) == 0.6, "the FCDCs see the lever");
  expect(!fcdcArmedSent(true, true) && fcdcLeverSent(0.6, true) == 0, "the FCDCs lose a failed lever too");
}

static void spoilers() {
  SpoilerFailures left = {};
  SpoilerFailures right = {};
  left[2] = true;  // spoiler 3
  left[4] = true;  // spoiler 5 (EBHA)
  expect(spoilerSent(-20, 2, left, right) == 0, "a failed spoiler retracts");
  expect(spoilerSent(-20, 2, right, left) == 0, "the symmetric spoiler of a failed spoiler is inhibited");
  expect(spoilerSent(-20, 4, right, left) == -20, "spoiler 5 keeps its symmetric spoiler");
  expect(spoilerSent(-20, 3, left, right) == -20, "the other spoilers stay");
}

/// Ground spoilers of the PRIM model during a rejected takeoff from standstill: armed, levers at idle, the wheels from 0 to
/// 100 kt. Returns whether the ground spoilers extended.
static bool groundSpoilersExtendDuringRto(bool wheelSpeedInputsFailed) {
  static A380PrimComputerFctl prim;
  prim.initialize();
  auto& in = prim.A380PrimComputerFctl_U.in;
  in = {};
  in.data.time.dt = 0.05;
  in.data.sim_data.computer_running = true;
  in.general_logic.on_ground = true;
  in.data.analog_inputs.speed_brake_lever_pos = leverSent(true, 0, false);
  bool extended = false;
  for (double t = 0; t < 4; t += 0.05) {
    const double wheelSpeed = wheelSpeedSent(t < 1 ? 0 : 100, wheelSpeedInputsFailed);
    in.data.analog_inputs.left_body_wheel_speed = wheelSpeed;
    in.data.analog_inputs.left_wing_wheel_speed = wheelSpeed;
    in.data.analog_inputs.right_body_wheel_speed = wheelSpeed;
    in.data.analog_inputs.right_wing_wheel_speed = wheelSpeed;
    prim.step();
    extended = extended || prim.A380PrimComputerFctl_Y.out.fctl_logic.ground_spoilers_out;
  }
  return extended;
}

static void groundSpoilers() {
  expect(groundSpoilersExtendDuringRto(false), "the PRIM model extends the ground spoilers above 72 kt");
  expect(!groundSpoilersExtendDuringRto(true), "without the wheel speed inputs the PRIMs cannot extend the ground spoilers");
}

int main() {
  sidesticks();
  rudderPedals();
  rudderTrim();
  speedBrakeLever();
  spoilers();
  groundSpoilers();
  if (failures == 0) {
    std::printf("flight control input failures: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
