// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the guard against the jump of the MSFS core speed at the end of an MSFS start
// (src/Fadec/CoreSpikeGuard_A380X.hpp): run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the FADEC uses the MSFS speeds as before the guard: the test then fails.

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "../src/Fadec/CoreSpikeGuard_A380X.hpp"
#include "../src/Fadec/StartSequence_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

// FBW engine states (A32NX_ENGINE_STATE)
enum FbwEngineState { OFF = 0, ON = 1, STARTING = 2, RESTARTING = 3, SHUTTING = 4 };

/// The FADEC side of one engine: the guard, as EngineControl_A380X uses it.
class GuardedEngine {
 public:
  CoreSpikeGuard_A380X::Output update(double simN3, double simN1, bool engineStarting, double idleN3, double idleN1, double deltaTime) {
#ifdef WITHOUT_THE_FIX
    (void)engineStarting;
    (void)idleN3;
    (void)idleN1;
    (void)deltaTime;
    return {simN3, simN1};
#else
    return guard.update({simN3, simN1, engineStarting, idleN3, idleN1, deltaTime});
#endif
  }

 private:
  CoreSpikeGuard_A380X guard{};
};

/// The MSFS core of the recorded jumps: about 1 %/s in the MSFS start, a first-order rise (0.1 s) to the top of the
/// corrected_n2_from_ff_table, a plateau, then a run down to the speed of the throttle.
static double syntheticJumpN3(double t, double startEnd, double top, double plateauSeconds, double settled) {
  if (t < 0.0) {
    return startEnd + t * 1.0;
  }
  if (t < plateauSeconds) {
    return startEnd + (top - startEnd) * (1.0 - std::exp(-t / 0.1));
  }
  return settled + (top - settled) * std::exp(-(t - plateauSeconds) / 2.0);
}

// ---------------------------------------------------------------------------------------------------------------------
// A normal acceleration is never limited
// ---------------------------------------------------------------------------------------------------------------------

static void testNormalAccelerationNotLimited() {
  // idle to climb in flight: 11 %/s (A380X, sim test 2026-10-06 s6_main1.log 518-526 s) and 15 %/s (A32NX S1 T1), at several
  // frame rates; N1 rises along at twice the rate
  for (const double ratePerSecond : {5.0, 11.0, 15.0, 25.0}) {
    for (const double frameSeconds : {1.0 / 60.0, 1.0 / 30.0, 1.0 / 15.0}) {
      GuardedEngine engine;
      bool          limited = false;
      double        n3      = 60.0;
      double        n1      = 24.0;
      for (double t = 0.0; t < 6.0; t += frameSeconds) {
        n3                                        = (std::min)(95.0, n3 + ratePerSecond * frameSeconds);
        n1                                        = (std::min)(95.0, n1 + 2.0 * ratePerSecond * frameSeconds);
        const CoreSpikeGuard_A380X::Output output = engine.update(n3, n1, false, 62.0, 25.8, frameSeconds);
        limited |= output.n3 != n3 || output.n1 != n1;
      }
      char what[160];
      std::snprintf(what, sizeof(what), "a normal acceleration at %.0f %%/s (frames of %.3f s) is not limited", ratePerSecond,
                    frameSeconds);
      expect(!limited, what);
    }
  }

  // the end of a normal MSFS start (about 1 %/s) and a deceleration are not limited either
  GuardedEngine engine;
  bool          limited = false;
  for (double t = 0.0; t < 20.0; t += FRAME_SECONDS) {
    const double n3                                = t < 10.0 ? 50.0 + t : 60.0 - 2.0 * (t - 10.0);
    const CoreSpikeGuard_A380X::Output output = engine.update(n3, n3 / 3.0, true, 62.0, 25.8, FRAME_SECONDS);
    limited |= output.n3 != n3;
  }
  expect(!limited, "the MSFS start and a deceleration are not limited");
}

// ---------------------------------------------------------------------------------------------------------------------
// The jump is filtered
// ---------------------------------------------------------------------------------------------------------------------

