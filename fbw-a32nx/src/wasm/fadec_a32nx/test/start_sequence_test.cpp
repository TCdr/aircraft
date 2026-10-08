// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of what the A32NX FADEC engine model does with the start sequence of the systems WASM
// (src/Fadec/StartSequence_A32NX.hpp): run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the starter and engine state decisions are the ones the FADEC had before the start sequence:
// the test then fails.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/StartSequence_A32NX.hpp"

using namespace StartSequence_A32NX;

static int failures = 0;

static void expect(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static void expectNear(const char* what, double value, double expected) {
  if (std::fabs(value - expected) > 1e-6) {
    std::printf("FAIL %s: %f, expected %f\n", what, value, expected);
    ++failures;
  }
}

#ifdef WITHOUT_THE_FIX
// The decisions of EngineControlA32NX.cpp before the start sequence (develop 2e1fc442a)
static StarterCommand starterDecision(const StarterInputs& in) {
  if (!in.starterHeld && in.fuelValveFullyOpen && (in.starterPressurized || in.simN2 >= 20 || in.inFlightRelight)) {
    return StarterCommand::ENGAGE;
  }
  if (in.starterHeld &&
      (in.fuelValveFullyClosed || (in.fuelValveFullyOpen && !in.starterPressurized && in.simN2 < 20 && !in.inFlightRelight))) {
    return StarterCommand::RELEASE;
  }
  return StarterCommand::NONE;
}
static bool offIsRunning(int engineIgniter, bool engineStarter, double simN2, bool, bool) {
  return engineIgniter == 1 && engineStarter && simN2 > 20;
}
static bool reachesIdle(bool engineStarter, double simN2, double idleN2, bool) {
  return engineStarter && simN2 >= (idleN2 - 0.1);
}
#else
static StarterCommand starterDecision(const StarterInputs& in) {
  return starterCommand(in);
}
static bool offIsRunning(int engineIgniter, bool engineStarter, double simN2, bool starterMotoring, bool simCombustion) {
  return offEngineIsRunning(engineIgniter, engineStarter, simN2, starterMotoring, simCombustion);
}
static bool reachesIdle(bool engineStarter, double simN2, double idleN2, bool n2Hang) {
  return startReachesIdle(engineStarter, simN2, idleN2, n2Hang);
}
#endif

/// The inputs of a normal automatic start on the ground once lit: master ON, fuel, starter air
static StarterInputs normalStart() {
  StarterInputs in{};
  in.starterHeld          = true;
  in.fuelValveFullyOpen   = true;
  in.fuelValveFullyClosed = false;
  in.starterPressurized   = true;
  in.simN2                = 30.0;
  return in;
}

int main() {
  // A normal start: unchanged
  {
    StarterInputs in = normalStart();
    in.starterHeld   = false;
    expect("normal start engages the starter", starterDecision(in) == StarterCommand::ENGAGE);
    in = normalStart();
    expect("normal start keeps the starter", starterDecision(in) == StarterCommand::NONE);
    in                      = normalStart();
    in.fuelValveFullyOpen   = false;
    in.fuelValveFullyClosed = true;
    expect("ENG MASTER OFF releases the starter", starterDecision(in) == StarterCommand::RELEASE);
  }

  // A start attempt not lit up yet (igniter failure): the systems WASM cuts the fuel and motors the core
  {
    StarterInputs in        = normalStart();
    in.fuelValveFullyOpen   = false;
    in.fuelValveFullyClosed = true;
    in.starterMotoring      = true;
    expect("unlit start keeps the starter engaged", starterDecision(in) == StarterCommand::NONE);
    in.starterHeld = false;
    in.simN2       = 0.0;
    expect("unlit start engages the starter", starterDecision(in) == StarterCommand::ENGAGE);
  }

  // Dry crank (ENG MODE CRANK, MAN START ON, ENG MASTER OFF)
  {
    StarterInputs in{};
    in.fuelValveFullyClosed = true;
    in.starterPressurized   = true;
    in.starterMotoring      = true;
    expect("dry crank engages the starter with the master OFF", starterDecision(in) == StarterCommand::ENGAGE);
    in.starterHeld = true;
    in.simN2       = 25.0;
    expect("dry crank keeps the starter with the master OFF", starterDecision(in) == StarterCommand::NONE);
    in.starterMotoring = false;
    expect("end of the dry crank releases the starter", starterDecision(in) == StarterCommand::RELEASE);
  }

  // Starter failure: the air does not turn the engine
  {
    StarterInputs in      = normalStart();
    in.starterHeld        = false;
    in.simN2              = 0.0;
    in.starterFailed      = true;
    expect("a failed starter is not engaged", starterDecision(in) != StarterCommand::ENGAGE);
    in.starterHeld = true;
    expect("a failed starter is released below 20 % N2", starterDecision(in) == StarterCommand::RELEASE);
  }

  // The engine states
  expect("a motored core at NORM is not running", !offIsRunning(1, true, 25.0, true, false));
  expect("an engine burning above 20 % at NORM is running", offIsRunning(1, true, 25.0, false, true));
  // A cold engine whose MSFS starter turns the core past 20 % at NORM without combustion is not running (sim test 2026-10-07
  // on the A380X); an engine running at the load of a flight (MSFS burning, on the ground or in the air) is.
  expect("an unlit core turned past 20 % by the MSFS starter at NORM is not running", !offIsRunning(1, true, 25.0, false, false));
  expect("an engine running at the load of a flight is running", offIsRunning(1, true, 68.0, false, true));
  expect("ENG MODE at IGN/START is a start, not a running engine", !offIsRunning(2, true, 68.0, false, true));
  expect("a hung start does not reach idle", !reachesIdle(true, 68.0, 68.0, true));
  expect("a normal start reaches idle", reachesIdle(true, 68.0, 68.0, false));

  // The indications of a core turning without combustion
  expectNear("unlit N2 follows the motoring speed down", unlitStartN2(40.0, 30.0, 1.0), 35.0);
  expectNear("unlit N2 reaches the motoring speed", unlitStartN2(40.0, 30.0, 5.0), 30.0);
  expect("no fuel flow below the HP valve opening", !fuelFlowsWithoutLightUp(STARTING, 20.0));
  expect("fuel flow (unburnt) with the HP valve open", fuelFlowsWithoutLightUp(STARTING, 25.0));
  expect("no fuel flow in the automatic crank", !fuelFlowsWithoutLightUp(AUTOMATIC_CRANK, 25.0));
  expect("fuel flow in a wet crank", fuelFlowsWithoutLightUp(WET_CRANK, 25.0));

  // Hung start and hot start
  expectNear("hung start N2 at 60 % of idle", hungStartN2(55.0, 68.0, true), 40.8);
  expectNear("no hang: N2 unchanged", hungStartN2(55.0, 68.0, false), 55.0);
  expectNear("hot start EGT excess grows", egtOvershoot(30.0, true, 0.5), 45.0);
  expectNear("no overshoot: no excess", egtOvershoot(30.0, false, 0.5), 0.0);

  if (failures > 0) {
    std::printf("%d failure(s)\n", failures);
    return 1;
  }
  std::printf("start_sequence_test: all passed\n");
  return 0;
}
