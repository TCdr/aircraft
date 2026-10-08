// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of what the A380X FADEC engine model does with the start sequence of the systems WASM
// (src/Fadec/StartSequence_A380X.hpp): run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the engine starter and start end decisions are the ones the FADEC had before the start
// sequence: the test then fails.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/StartSequence_A380X.hpp"

using namespace StartSequence_A380X;

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

/// The FBW engine starter (EngineControl_A380X::update): the MSFS starter (ENG MASTER) of an engine whose fuel is not cut, or
/// in a relight attempt, or (with the fix) in a start the start sequence keeps going while it cuts the fuel.
static bool engineStarter(bool masterStarter, bool fuelCut, bool relightAttempt, bool onGround, int startPhase) {
#ifdef WITHOUT_THE_FIX
  (void)onGround;
  (void)startPhase;
  return masterStarter && (!fuelCut || relightAttempt);
#else
  return masterStarter && (!fuelCut || relightAttempt || startSequenceKeepsStarter(onGround, fuelCut, startPhase));
#endif
}

static bool reachesIdle(bool starter, double simN3, double idleN3, bool n3Hang) {
#ifdef WITHOUT_THE_FIX
  (void)n3Hang;
  return starter && simN3 >= (idleN3 - 0.1);
#else
  return startReachesIdle(starter, simN3, idleN3, n3Hang);
#endif
}

/// The ENG MASTER as the engine model sees it: before the fix, the MSFS starter alone.
static bool masterOn(bool simStarter, bool starterMotoring, int startPhase) {
#ifdef WITHOUT_THE_FIX
  (void)starterMotoring;
  (void)startPhase;
  return simStarter;
#else
  return engineMasterOn(simStarter, startSequenceCranks(starterMotoring, startPhase));
#endif
}

/// The OFF engine state becomes ON (EngineControl_A380X::engineStateMachine): before the fix without the MSFS combustion.
static bool offIsRunning(int engineIgniter, bool engineStarter, double simN3, bool simCombustion) {
#ifdef WITHOUT_THE_FIX
  (void)simCombustion;
  return engineIgniter == 1 && engineStarter && simN3 > 20;
#else
  return offEngineIsRunning(engineIgniter, engineStarter, simN3, simCombustion);
#endif
}

int main() {
  // A dry crank with the ENG MASTER OFF: the cockpit XML engages the MSFS starter, which is no ENG MASTER ON (the engine model
  // must not start or show fuel)
  expect("dry crank is no master ON", !masterOn(true, true, MOTORING));
  expect("start valve stuck open with the master OFF is no master ON", !masterOn(true, true, NONE));
  // ...but the master ON of a start, a crank of a start or an unlit start is
  expect("master ON of a start", masterOn(true, true, STARTING));
  expect("master ON of an automatic crank", masterOn(true, true, AUTOMATIC_CRANK));
  expect("master ON, nothing motored", masterOn(true, false, NONE));
  expect("master OFF", !masterOn(false, false, NONE));

  // A ground start not lit up yet (igniter failure): the fuel is cut, the start goes on
  expect("unlit ground start keeps the starter", engineStarter(true, true, false, true, STARTING));
  expect("automatic dry crank keeps the starter", engineStarter(true, true, false, true, AUTOMATIC_CRANK));
  expect("wet crank keeps the starter", engineStarter(true, true, false, true, WET_CRANK));
  // ...but not an aborted start, a starved engine or one in flight
  expect("aborted start releases the starter", !engineStarter(true, true, false, true, ABORTED));
  expect("starved engine releases the starter", !engineStarter(true, true, false, true, NONE));
  expect("in flight the start sequence does not keep the starter", !engineStarter(true, true, false, false, STARTING));
  expect("ENG MASTER OFF releases the starter", !engineStarter(false, true, false, true, STARTING));
  expect("normal running engine", engineStarter(true, false, false, true, NONE));

  // An OFF engine is ON only when MSFS burns in it (sim test 2026-10-07: a cold engine at NORM whose MSFS starter, which
  // follows the ENG MASTER lever, turned the core past 20 % showed ON unlit, and the auto relight selected igniters A + B)
  expect("an unlit core turned past 20 % at NORM is not running", !offIsRunning(1, true, 25.0, false));
  expect("an engine running at the load of a flight is running (ground or air)", offIsRunning(1, true, 63.0, true));
  expect("a core below 20 % is not running", !offIsRunning(1, true, 15.0, true));
  expect("ENG START at IGN/START is a start, not a running engine", !offIsRunning(2, true, 63.0, true));
  expect("ENG MASTER OFF is not running", !offIsRunning(1, false, 63.0, true));

  // A hung start does not end at idle
  expect("a hung start does not reach idle", !reachesIdle(true, 62.0, 62.0, true));
  expect("a normal start reaches idle", reachesIdle(true, 62.0, 62.0, false));

  // A core without starter air during such a start is brought to rest
  expect("no starter air: core held at rest", coreHeldAtRest(true, false));
  expect("starter air: core turns", !coreHeldAtRest(true, true));
  expect("not a start of the sequence: MSFS alone", !coreHeldAtRest(false, false));
  expectNear("resting core runs down", restingCoreCorrectedN3(20.0, 1.0), 10.0);

  // The indications
  expectNear("unlit N3 follows the motoring speed down", unlitStartN3(40.0, 20.0, 1.0), 30.0);
  expectNear("hung start N3 at 60 % of idle", hungStartN3(55.0, 62.0, true), 37.2);
  expectNear("hot start EGT excess grows", egtOvershoot(30.0, true, 0.5), 45.0);
  expectNear("no overshoot: no excess", egtOvershoot(30.0, false, 0.5), 0.0);

  if (failures > 0) {
    std::printf("%d failure(s)\n", failures);
    return 1;
  }
  std::printf("start_sequence_test: all passed\n");
  return 0;
}