static void testJumpAtTheEndOfAStartFiltered() {
  // a start that ends (RESTARTING): the MSFS core jumps from 58.1 to 96.9 %, stays 2 s, runs down to 60 %; the MSFS N1 follows
  // with its lag (engines.cfg n1_normal_tc = 0.5 s) from 23 to 96 %
  const double  idleN3 = 62.0;
  const double  idleN1 = 25.8;
  GuardedEngine engine;
  double        simN1    = 23.0;
  double        maxN3    = 0.0;
  double        maxN1    = 0.0;
  double        idleTime = -1.0;
  bool          aboveSim = false;
  for (double t = -3.0; t < 15.0; t += FRAME_SECONDS) {
    const double simN3    = syntheticJumpN3(t, 58.1, 96.9, 2.0, 60.0);
    const double n1Target = t < 0.0 ? 23.0 : 23.0 + (simN3 - 58.1) * (96.0 - 23.0) / (96.9 - 58.1);
    simN1 += (n1Target - simN1) * FRAME_SECONDS / 0.5;
    const CoreSpikeGuard_A380X::Output output = engine.update(simN3, simN1, idleTime < 0.0, idleN3, idleN1, FRAME_SECONDS);
    if (t >= 0.0) {
      maxN3 = (std::max)(maxN3, output.n3);
      maxN1 = (std::max)(maxN1, output.n1);
    }
    if (idleTime < 0.0 && StartSequence_A380X::startReachesIdle(true, output.n3, idleN3, false)) {
      idleTime = t;
    }
    aboveSim |= output.n3 > simN3 + 1e-9 || output.n1 > simN1 + 1e-9;
  }
  char what[160];
  std::snprintf(what, sizeof(what), "end of a start: the guarded N3 stays at the FBW idle (max %.1f %%)", maxN3);
  expect(maxN3 <= idleN3 + 1e-9, what);
  // MSFS settles at 26.6 % N1, a little above the FBW idle N1: the guarded N1 joins it once MSFS has settled (falls less than
  // SETTLED_MAX_FALL_PERCENT per second), a little before the MSFS N1 has reached its final value
  std::snprintf(what, sizeof(what), "end of a start: the guarded N1 stays at the FBW idle N1 or the settled MSFS N1 (max %.1f %%)",
                maxN1);
  expect(maxN1 <= (std::max)(idleN1, simN1) + 2.0 * CoreSpikeGuard_A380X::SETTLED_MAX_FALL_PERCENT, what);
  std::snprintf(what, sizeof(what), "end of a start: the FBW start ends at idle within 1.5 s of the jump (at %.2f s)", idleTime);
  expect(idleTime >= 0.0 && idleTime <= 1.5, what);
  expect(!aboveSim, "end of a start: the guarded speeds are never above the MSFS speeds");
}

static void testJumpOfARunningEngineFiltered() {
  // auto relight, engine ON with the throttle in CL: the MSFS core jumps from 58.2 to 97 %, stays 6 s, settles at 83 %
  GuardedEngine engine;
  double        maxN3      = 0.0;
  double        maxRise    = 0.0;
  double        previousN3 = 0.0;
  double        lastOutput = 0.0;
  double        lastSim    = 0.0;
  for (double t = -3.0; t < 20.0; t += FRAME_SECONDS) {
    const double                       simN3  = syntheticJumpN3(t, 58.2, 97.0, 6.0, 83.0);
    const CoreSpikeGuard_A380X::Output output = engine.update(simN3, 0.0, false, 62.0, 25.8, FRAME_SECONDS);
    if (t >= 0.0) {
      maxN3   = (std::max)(maxN3, output.n3);
      maxRise = (std::max)(maxRise, (output.n3 - previousN3) / FRAME_SECONDS);
    }
    previousN3 = output.n3;
    lastOutput = output.n3;
    lastSim    = simN3;
  }
  char what[160];
  std::snprintf(what, sizeof(what), "running engine: the guarded N3 rises at most at the acceleration rate (%.1f %%/s)", maxRise);
  expect(maxRise <= CoreSpikeGuard_A380X::N3_ACCELERATION_PERCENT_PER_SECOND + 1e-6, what);
  std::snprintf(what, sizeof(what), "running engine: no spike (max %.1f %%)", maxN3);
  expect(maxN3 <= 86.0, what);
  expect(std::fabs(lastOutput - lastSim) < 1e-9, "running engine: the MSFS N3 is used again once it has settled");
}

// ---------------------------------------------------------------------------------------------------------------------
// What is not a jump, and the way out of a jump
// ---------------------------------------------------------------------------------------------------------------------

static void testNotAJump() {
  // a flight load or a slew sets the core from rest (or from a windmill) to a running speed in one frame: not filtered
  for (const double from : {0.0, 25.0, 40.0}) {
    GuardedEngine engine;
    engine.update(from, from / 3.0, false, 62.0, 25.8, FRAME_SECONDS);
    const CoreSpikeGuard_A380X::Output output = engine.update(92.0, 80.0, false, 62.0, 25.8, FRAME_SECONDS);
    char                               what[120];
    std::snprintf(what, sizeof(what), "a jump from %.0f %% (flight load, slew) is not filtered", from);
    expect(output.n3 == 92.0 && output.n1 == 80.0, what);
  }
}

