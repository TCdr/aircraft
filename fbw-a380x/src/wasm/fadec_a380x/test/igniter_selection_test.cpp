// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the igniters the FADEC energizes, for the SD ENGINE page ignition indication
// (src/Fadec/IgniterSelection_A380X.hpp): run test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/IgniterSelection_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

using Igniters = IgniterSelection_A380X::Igniters;

static bool is(const Igniters& igniters, bool a, bool b) {
  return igniters.a == a && igniters.b == b;
}

/// One engine as the FADEC sees it each frame; defaults: a running engine on the ground, master ON, selector NORM.
struct EngineConditions {
  bool   simOnGround       = true;
  bool   running           = true;
  bool   starting          = false;
  bool   masterOn          = true;
  bool   firePbReleased    = false;
  bool   ignStartSelected  = false;
  bool   fadecBothIgniters = false;
  // the ground start sequence of the systems WASM: START_PHASE not 0, IGNITERS bit 0 A, bit 1 B
  bool   startSequenceActive   = false;
  int    startSequenceIgniters = 0;
  double n3                    = 62.0;
  double n1                    = 20.0;
};

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

static IgniterSelection_A380X::Inputs inputsOf(const EngineConditions& c) {
  return {c.simOnGround,
          c.running,
          c.starting,
          c.masterOn,
          c.firePbReleased,
          c.ignStartSelected,
          c.fadecBothIgniters,
          c.startSequenceActive,
          c.startSequenceIgniters,
          c.n3,
          c.n1,
          FRAME_SECONDS};
}

/// Runs the FADEC for this time with constant conditions; returns the igniters of the last frame.
static Igniters run(IgniterSelection_A380X& selection, const EngineConditions& conditions, double seconds) {
  Igniters igniters{false, false};
  for (double elapsed = 0.0; elapsed < seconds - 1e-9; elapsed += FRAME_SECONDS) {
    igniters = selection.update(inputsOf(conditions));
  }
  return igniters;
}

/// One automatic start on the ground with the selector at IGN START, the start sequence of the systems WASM energizing
/// igniter A from 20 % to 58 % N3, then the engine runs.
static void groundStart(IgniterSelection_A380X& selection) {
  EngineConditions c;
  c.running             = false;
  c.starting            = true;
  c.ignStartSelected    = true;
  c.startSequenceActive = true;
  c.n3                  = 10.0;
  run(selection, c, 1.0);
  c.n3                    = 30.0;
  c.startSequenceIgniters = 1;
  run(selection, c, 1.0);
  c.n3                    = 60.0;
  c.startSequenceIgniters = 0;
  run(selection, c, 1.0);
  c.starting            = false;
  c.running             = true;
  c.startSequenceActive = false;
  run(selection, c, 1.0);
}

// The ground start shows the igniters of the start sequence of the systems WASM (one source of truth with the igniter
// failures): none, A, B (the start sequence alternates them) or A + B (new automatic attempt), whatever the N3
static void testGroundStartFollowsTheStartSequence() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.running             = false;
  c.starting            = true;
  c.startSequenceActive = true;
  c.n3                  = 30.0;
  expect(is(run(selection, c, 1.0), false, false), "ground start: no igniter while the start sequence energizes none");
  c.startSequenceIgniters = 1;
  expect(is(run(selection, c, 1.0), true, false), "ground start: igniter A of the start sequence");
  c.startSequenceIgniters = 2;
  expect(is(run(selection, c, 1.0), false, true), "ground start: igniter B of the start sequence");
  c.startSequenceIgniters = 3;
  c.n3                    = 10.0;
  expect(is(run(selection, c, 1.0), true, true), "ground start: A + B of a new automatic attempt");
  // between two automatic attempts the FBW engine state is no longer STARTING but the start sequence still runs
  c.starting              = false;
  c.startSequenceIgniters = 0;
  expect(is(run(selection, c, 1.0), false, false), "automatic dry crank: no igniter");
  c.startSequenceIgniters = 3;
  expect(is(run(selection, c, 1.0), true, true), "start sequence running, FBW state not STARTING: still its igniters");
}

// The start sequence igniters still obey the FADEC supply and the ENG MASTER, and the auto relight selects both
static void testGroundStartIgnitersInhibitionsAndAutoRelight() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.running               = false;
  c.starting              = true;
  c.startSequenceActive   = true;
  c.startSequenceIgniters = 1;
  c.masterOn              = false;
  expect(is(run(selection, c, 1.0), false, false), "ground start, ENG MASTER OFF: no igniter");
  c.masterOn       = true;
  c.firePbReleased = true;
  expect(is(run(selection, c, 1.0), false, false), "ground start, ENG FIRE pb released: no igniter");
  c.firePbReleased    = false;
  c.fadecBothIgniters = true;
  expect(is(run(selection, c, 1.0), true, true), "auto relight on the ground: A + B over the start sequence igniter");
}

// In flight the start sequence of the systems WASM does not run: an in-flight start shows A + B (below)
static void testInFlightIgnoresTheGroundStartSequence() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.simOnGround           = false;
  c.startSequenceActive   = true;
  c.startSequenceIgniters = 1;
  expect(is(run(selection, c, 1.0), false, false), "in flight, engine running at NORM: no igniter");
}

