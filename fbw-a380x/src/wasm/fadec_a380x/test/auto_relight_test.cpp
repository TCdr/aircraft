// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the igniter selection of the FADEC, in-flight relight and FCOM AUTO RELIGHT
// (src/Fadec/EngineIgnition_A380X.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>
#include <initializer_list>

#include "../src/Fadec/EngineIgnition_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

// FBW engine states (A32NX_ENGINE_STATE)
enum FbwEngineState { OFF = 0, ON = 1, STARTING = 2, RESTARTING = 3, SHUTTING = 4 };

/// One engine as the FADEC sees it each frame; defaults: a running engine in flight, master ON, MSFS burning.
struct EngineConditions {
  bool simOnGround            = false;
  int  state                  = ON;
  bool masterOn               = true;
  bool fuelCut                = false;
  bool seized                 = false;
  bool firePbReleased         = false;
  bool simCombustion          = true;
  bool systemsRelightIgnition = false;
};

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

static EngineIgnition_A380X::Inputs inputsOf(const EngineConditions& conditions, double deltaTime) {
  return {
      conditions.simOnGround,
      conditions.state == ON,
      conditions.state == SHUTTING || conditions.state == RESTARTING || conditions.state == STARTING,
      conditions.masterOn,
      conditions.fuelCut,
      conditions.seized,
      conditions.firePbReleased,
      conditions.simCombustion,
      conditions.systemsRelightIgnition,
      deltaTime,
  };
}

/// Runs the FADEC for this time with constant conditions; returns the ignition of the last frame.
static bool run(EngineIgnition_A380X& ignition, const EngineConditions& conditions, double seconds) {
  bool ignitionOn = false;
  for (double elapsed = 0.0; elapsed < seconds - 1e-9; elapsed += FRAME_SECONDS) {
    ignitionOn = ignition.update(inputsOf(conditions, FRAME_SECONDS));
  }
  return ignitionOn;
}

/// The time it takes the FADEC to select the igniters with constant conditions, or a negative value if it does not.
static double timeToIgnition(EngineIgnition_A380X& ignition, const EngineConditions& conditions, double maxSeconds) {
  for (double elapsed = FRAME_SECONDS; elapsed <= maxSeconds + 1e-9; elapsed += FRAME_SECONDS) {
    if (ignition.update(inputsOf(conditions, FRAME_SECONDS))) {
      return elapsed;
    }
  }
  return -1.0;
}

static EngineConditions flamedOut() {
  EngineConditions conditions;
  conditions.simCombustion = false;
  return conditions;
}

// ---------------------------------------------------------------------------------------------------------------------
// Detection, ignition and release
// ---------------------------------------------------------------------------------------------------------------------