static void testEngineLostDuringTheJump() {
  // the engine flames out or is shut down during the jump: the guarded speed follows the MSFS speed down at once
  GuardedEngine engine;
  for (double t = -1.0; t < 1.0; t += FRAME_SECONDS) {
    engine.update(syntheticJumpN3(t, 58.1, 96.9, 2.0, 60.0), 23.0, true, 62.0, 25.8, FRAME_SECONDS);
  }
  const CoreSpikeGuard_A380X::Output output = engine.update(30.0, 10.0, true, 62.0, 25.8, FRAME_SECONDS);
  expect(output.n3 == 30.0 && output.n1 == 10.0, "the guarded speeds follow MSFS down at once (engine lost during the jump)");
  const CoreSpikeGuard_A380X::Output next = engine.update(31.0, 10.5, true, 62.0, 25.8, FRAME_SECONDS);
  expect(next.n3 == 31.0 && next.n1 == 10.5, "the jump is over once MSFS is below the guarded speed");
}

static void testMsfsSettlesAboveTheFbwIdle() {
  // MSFS settles above the FBW idle (66 against 62 %): the guarded N3 joins it once MSFS has settled, at the acceleration rate
  GuardedEngine engine;
  double        joinedAt = -1.0;
  for (double t = -1.0; t < 20.0; t += FRAME_SECONDS) {
    const double                       simN3  = syntheticJumpN3(t, 58.1, 96.9, 2.0, 66.0);
    const CoreSpikeGuard_A380X::Output output = engine.update(simN3, 25.0, true, 62.0, 25.8, FRAME_SECONDS);
    if (joinedAt < 0.0 && t > 0.0 && output.n3 == simN3) {
      joinedAt = t;
    }
  }
  char what[120];
  std::snprintf(what, sizeof(what), "MSFS settled above the FBW idle: the guarded N3 joins it (at %.1f s)", joinedAt);
  expect(joinedAt > 0.0 && joinedAt < 12.0, what);
}