// FCOM DSC-70-80-20: in flight "Both igniters are selected, when ENG MASTER lever is set to ON", at any N2
static void testInFlightStartUsesBothIgniters() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.simOnGround = false;
  c.running     = false;
  c.starting    = true;
  c.n3          = 8.0;
  expect(is(run(selection, c, 1.0), true, true), "in-flight start: A + B at 8 % N3");
  c.n3 = 60.0;
  expect(is(run(selection, c, 1.0), true, true), "in-flight start: A + B until the engine runs");
  c.starting = false;
  c.running  = true;
  expect(is(run(selection, c, 1.0), false, false), "in-flight start: off when AVAIL appears (selector NORM)");
}

// Auto relight / in-flight relight (EngineIgnition_A380X): both igniters, but none without FADEC supply or master
static void testFadecBothIgnitersAndInhibitions() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.simOnGround       = false;
  c.fadecBothIgniters = true;
  expect(is(run(selection, c, 1.0), true, true), "auto relight: A + B at NORM");
  c.firePbReleased = true;
  expect(is(run(selection, c, 1.0), false, false), "ENG FIRE pb released: FADEC not supplied, no igniter");
  c.firePbReleased = false;
  c.masterOn       = false;
  expect(is(run(selection, c, 1.0), false, false), "ENG MASTER OFF stops the ignition");
}

// FCOM DSC-70-80-20 continuous ignition: in flight at once with IGN START and the engine running
static void testContinuousIgnitionInFlight() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.simOnGround = false;
  expect(is(run(selection, c, 1.0), false, false), "in flight NORM: no igniter");
  c.ignStartSelected = true;
  expect(is(run(selection, c, 1.0), true, true), "in flight IGN START: continuous ignition A + B");
}

// FCOM DSC-70-80-20: on the ground the selector must go to NORM then back to IGN START after the start, and the engine
// must not be at low power (N1 below 53 % for more than 30 s)
static void testContinuousIgnitionOnGround() {
  IgniterSelection_A380X selection;
  groundStart(selection);
  EngineConditions c;
  c.ignStartSelected = true;
  c.n1               = 60.0;
  expect(is(run(selection, c, 5.0), false, false), "ground: IGN START left after the start: igniters stopped");
  c.ignStartSelected = false;
  run(selection, c, 1.0);
  c.ignStartSelected = true;
  expect(is(run(selection, c, 1.0), true, true), "ground: NORM then IGN START: continuous ignition A + B");
  c.n1 = 30.0;
  expect(is(run(selection, c, 29.0), true, true), "ground: N1 below 53 % for 29 s: still on");
  expect(is(run(selection, c, 2.0), false, false), "ground: N1 below 53 % for more than 30 s: low power, off");
  c.n1 = 60.0;
  expect(is(run(selection, c, 1.0), true, true), "ground: above low power again: on");
}

// FCOM DSC-70-80-20 quick relight: master OFF then ON within 30 s, engine running, N2 above 45 %: A + B for 60 s
static void testQuickRelight() {
  IgniterSelection_A380X selection;
  EngineConditions       c;
  c.simOnGround = false;
  c.n3          = 60.0;
  run(selection, c, 1.0);
  c.masterOn = false;
  c.running  = false;  // FBW state SHUTTING
  expect(is(run(selection, c, 5.0), false, false), "quick relight: no igniter while the master is OFF");
  c.masterOn = true;
  c.starting = true;  // FBW state RESTARTING, then ON
  run(selection, c, 2.0);
  c.starting = false;
  c.running  = true;
  expect(is(run(selection, c, 57.0), true, true), "quick relight: A + B 59 s after the master ON at NORM");
  expect(is(run(selection, c, 2.0), false, false), "quick relight: off 61 s after the master ON");

  IgniterSelection_A380X slowCycle;
  c = EngineConditions{};
  c.simOnGround = false;
  c.n3          = 60.0;
  run(slowCycle, c, 1.0);
  c.masterOn = false;
  c.running  = false;
  run(slowCycle, c, 31.0);
  c.masterOn = true;
  c.running  = true;
  expect(is(run(slowCycle, c, 1.0), false, false), "no quick relight after more than 30 s with the master OFF");

  IgniterSelection_A380X lowN3;
  c = EngineConditions{};
  c.simOnGround = false;
  c.n3          = 60.0;
  run(lowN3, c, 1.0);
  c.masterOn = false;
  c.running  = false;
  c.n3       = 40.0;
  run(lowN3, c, 5.0);
  c.masterOn = true;
  c.running  = true;
  expect(is(run(lowN3, c, 1.0), false, false), "no quick relight below 45 % N2");
}

int main() {
  testGroundStartFollowsTheStartSequence();
  testGroundStartIgnitersInhibitionsAndAutoRelight();
  testInFlightIgnoresTheGroundStartSequence();
  testInFlightStartUsesBothIgniters();
  testFadecBothIgnitersAndInhibitions();
  testContinuousIgnitionInFlight();
  testContinuousIgnitionOnGround();
  testQuickRelight();

  if (failures > 0) {
    std::printf("igniter_selection_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("igniter_selection_test: all passed\n");
  return 0;
}
