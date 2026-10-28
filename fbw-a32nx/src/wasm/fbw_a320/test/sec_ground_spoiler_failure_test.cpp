// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the SEC under the flyPad failures of the speed brake lever transducers and of the ground spoiler
// function: run test/run_tests.sh. With -DWITHOUT_THE_FIX the failure flags of the SEC do nothing and the failure checks
// must fail.

#include <cstdio>

#include "../src/Arinc429Utils.h"
#include "../src/failures/FlightControlFailureInputs.h"
#include "../src/sec/Sec.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;
// A lever pulled back to the armed detent as the sim handle gives it (FlyByWireInterface)
static constexpr double armedLever = -0.05;

static void setFailures(Sec& sec, bool groundFailed, bool leverFailed) {
#ifndef WITHOUT_THE_FIX
  sec.groundSpoilerFunctionFailed = groundFailed;
  sec.speedBrakeLeverTransducersFailed = leverFailed;
#else
  (void)sec;
  (void)groundFailed;
  (void)leverFailed;
#endif
}

static void run(Sec& sec, double seconds) {
  for (double t = 0; t < seconds; t += frameTime) {
    sec.update(frameTime, 0, false, true);
  }
}

static base_arinc_429 lgciuWord(bool allBitsSet) {
  base_arinc_429 word = {};
  word.SSM = Arinc429SignStatus::NormalOperation;
  word.Data = allBitsSet ? 32767.0f : 0.0f;
  return word;
}

static void setAirAndGround(Sec& sec, bool onGround) {
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_2 = lgciuWord(onGround);
  sec.modelInputs.in.bus_inputs.lgciu_2_bus.discrete_word_2 = lgciuWord(onGround);
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_3 = lgciuWord(false);
  sec.modelInputs.in.bus_inputs.lgciu_2_bus.discrete_word_3 = lgciuWord(false);
}

// A SEC in the air with the levers as given, then the touchdown with the wheels spinning
static bool groundSpoilersOutAfterTouchdown(double lever, double thrustLever, bool groundFailed, bool leverFailed) {
  Sec sec(false, false);
  setFailures(sec, groundFailed, leverFailed);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.analog_inputs.spd_brk_lever_pos = lever;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = 25;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = 25;
  setAirAndGround(sec, false);
  run(sec, 40);

  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = thrustLever;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = thrustLever;
  sec.modelInputs.in.analog_inputs.wheel_speed_left = 100;
  sec.modelInputs.in.analog_inputs.wheel_speed_right = 100;
  setAirAndGround(sec, true);
  run(sec, 3);
  return sec.getDiscreteOutputs().ground_spoiler_out;
}

static void healthySecExtendsTheGroundSpoilers() {
  expect(groundSpoilersOutAfterTouchdown(armedLever, 0, false, false), "armed lever and idle: ground spoilers out");
  expect(groundSpoilersOutAfterTouchdown(0, -20, false, false), "reverse selected, lever not armed: ground spoilers out");
}

static void lostGroundSpoilerFunctionExtendsNothing() {
  expect(!groundSpoilersOutAfterTouchdown(armedLever, 0, true, false), "armed lever and idle: no ground spoilers");
  expect(!groundSpoilersOutAfterTouchdown(0, -20, true, false), "reverse selected: no ground spoilers");
  expect(!groundSpoilersOutAfterTouchdown(1, 0, true, false), "speed brake lever fully out at idle: no ground spoilers");
}

static void failedLeverTransducersLoseTheArmingButNotTheReverse() {
  expect(!groundSpoilersOutAfterTouchdown(armedLever, 0, false, true), "lever transducers failed, armed: no ground spoilers");
  expect(groundSpoilersOutAfterTouchdown(armedLever, -20, false, true), "lever transducers failed: reverse still extends them");
}

static double speedBrakeLeverSeenDeg(bool groundFailed, bool leverFailed) {
  Sec sec(false, false);
  setFailures(sec, groundFailed, leverFailed);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.analog_inputs.spd_brk_lever_pos = 1;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = 25;
  sec.modelInputs.in.analog_inputs.thr_lever_2_pos = 25;
  setAirAndGround(sec, false);
  run(sec, 40);
  return sec.getBusOutputs().speed_brake_lever_command_deg.Data;
}

static void speedBrakeLeverIsStillReadWithoutTheGroundFunction() {
  expect(speedBrakeLeverSeenDeg(false, false) > 29, "healthy SEC reads the speed brake lever");
  expect(speedBrakeLeverSeenDeg(true, false) > 29, "the lever is still read with the ground function lost");
  expect(speedBrakeLeverSeenDeg(false, true) < 1, "the lever reads retracted with the transducers failed");
}

static void busWordsTellTheFcdc() {
  Sec sec(false, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  setAirAndGround(sec, false);
  run(sec, 40);
  expect(Arinc429Utils::isNo(sec.getBusOutputs().speed_brake_lever_command_deg), "healthy lever word is valid");
  expect(!Arinc429Utils::bitFromValueOr(sec.getBusOutputs().discrete_status_word_1, 24, false), "no ground spoiler fault bit");

  setFailures(sec, true, true);
  run(sec, 1);
  expect(!Arinc429Utils::isNo(sec.getBusOutputs().speed_brake_lever_command_deg), "failed transducers: lever word invalid");
  expect(Arinc429Utils::bitFromValueOr(sec.getBusOutputs().discrete_status_word_1, 24, false), "lost function: fault bit 24");
  expect(Arinc429Utils::isNo(sec.getBusOutputs().discrete_status_word_1), "the status word stays valid");
}

static void lostGroundFunctionGivesNoReverseSignal() {
  Sec sec(false, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.analog_inputs.thr_lever_1_pos = -20;
  run(sec, 40);
  expect(sec.isThrustReverseSelected(0), "healthy SEC gives the reverse signal");
  setFailures(sec, true, false);
  expect(!sec.isThrustReverseSelected(0), "SEC without the ground function gives no reverse signal");
}

int main() {
  healthySecExtendsTheGroundSpoilers();
  lostGroundSpoilerFunctionExtendsNothing();
  failedLeverTransducersLoseTheArmingButNotTheReverse();
  speedBrakeLeverIsStillReadWithoutTheGroundFunction();
  busWordsTellTheFcdc();
  lostGroundFunctionGivesNoReverseSignal();

  if (failures > 0) {
    std::printf("sec_ground_spoiler_failure_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("sec_ground_spoiler_failure_test: all checks passed\n");
  return 0;
}