static void testMsfsStaysSaturated() {
  // MSFS never leaves its saturation: after MAX_FILTER_SECONDS the guarded N3 rises to it at the acceleration rate
  GuardedEngine engine;
  engine.update(58.0, 23.0, true, 62.0, 25.8, FRAME_SECONDS);
  double joinedAt = -1.0;
  for (double t = 0.0; t < 40.0; t += FRAME_SECONDS) {
    const CoreSpikeGuard_A380X::Output output = engine.update(97.0, 96.0, true, 62.0, 25.8, FRAME_SECONDS);
    if (joinedAt < 0.0 && output.n3 == 97.0) {
      joinedAt = t;
    }
  }
  const double expected =
      CoreSpikeGuard_A380X::MAX_FILTER_SECONDS + (97.0 - 62.0) / CoreSpikeGuard_A380X::N3_ACCELERATION_PERCENT_PER_SECOND;
  char what[140];
  std::snprintf(what, sizeof(what), "MSFS stays saturated: the guarded N3 joins it after the longest hold (at %.1f s, expected %.1f s)",
                joinedAt, expected);
  expect(joinedAt > 0.0 && std::fabs(joinedAt - expected) < 0.5, what);
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay of the recorded jumps
// ---------------------------------------------------------------------------------------------------------------------

struct CoreSample {
  double t;      // recording clock, seconds
  int    state;  // A32NX_ENGINE_STATE as recorded
  double simN3;  // TURB ENG N2 of the relit engine, percent
};

#include "core_spike_replay_2026_10_06.inc"

struct ReplayCase {
  const char*       name;
  const CoreSample* samples;
  int               count;
  double            idleN3;            // the FBW idle N3 of the flight conditions, percent (see below)
  double            normalAccelStart;  // the recorded time from which MSFS accelerates normally (throttle rising), s
  double            maxN3;             // the highest guarded N3 allowed after the jump, percent
};

/**
 * Replays one recording frame by frame (30 frames per second, linear between the samples). The FBW state is the recorded one up to
 * the jump; from then on it follows the guarded N3 as the FADEC state machine does (StartSequence_A380X::startReachesIdle): the
 * recorded state went ON because of the jump itself.
 */
static void replay(const ReplayCase& replayCase) {
  GuardedEngine engine;
  int           state        = replayCase.samples[0].state;
  double        maxAfterJump = 0.0;
  double        jumpTime     = -1.0;
  double        idleTime     = -1.0;
  bool          aboveSim     = false;
  bool          accelLimited = false;
  double        previousSim  = replayCase.samples[0].simN3;
  for (int i = 0; i + 1 < replayCase.count; i++) {
    const CoreSample& from = replayCase.samples[i];
    const CoreSample& to   = replayCase.samples[i + 1];
    for (double t = from.t; t < to.t - 1e-9; t += FRAME_SECONDS) {
      const double simN3          = from.simN3 + (to.simN3 - from.simN3) * (t - from.t) / (to.t - from.t);
      const bool   engineStarting = state == STARTING || state == RESTARTING;
      const CoreSpikeGuard_A380X::Output output =
          engine.update(simN3, simN3 / 3.0, engineStarting, replayCase.idleN3, 25.8, FRAME_SECONDS);

      if (jumpTime < 0.0 && (simN3 - previousSim) / FRAME_SECONDS > 40.0) {
        jumpTime = t;
      }
      previousSim = simN3;
      if (jumpTime < 0.0) {
        state = from.state;
      } else if (engineStarting && StartSequence_A380X::startReachesIdle(true, output.n3, replayCase.idleN3, false)) {
        state    = ON;
        idleTime = t;
      }
      if (jumpTime >= 0.0 && t < replayCase.normalAccelStart) {
        maxAfterJump = (std::max)(maxAfterJump, output.n3);
      }
      aboveSim |= output.n3 > simN3 + 1e-9;
      if (t >= replayCase.normalAccelStart) {
        accelLimited |= output.n3 != simN3;
      }
    }
  }

  char what[200];
  std::snprintf(what, sizeof(what), "replay %s: the MSFS jump is in the recording (at %.1f s)", replayCase.name, jumpTime);
  expect(jumpTime > 0.0, what);
  std::snprintf(what, sizeof(what), "replay %s: no N3 spike after the jump (max %.1f %%, allowed %.1f %%)", replayCase.name, maxAfterJump,
                replayCase.maxN3);
  expect(maxAfterJump <= replayCase.maxN3, what);
  std::snprintf(what, sizeof(what), "replay %s: the guarded N3 is never above the MSFS N3", replayCase.name);
  expect(!aboveSim, what);
  std::snprintf(what, sizeof(what), "replay %s: the normal acceleration afterwards is not limited (from %.1f s)", replayCase.name,
                replayCase.normalAccelStart);
  expect(!accelLimited, what);
  if (replayCase.samples[0].state != ON) {
    std::snprintf(what, sizeof(what), "replay %s: the FBW start ends at idle within 2 s of the jump (at %.1f s)", replayCase.name,
                  idleTime);
    expect(idleTime >= jumpTime && idleTime <= jumpTime + 2.0, what);
  }
  std::printf("replay %s: jump at %.1f s, guarded N3 max %.1f %%, FBW start end at %.1f s\n", replayCase.name, jumpTime, maxAfterJump,
              idleTime);
}

// The MSFS fan lags the core jump (sim test 2026-10-08, blip2.log): N1 still below the FBW idle when the core jumps
// ---------------------------------------------------------------------------------------------------------------------

struct CoreFanSample {
  double t;      // recording clock, seconds
  int    state;  // A32NX_ENGINE_STATE as recorded
  double simN3;  // TURB ENG N2 of the relit engine, percent
  double simN1;  // TURB ENG N1 of the relit engine, percent
};

#include "core_spike_replay_2026_10_08.inc"

/**
 * Replays the 2026-10-08 relight with the recorded MSFS N1. At the jump the MSFS N1 is still at 22.4 %, below the FBW idle N1, and
 * rises to 59.7 % only 2.6 s later: the guarded N1 (and with it the fuel flow and EGT the FADEC computes from it) must not follow it.
 * The FBW idle N3/N1 are not in the recording: 61.2 % is the N3 the E/WD held at the end of the start, 25.8 % the idle N1 used above.
 */
static void testReplayFanLagsTheCore() {
  constexpr double IDLE_N3             = 61.2;
  constexpr double IDLE_N1             = 25.8;
  constexpr double JUMP_TIME           = 274.0;  // the MSFS core jumps (57.5 to 96.2 % in 0.5 s)
  constexpr double NORMAL_ACCEL_START  = 285.0;  // the MSFS throttle rises (EngineStartThrottleHold released)
  constexpr double NORMAL_ACCEL_CHECK  = 286.0;  // from here the guard must follow MSFS unchanged
  const int        count               = static_cast<int>(sizeof(REPLAY_B2) / sizeof(REPLAY_B2[0]));

  GuardedEngine engine;
  int           state        = REPLAY_B2[0].state;
  double        maxN1        = 0.0;
  double        maxN3        = 0.0;
  bool          n1AboveSim   = false;
  bool          accelLimited = false;
  for (int i = 0; i + 1 < count; i++) {
    const CoreFanSample& from = REPLAY_B2[i];
    const CoreFanSample& to   = REPLAY_B2[i + 1];
    for (double t = from.t; t < to.t - 1e-9; t += FRAME_SECONDS) {
      // held between the samples, as the FADEC reads them from the sim: in the sample where the core jumps the fan has not followed
      const double simN3          = from.simN3;
      const double simN1          = from.simN1;
      const bool   engineStarting = state == STARTING || state == RESTARTING;
      const CoreSpikeGuard_A380X::Output output = engine.update(simN3, simN1, engineStarting, IDLE_N3, IDLE_N1, FRAME_SECONDS);
      if (t < JUMP_TIME) {
        state = from.state;
      } else if (engineStarting && StartSequence_A380X::startReachesIdle(true, output.n3, IDLE_N3, false)) {
        state = ON;
      }
      if (t >= JUMP_TIME && t < NORMAL_ACCEL_START) {
        maxN1 = (std::max)(maxN1, output.n1);
        maxN3 = (std::max)(maxN3, output.n3);
      }
      n1AboveSim |= output.n1 > simN1 + 1e-9;
      if (t >= NORMAL_ACCEL_CHECK) {
        accelLimited |= output.n1 != simN1 || output.n3 != simN3;
      }
    }
  }

  char what[200];
  std::snprintf(what, sizeof(what), "replay B2: no N1 spike after the jump although the MSFS N1 lags the core (max %.1f %%)", maxN1);
  expect(maxN1 <= IDLE_N1 + 0.1, what);
  std::snprintf(what, sizeof(what), "replay B2: no N3 spike after the jump (max %.1f %%)", maxN3);
  expect(maxN3 <= IDLE_N3 + 0.1, what);
  expect(!n1AboveSim, "replay B2: the guarded N1 is never above the MSFS N1");
  expect(!accelLimited, "replay B2: the normal acceleration afterwards is not limited");
  std::printf("replay B2 (fan lags the core): guarded N1 max %.1f %%, N3 max %.1f %% between the jump and the throttle rise\n",
              maxN1, maxN3);
}

static void testReplays() {
  // The FBW idle N3 (L:A32NX_ENGINE_IDLE_N3) is not in the recordings: Table1502_A380X::iCN3(altitude, Mach) * sqrt(theta), with the
  // Mach of the recorded IAS and altitude and theta from the MSFS start end at low_idle_n2 = 60 % corrected (T2/T3 0.968-0.970, S6
  // 0.992, S3 0.990): 63.0, 63.1, 63.2 and 63.3 %.
  // Allowed N3 after the jump: the FBW idle for a start that ends; for the running engine of T3 (MSFS settles at 82.9 %, the other
  // engines at 85.4 % with the same A/THR command) no more than about the other engines.
  const ReplayCase cases[] = {
      {"T2 quick relight (throttle at idle)", REPLAY_T2, static_cast<int>(sizeof(REPLAY_T2) / sizeof(REPLAY_T2[0])), 63.0, 1266.8, 63.0},
      {"T3 auto relight (engine ON, A/THR CL)", REPLAY_T3, static_cast<int>(sizeof(REPLAY_T3) / sizeof(REPLAY_T3[0])), 63.1, 1440.0,
       86.0},
      {"S6 relight (throttle at idle)", REPLAY_S6, static_cast<int>(sizeof(REPLAY_S6) / sizeof(REPLAY_S6[0])), 63.2, 518.4, 63.2},
      {"S3 relight (throttle at idle, 0.1 s samples)", REPLAY_S3, static_cast<int>(sizeof(REPLAY_S3) / sizeof(REPLAY_S3[0])), 63.3,
       1597.8, 63.3},
  };
  for (const ReplayCase& replayCase : cases) {
    replay(replayCase);
  }
}

int main() {
  testNormalAccelerationNotLimited();
  testJumpAtTheEndOfAStartFiltered();
  testJumpOfARunningEngineFiltered();
  testNotAJump();
  testEngineLostDuringTheJump();
  testMsfsSettlesAboveTheFbwIdle();
  testMsfsStaysSaturated();
  testReplays();
  testReplayFanLagsTheCore();

  if (failures == 0) {
    std::printf("core_spike_guard_test: all passed\n");
  } else {
    std::printf("core_spike_guard_test: %d failures\n", failures);
  }
  return failures == 0 ? 0 : 1;
}