static void testDetectionAndRelease() {
  {
    EngineIgnition_A380X ignition;
    expect(!run(ignition, EngineConditions{}, 10.0), "a running engine that burns gets no FADEC ignition");
  }
  {
    // the combustion flag drops for a few frames (start-end transition): no flameout
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 2.0);
    const bool duringFlicker = run(ignition, flamedOut(), 0.2);
    const bool afterFlicker  = run(ignition, EngineConditions{}, 2.0);
    expect(!duringFlicker && !afterFlicker, "a 0.2 s combustion flicker is no flameout");
  }
  {
    // MSFS loses the combustion: both igniters within about 1 s, and kept while the engine does not burn
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 2.0);
    const double delay = timeToIgnition(ignition, flamedOut(), 5.0);
    expect(delay > 0.0 && delay <= 1.0, "flameout in flight: igniters on within 1 s");
    expect(delay >= EngineIgnition_A380X::FLAMEOUT_CONFIRMATION_SECONDS - 1e-6, "flameout: confirmed for 0.5 s first");
    expect(run(ignition, flamedOut(), 150.0), "flameout: igniters kept on as long as the engine does not burn (150 s)");
    expect(ignition.autoRelightPhase() == EngineIgnition_A380X::AutoRelightPhase::FLAMED_OUT, "flameout: phase FLAMED_OUT");

    // the engine relights: the igniters stay on for 60 s, then are given back to the ENG START selector
    expect(run(ignition, EngineConditions{}, 59.8), "relit: igniters still on 59.8 s after the relight");
    expect(ignition.autoRelightPhase() == EngineIgnition_A380X::AutoRelightPhase::RELIT, "relit: phase RELIT");
    expect(!run(ignition, EngineConditions{}, 0.4), "relit: igniters off 60 s after the relight");
    expect(!run(ignition, EngineConditions{}, 30.0), "relit: igniters stay off once the engine burns for 60 s");
  }
  {
    // the flame goes out again within the 60 s: igniters kept on, the 60 s restart at the next relight
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 1.0);
    run(ignition, flamedOut(), 2.0);
    run(ignition, EngineConditions{}, 40.0);
    expect(run(ignition, flamedOut(), FRAME_SECONDS), "second flameout within the 60 s: igniters stay on");
    expect(run(ignition, EngineConditions{}, 59.8), "second relight: igniters on 59.8 s after it");
    expect(!run(ignition, EngineConditions{}, 0.4), "second relight: igniters off 60 s after it");
  }
  {
    // FCOM: "on ground or in flight"
    EngineIgnition_A380X ignition;
    EngineConditions     ground;
    ground.simOnGround = true;
    run(ignition, ground, 2.0);
    ground.simCombustion = false;
    const double delay   = timeToIgnition(ignition, ground, 5.0);
    expect(delay > 0.0 && delay <= 1.0, "flameout on the ground: igniters on within 1 s");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Inhibitions: the crew controls and the flyPad failures keep the engine out
// ---------------------------------------------------------------------------------------------------------------------

static void testInhibitions() {
  {
    // ENG MASTER OFF: "Stops the ignition"
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 1.0);
    expect(run(ignition, flamedOut(), 5.0), "master OFF case: igniters on after the flameout");
    EngineConditions masterOff = flamedOut();
    masterOff.masterOn         = false;
    masterOff.state            = SHUTTING;
    expect(!run(ignition, masterOff, FRAME_SECONDS), "ENG MASTER OFF during the auto relight: igniters off at once");
    expect(!run(ignition, masterOff, 30.0), "ENG MASTER OFF: no igniters while the engine shuts down");
  }
  {
    // master OFF with the FBW state still ON for a frame (the state machine reads the starter of the same frame)
    EngineIgnition_A380X ignition;
    EngineConditions     masterOff = flamedOut();
    masterOff.masterOn             = false;
    expect(!run(ignition, masterOff, 10.0), "ENG MASTER OFF: no flameout detection");
  }
  {
    // flyPad "Engine N flameout (crew relight possible)": the systems WASM cuts the fuel, the FADEC handles the engine as
    // shut down. No auto relight ignition, whether the FBW state is still ON or already SHUTTING.
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 1.0);
    EngineConditions fuelCut = flamedOut();
    fuelCut.fuelCut          = true;
    expect(!run(ignition, fuelCut, 10.0), "fuel cut (flameout failure), state ON: no auto relight");
    fuelCut.state = SHUTTING;
    expect(!run(ignition, fuelCut, 120.0), "fuel cut (flameout failure), state SHUTTING: no auto relight");
  }
  {
    // fuel cut while the auto relight is on (LP valve starvation after the flameout): igniters off
    EngineIgnition_A380X ignition;
    run(ignition, flamedOut(), 2.0);
    EngineConditions fuelCut = flamedOut();
    fuelCut.fuelCut          = true;
    expect(!run(ignition, fuelCut, FRAME_SECONDS), "fuel cut during the auto relight: igniters off at once");
  }
  {
    // seizure failure
    EngineIgnition_A380X ignition;
    EngineConditions     seized = flamedOut();
    seized.seized               = true;
    seized.fuelCut              = true;
    expect(!run(ignition, seized, 10.0), "seizure: no auto relight");
    seized.fuelCut = false;  // even if the fuel cut came a frame late
    expect(!run(ignition, seized, 10.0), "seizure without the fuel cut yet: no auto relight");
  }
  {
    // ENG FIRE pb released: "Shuts off the FADEC power supply"
    EngineIgnition_A380X ignition;
    run(ignition, EngineConditions{}, 1.0);
    expect(run(ignition, flamedOut(), 5.0), "FIRE pb case: igniters on after the flameout");
    EngineConditions firePb = flamedOut();
    firePb.firePbReleased   = true;
    expect(!run(ignition, firePb, FRAME_SECONDS), "ENG FIRE pb released during the auto relight: igniters off at once");
    expect(!run(ignition, firePb, 30.0), "ENG FIRE pb released: no auto relight");
  }
  {
    // a crew start (STARTING, RESTARTING) or shutdown (SHUTTING, OFF) keeps its own logic
    for (const int state : {OFF, STARTING, RESTARTING, SHUTTING}) {
      EngineIgnition_A380X ignition;
      EngineConditions     notRunning = flamedOut();
      notRunning.state                = state;
      expect(!run(ignition, notRunning, 10.0), "engine not ON (crew start or shutdown): no auto relight");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The in-flight relight ignition of the systems WASM is unchanged
// ---------------------------------------------------------------------------------------------------------------------

static void testInFlightRelightIgnition() {
  for (const int state : {STARTING, RESTARTING, SHUTTING}) {
    EngineIgnition_A380X ignition;
    EngineConditions     relight;
    relight.state                  = state;
    relight.simCombustion          = false;
    relight.systemsRelightIgnition = true;
    expect(run(ignition, relight, FRAME_SECONDS), "in-flight relight lighting up: igniters on at once");
    relight.simOnGround = true;
    expect(!run(ignition, relight, FRAME_SECONDS), "relight ignition of the systems WASM: never on the ground");
  }
  {
    EngineIgnition_A380X ignition;
    EngineConditions     relight;
    relight.state                  = ON;
    relight.systemsRelightIgnition = true;
    expect(!run(ignition, relight, FRAME_SECONDS), "relight ignition of the systems WASM: not once the engine is ON");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay of the flight of 2026-10-06: four engines lose their MSFS combustion at 703.8 s, ENG START NORM, nothing
// relights them until the crew selects IGN START at 854.9 s
// ---------------------------------------------------------------------------------------------------------------------

struct ReplaySample {
  double t;
  int    onGround, selector;
  int    master1, state1, combustion1, fuelCut1;
  double n2_1;
  int    master4, state4, combustion4, fuelCut4;
  double n2_4;
  int    relightIgnition4;
  double n2_2;
};

static const ReplaySample REPLAY[] = {
#include "auto_relight_replay_2026_10_06.inc"
};
static constexpr int REPLAY_SIZE = sizeof(REPLAY) / sizeof(REPLAY[0]);

static constexpr double RECORDED_FLAMEOUT_TIME  = 703.8;  // first sample without combustion
static constexpr double RECORDED_CREW_IGN_START = 854.9;  // the crew selects IGN START, MSFS burns again
static constexpr double MSFS_MIN_N2_FOR_COMBUSTION = 20.0;  // engines.cfg min_n2_for_combustion

/// The recorded conditions of one engine (engines 2 and 3 replay the engine 1 columns, see the include).
static EngineConditions recordedConditions(const ReplaySample& sample, int engine) {
  EngineConditions conditions;
  const bool       outboardRight     = engine == 4;
  conditions.simOnGround             = sample.onGround != 0;
  conditions.state                   = outboardRight ? sample.state4 : sample.state1;
  conditions.masterOn                = (outboardRight ? sample.master4 : sample.master1) != 0;
  conditions.fuelCut                 = (outboardRight ? sample.fuelCut4 : sample.fuelCut1) != 0;
  conditions.simCombustion           = (outboardRight ? sample.combustion4 : sample.combustion1) != 0;
  conditions.systemsRelightIgnition  = outboardRight && sample.relightIgnition4 != 0;
  return conditions;
}

static double recordedN2(const ReplaySample& sample, int engine) {
  switch (engine) {
    case 1:
    case 3:
      return sample.n2_1;
    case 2:
      return sample.n2_2;
    default:
      return sample.n2_4;
  }
}

/// The time of the first sample at which the recorded ENG MASTER of the engine is OFF after the flameout.
static double recordedMasterOffTime(int engine) {
  for (int i = 0; i < REPLAY_SIZE; i++) {
    if (REPLAY[i].t > RECORDED_FLAMEOUT_TIME && !recordedConditions(REPLAY[i], engine).masterOn) {
      return REPLAY[i].t;
    }
  }
  return 1e9;
}

/// Open loop: the recorded MSFS combustion is fed as it was (the FADEC ignition did not exist).
static void testReplayOpenLoop(int engine) {
  EngineIgnition_A380X ignition;
  double               ignitionOnTime     = -1.0;
  bool                 offBeforeFlameout  = true;
  bool                 droppedWhileMaster = false;
  bool                 offAfterMasterOff  = true;
  const double         masterOffTime      = recordedMasterOffTime(engine);

  for (int i = 0; i + 1 < REPLAY_SIZE; i++) {
    const EngineConditions conditions = recordedConditions(REPLAY[i], engine);
    // the recording is sampled every 0.5 s: each sample holds until the next one, the FADEC runs at 30 frames per second
    for (double t = REPLAY[i].t; t < REPLAY[i + 1].t - 1e-9; t += FRAME_SECONDS) {
      const double dt         = std::fmin(FRAME_SECONDS, REPLAY[i + 1].t - t);
      const bool   ignitionOn = ignition.update(inputsOf(conditions, dt));
      if (t < RECORDED_FLAMEOUT_TIME && ignitionOn) {
        offBeforeFlameout = false;
      }
      if (ignitionOn && ignitionOnTime < 0.0) {
        ignitionOnTime = t;
      }
      if (ignitionOnTime >= 0.0 && t < masterOffTime && !ignitionOn) {
        droppedWhileMaster = true;
      }
      if (t >= masterOffTime && !conditions.masterOn && ignitionOn) {
        offAfterMasterOff = false;
      }
    }
  }

  char what[160];
  std::snprintf(what, sizeof(what), "replay engine %d: no FADEC ignition before the flameout", engine);
  expect(offBeforeFlameout, what);
  std::snprintf(what, sizeof(what), "replay engine %d: igniters on within 1 s of the combustion loss (on at %.2f s)", engine,
                ignitionOnTime);
  expect(ignitionOnTime >= RECORDED_FLAMEOUT_TIME && ignitionOnTime <= RECORDED_FLAMEOUT_TIME + 1.0, what);
  std::snprintf(what, sizeof(what), "replay engine %d: igniters kept on until the crew sets the ENG MASTER OFF (%.1f s)", engine,
                masterOffTime);
  expect(ignitionOnTime >= 0.0 && !droppedWhileMaster, what);
  std::snprintf(what, sizeof(what), "replay engine %d: igniters off while the ENG MASTER is OFF", engine);
  expect(offAfterMasterOff, what);
  std::printf("replay engine %d (open loop): igniters on at %.2f s (combustion lost at %.1f s), off at the MASTER OFF %.1f s\n",
              engine, ignitionOnTime, RECORDED_FLAMEOUT_TIME, masterOffTime);
}

/// Closed loop: MSFS burns again as soon as its ignition switch is at IGN with the core above its combustion speed, as it did
/// in the recording at the crew IGN START (854.9 s, 25.2 % N2).
static void testReplayClosedLoop(int engine) {
  EngineIgnition_A380X ignition;
  bool                 msfsBurns       = true;
  double               relightTime     = -1.0;
  double               relightN2        = 0.0;
  double               ignitionOffTime  = -1.0;
  bool                 previousIgnition = false;

  for (int i = 0; i + 1 < REPLAY_SIZE && REPLAY[i].t < RECORDED_CREW_IGN_START; i++) {
    EngineConditions conditions = recordedConditions(REPLAY[i], engine);
    for (double t = REPLAY[i].t; t < REPLAY[i + 1].t - 1e-9; t += FRAME_SECONDS) {
      const double dt = std::fmin(FRAME_SECONDS, REPLAY[i + 1].t - t);
      // MSFS lost the combustion at the recorded flameout; it lights again with the ignition at IGN above 20 % N2
      if (msfsBurns && !conditions.simCombustion && relightTime < 0.0) {
        msfsBurns = false;
      }
      if (!msfsBurns && previousIgnition && recordedN2(REPLAY[i], engine) >= MSFS_MIN_N2_FOR_COMBUSTION) {
        msfsBurns   = true;
        relightTime = t;
        relightN2   = recordedN2(REPLAY[i], engine);
      }
      conditions.simCombustion = msfsBurns;
      const bool ignitionOn    = ignition.update(inputsOf(conditions, dt));
      if (previousIgnition && !ignitionOn && ignitionOffTime < 0.0) {
        ignitionOffTime = t;
      }
      previousIgnition = ignitionOn;
    }
  }

  char what[200];
  std::snprintf(what, sizeof(what),
                "replay engine %d (closed loop): MSFS relights within about 1 s of the flameout at NORM (relit at %.2f s, N2 %.1f %%)",
                engine, relightTime, relightN2);
  expect(relightTime >= RECORDED_FLAMEOUT_TIME && relightTime <= RECORDED_FLAMEOUT_TIME + 1.1, what);
  std::snprintf(what, sizeof(what), "replay engine %d (closed loop): igniters given back 60 s after the relight (off at %.2f s)",
                engine, ignitionOffTime);
  expect(ignitionOffTime > 0.0 && std::fabs(ignitionOffTime - relightTime - 60.0) <= 2.0 * FRAME_SECONDS, what);
  std::printf("replay engine %d (closed loop): relit at %.2f s instead of %.1f s, igniters off at %.2f s\n", engine, relightTime,
              RECORDED_CREW_IGN_START, ignitionOffTime);
}

int main() {
  testDetectionAndRelease();
  testInhibitions();
  testInFlightRelightIgnition();
  for (int engine = 1; engine <= 4; engine++) {
    testReplayOpenLoop(engine);
    testReplayClosedLoop(engine);
  }

  if (failures == 0) {
    std::printf("auto_relight_test: all passed\n");
  } else {
    std::printf("auto_relight_test: %d failures\n", failures);
  }
  return failures == 0 ? 0 : 1;
}
