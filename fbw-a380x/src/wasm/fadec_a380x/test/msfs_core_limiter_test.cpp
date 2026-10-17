// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the limiter of the MSFS core speed at the end of an in-flight start (src/Fadec/MsfsCoreLimiter_A380X.hpp):
// run test/run_tests.sh. Built with -DWITHOUT_THE_FIX, the FADEC leaves the MSFS core alone as before the limiter: the test then
// fails (the recorded jump to 96.2 % and the thrust pulse of the engine model below).

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <optional>

#include "../src/Fadec/MsfsCoreLimiter_A380X.hpp"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

/// The FADEC side of one engine: the limiter, as EngineControl_A380X uses it.
class LimitedEngine {
 public:
  std::optional<double> update(const MsfsCoreLimiter_A380X::Inputs& inputs) {
#ifdef WITHOUT_THE_FIX
    (void)inputs;
    return std::nullopt;
#else
    return limiter.update(inputs);
#endif
  }

  bool isActive() const {
#ifdef WITHOUT_THE_FIX
    return false;
#else
    return limiter.isActive();
#endif
  }

 private:
  MsfsCoreLimiter_A380X limiter{};
};

// ---------------------------------------------------------------------------------------------------------------------
// Replay of the recorded jump: the FADEC detects it in its first sample and holds the core it gives back to MSFS
// ---------------------------------------------------------------------------------------------------------------------

struct RecordedSample {
  double t;               // s
  int    state;           // A32NX_ENGINE_STATE
  int    onGround;        // SIM ON GROUND
  double throttle;        // GENERAL ENG THROTTLE LEVER POSITION:4, percent
  double simN3;           // TURB ENG N2:4, percent
  double simCorrectedN3;  // TURB ENG CORRECTED N2:4, percent
  double simCorrectedN1;  // TURB ENG CORRECTED N1:4, percent
  double simCommandedN1;  // TURB ENG COMMANDED N1:4, percent
  double thrust;          // TURB ENG JET THRUST:4, lbf
};

#include "msfs_core_limiter_replay_2026_10_08.inc"

static constexpr int REPLAY_BLIP2_COUNT = static_cast<int>(sizeof(REPLAY_BLIP2) / sizeof(REPLAY_BLIP2[0]));

/// The FBW idle N3 is not in the recording: 61.2 % is the N3 the E/WD held at the end of the start (L:A32NX_ENGINE_N3:4).
static constexpr double BLIP2_IDLE_N3 = 61.2;

/**
 * Open loop: the recorded MSFS values are fed to the limiter frame by frame (held between the samples, as the FADEC reads them).
 * What the recording cannot show is how MSFS reacts to the writes (see the engine model below); it shows that the limiter fires on
 * the real jump, on its first sample, and what it gives back to MSFS: the MSFS core after the FADEC write never above the FBW idle
 * + HOLD_MARGIN, where the recording reaches 96.2 %.
 */
static void testReplayRecordedJump() {
  constexpr double JUMP_TIME      = 273.9;  // the sample of the jump (57.7 -> 60.9 %)
  constexpr double THROTTLE_RISES = 285.0;  // EngineStartThrottleHold releases the MSFS throttle

  LimitedEngine engine;
  double        firstWrite         = -1.0;
  double        maxCoreAfterFadec  = 0.0;  // the MSFS core once the FADEC has written it, between the jump and the throttle rise
  double        maxRecordedCore    = 0.0;
  bool          writeBeforeJump    = false;
  bool          activeAtThrottle   = false;
  for (int i = 0; i + 1 < REPLAY_BLIP2_COUNT; i++) {
    const RecordedSample& from = REPLAY_BLIP2[i];
    const RecordedSample& to   = REPLAY_BLIP2[i + 1];
    for (double t = from.t; t < to.t - 1e-9; t += FRAME_SECONDS) {
      const bool running = from.state == 1 || from.state == 2 || from.state == 3;
      const std::optional<double> write =
          engine.update({from.onGround == 0, running, from.simN3, from.simCorrectedN1, from.simCommandedN1, BLIP2_IDLE_N3, FRAME_SECONDS});
      const double coreAfterFadec = write ? *write : from.simN3;
      if (write && firstWrite < 0.0) {
        firstWrite = t;
      }
      writeBeforeJump |= write.has_value() && t < JUMP_TIME - 0.05;
      if (t >= JUMP_TIME && t < THROTTLE_RISES) {
        maxCoreAfterFadec = (std::max)(maxCoreAfterFadec, coreAfterFadec);
        maxRecordedCore   = (std::max)(maxRecordedCore, from.simN3);
      }
      if (t >= THROTTLE_RISES && t < THROTTLE_RISES + FRAME_SECONDS) {
        activeAtThrottle = engine.isActive();
      }
    }
  }

  char what[200];
  std::snprintf(what, sizeof(what), "replay blip2: the FADEC limits the MSFS core from the sample of the jump (first write %.2f s)",
                firstWrite);
  expect(firstWrite >= JUMP_TIME - 0.05 && firstWrite < JUMP_TIME + 0.1, what);
  expect(!writeBeforeJump, "replay blip2: no write during the start before the jump");
  std::snprintf(what, sizeof(what),
                "replay blip2: MSFS core after the FADEC write at most the FBW idle + %.1f %% (max %.1f %%, recorded %.1f %%)",
                MsfsCoreLimiter_A380X::HOLD_MARGIN_PERCENT, maxCoreAfterFadec, maxRecordedCore);
  expect(maxCoreAfterFadec <= BLIP2_IDLE_N3 + MsfsCoreLimiter_A380X::HOLD_MARGIN_PERCENT + 1e-6, what);
  expect(!activeAtThrottle, "replay blip2: the limiter has ended once MSFS ran down (before the throttle rise at 285 s)");
  std::printf("replay blip2: first write %.2f s, MSFS core after the FADEC max %.1f %% (recorded %.1f %%)\n", firstWrite,
              maxCoreAfterFadec, maxRecordedCore);
}

/// The normal acceleration after the start (recorded 285-300 s, throttle 0 -> 56 %, core 58 -> 83 % at up to 7.6 %/s) is not
/// limited: a limiter that has not seen a jump never writes.
static void testReplayNormalAccelerationNotLimited() {
  LimitedEngine engine;
  bool          written = false;
  for (int i = 0; i + 1 < REPLAY_BLIP2_COUNT; i++) {
    const RecordedSample& from = REPLAY_BLIP2[i];
    if (from.t < 284.0) {
      continue;
    }
    const RecordedSample& to = REPLAY_BLIP2[i + 1];
    for (double t = from.t; t < to.t - 1e-9; t += FRAME_SECONDS) {
      written |= engine.update({true, true, from.simN3, from.simCorrectedN1, from.simCommandedN1, BLIP2_IDLE_N3, FRAME_SECONDS})
                     .has_value();
    }
  }
  expect(!written, "replay blip2 285-300 s: the normal acceleration is not limited");
}

// ---------------------------------------------------------------------------------------------------------------------
// Synthetic cases
// ---------------------------------------------------------------------------------------------------------------------

/// A fast normal acceleration (11 %/s, the fastest recorded on the A380X) from idle is never limited.
static void testFastNormalAccelerationNotLimited() {
  LimitedEngine engine;
  bool          written = false;
  for (double core = 60.0; core < 97.0; core += 11.0 * FRAME_SECONDS) {
    written |= engine.update({true, true, core, 30.0, 90.0, 61.2, FRAME_SECONDS}).has_value();
  }
  expect(!written, "an 11 %/s acceleration is not limited");
}

/// On the ground the start ends without the jump (measured in the sim): the limiter never writes there, even on a fast rise.
static void testNothingOnTheGround() {
  LimitedEngine engine;
  bool          written = false;
  written |= engine.update({false, true, 57.7, 23.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  written |= engine.update({false, true, 70.0, 23.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  written |= engine.update({false, true, 90.0, 23.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  expect(!written, "no write on the ground");
}

/// A shutdown (ENG MASTER OFF, fuel cut, seizure) or a lost engine during the jump ends the limiter at once.
static void testEndsWhenTheEngineStops() {
#ifndef WITHOUT_THE_FIX
  MsfsCoreLimiter_A380X limiter;
  limiter.update({true, true, 57.7, 23.0, 23.9, 61.2, FRAME_SECONDS});
  const bool jumpLimited = limiter.update({true, true, 75.0, 23.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  expect(jumpLimited, "the jump is limited");
  const bool writtenAfterShutdown = limiter.update({true, false, 90.0, 23.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  expect(!writtenAfterShutdown && !limiter.isActive(), "no write once the engine is shut down");

  MsfsCoreLimiter_A380X lost;
  lost.update({true, true, 57.7, 23.0, 23.9, 61.2, FRAME_SECONDS});
  lost.update({true, true, 75.0, 23.0, 23.9, 61.2, FRAME_SECONDS});
  const bool writtenWhenLost = lost.update({true, true, 30.0, 10.0, 23.9, 61.2, FRAME_SECONDS}).has_value();
  expect(!writtenWhenLost && !lost.isActive(), "no write once the core has fallen out of the band (engine lost)");
#endif
}

// ---------------------------------------------------------------------------------------------------------------------
// Closed loop over a model of the MSFS engine
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A small model of the MSFS A380X engine in flight at FL150/240 kt, fitted to the recording (it is not the MSFS code, which is not
 * public; it reproduces the recorded jump: 0.5 s rise, 2.1 s at 100 % corrected, run down to idle in about 8 s, fan peak 66 %).
 * All speeds corrected (the model uses theta = 1).
 * - Start: the core rises at 1 %/s up to low_idle_n2 = 60 %, then MSFS runs it from its fuel flow controller.
 * - Fuel flow controller: an integrator of the core error to its commanded core speed (61 % at throttle 0, 87 % at 56 % throttle,
 *   the recorded climb), bounded to [0, 0.65], wound up during the start. The core follows corrected_n2_from_ff_table (engines.cfg)
 *   of the controller output with a 0.12 s lag (the recorded 0.5 s rise to the table top).
 * - Fan: n2_to_n1_table of engines.cfg at Mach 0.45, 0.5 s lag, rise at most 15 %/s (the recorded fan rise after the jump).
 * The FADEC write of the core is applied before the next MSFS step, which therefore starts from the written core.
 */
class MsfsEngineModel {
 public:
  static constexpr double LOW_IDLE_N2       = 60.0;
  static constexpr double INTEGRATOR_GAIN   = 0.0042;  // per % of core error and second
  static constexpr double INTEGRATOR_MAX    = 0.65;
  static constexpr double CORE_LAG_SECONDS  = 0.12;
  static constexpr double FAN_LAG_SECONDS   = 0.5;
  static constexpr double FAN_MAX_RISE_RATE = 15.0;

  double core = 24.0;
  double fan  = 9.0;

  void step(double throttlePercent, double deltaTime) {
    const double target = commandedCore(throttlePercent);
    controller          = std::clamp(controller + INTEGRATOR_GAIN * (target - core) * deltaTime, 0.0, INTEGRATOR_MAX);
    if (starting) {
      core += 1.0 * deltaTime;
      starting = core < LOW_IDLE_N2;
    } else {
      core += (coreFromFuelFlow(controller) - core) * (1.0 - std::exp(-deltaTime / CORE_LAG_SECONDS));
    }
    const double fanStep = (fanFromCore(core) - fan) * (1.0 - std::exp(-deltaTime / FAN_LAG_SECONDS));
    fan += (std::min)(fanStep, FAN_MAX_RISE_RATE * deltaTime);
  }

  static double commandedCore(double throttlePercent) { return 61.0 + (87.0 - 61.0) * std::clamp(throttlePercent, 0.0, 100.0) / 56.0; }
  static double commandedFan(double throttlePercent) { return fanFromCore(commandedCore(throttlePercent)); }

 private:
  struct Point {
    double x;
    double y;
  };

  template <int N>
  static double interpolate(const Point (&table)[N], double x) {
    if (x <= table[0].x) {
      return table[0].y;
    }
    for (int i = 1; i < N; i++) {
      if (x <= table[i].x) {
        return table[i - 1].y + (table[i].y - table[i - 1].y) * (x - table[i - 1].x) / (table[i].x - table[i - 1].x);
      }
    }
    return table[N - 1].y;
  }

  static double coreFromFuelFlow(double fuelFlow) {
    static constexpr Point TABLE[] = {{0.000184, 20.234723}, {0.017030, 60.000352}, {0.018464, 65.542906}, {0.108271, 69.501874},
                                      {0.141371, 73.460841}, {0.168471, 76.540038}, {0.190658, 79.179350}, {0.208824, 81.818662},
                                      {0.213632, 87.977056}, {0.269273, 100.0}};
    return interpolate(TABLE, fuelFlow);
  }

  static double fanFromCore(double coreSpeed) {
    // n2_to_n1_table, Mach 0.2 and 0.9 columns interpolated at Mach 0.45 (above 85 % both columns are the same)
    static constexpr Point TABLE[] = {{16.01, 0.0},  {19.35, 7.24},  {22.87, 7.83},  {50.15, 16.55}, {60.0, 22.52},
                                      {67.74, 27.91}, {73.02, 32.94}, {78.30, 39.99}, {81.64, 47.18}, {85.34, 63.11},
                                      {87.98, 74.76}, {97.8, 97.2},   {118.0, 115.3}};
    return interpolate(TABLE, coreSpeed);
  }

  double controller = 0.0;  // the fuel flow controller output (corrected_n2_from_ff_table argument)
  bool   starting   = true;
};

struct ClosedLoopResult {
  double startEnd        = -1.0;  // s, the core reaches low_idle_n2
  double maxCoreHeld     = 0.0;   // the highest core while the throttle is at idle, after the start end
  double maxFanHeld      = 0.0;   // the highest fan while the throttle is at idle, after the start end
  double limiterEnd      = -1.0;  // s, the limiter has ended
  double coreAtTheEnd    = 0.0;   // the core at the end of the run
  double fanAtTheEnd     = 0.0;
  double maxCoreAfterAll = 0.0;   // the highest core after the throttle rise
};

/// FBW idle N3 of the model, corrected: 61.2 % (recorded) x 1.039 (the recorded corrected / uncorrected core ratio).
static constexpr double MODEL_IDLE_N3 = 63.6;

/**
 * Runs an in-flight start in the model: windmilling core at 24 %, the start, the throttle at idle up to throttleRiseTime, then
 * rising at 15 %/s to throttleTarget (EngineStartThrottleHold and the A/THR), until endTime.
 */
static ClosedLoopResult runClosedLoop(double throttleRiseTime, double throttleTarget, double endTime, double throttleDuringStart = 0.0) {
  MsfsEngineModel  msfs;
  LimitedEngine    fadec;
  ClosedLoopResult result;
  double           throttle = throttleDuringStart;
  for (double t = 0.0; t < endTime; t += FRAME_SECONDS) {
    if (t >= throttleRiseTime) {
      throttle = (std::min)(throttleTarget, throttle + 15.0 * FRAME_SECONDS);
    }
    msfs.step(throttle, FRAME_SECONDS);
    if (result.startEnd < 0.0 && msfs.core >= MsfsEngineModel::LOW_IDLE_N2) {
      result.startEnd = t;
    }
    const std::optional<double> write =
        fadec.update({true, true, msfs.core, msfs.fan, MsfsEngineModel::commandedFan(throttle), MODEL_IDLE_N3, FRAME_SECONDS});
    if (result.startEnd >= 0.0 && t < throttleRiseTime) {
      result.maxCoreHeld = (std::max)(result.maxCoreHeld, msfs.core);
      result.maxFanHeld  = (std::max)(result.maxFanHeld, msfs.fan);
    }
    if (t >= throttleRiseTime) {
      result.maxCoreAfterAll = (std::max)(result.maxCoreAfterAll, msfs.core);
    }
    if (write) {
      msfs.core = *write;
    }
    if (result.startEnd >= 0.0 && result.limiterEnd < 0.0 && !fadec.isActive() && t > result.startEnd + 0.5) {
      result.limiterEnd = t;
    }
  }
  result.coreAtTheEnd = msfs.core;
  result.fanAtTheEnd  = msfs.fan;
  return result;
}

/// The model without the FADEC write reproduces the recorded jump: 100 % corrected and the fan pulse.
static void testModelReproducesTheJump() {
  MsfsEngineModel msfs;
  double          startEnd = -1.0;
  double          maxCore  = 0.0;
  double          maxFan   = 0.0;
  double          at100    = 0.0;
  for (double t = 0.0; t < 60.0; t += FRAME_SECONDS) {
    msfs.step(0.0, FRAME_SECONDS);
    if (startEnd < 0.0 && msfs.core >= MsfsEngineModel::LOW_IDLE_N2) {
      startEnd = t;
    }
    maxCore = (std::max)(maxCore, msfs.core);
    maxFan  = (std::max)(maxFan, msfs.fan);
    at100 += msfs.core > 99.0 ? FRAME_SECONDS : 0.0;
  }
  char what[200];
  std::snprintf(what, sizeof(what), "model: the jump of the recording (core max %.1f %%, %.1f s above 99 %%, fan max %.1f %%)", maxCore,
                at100, maxFan);
  expect(maxCore > 99.0 && at100 > 1.5 && at100 < 3.0 && maxFan > 55.0, what);
  std::snprintf(what, sizeof(what), "model: settles at idle (core %.1f %%)", msfs.core);
  expect(std::fabs(msfs.core - 61.0) < 0.5, what);
}

/// Quick relight with the lever at idle (as recorded): the core is held near the FBW idle instead of jumping, the fan stays near
/// idle, the limiter ends once MSFS has unwound, and the engine idles afterwards.
static void testClosedLoopRelightAtIdle() {
  const ClosedLoopResult result = runClosedLoop(1000.0, 0.0, 120.0);
  char                   what[220];
  std::snprintf(what, sizeof(what),
                "model, lever at idle: no jump of the core (max %.1f %%, allowed %.1f %% = FBW idle + hold margin + one MSFS step)",
                result.maxCoreHeld, MODEL_IDLE_N3 + MsfsCoreLimiter_A380X::HOLD_MARGIN_PERCENT + 10.0);
  expect(result.maxCoreHeld <= MODEL_IDLE_N3 + MsfsCoreLimiter_A380X::HOLD_MARGIN_PERCENT + 10.0, what);
  std::snprintf(what, sizeof(what), "model, lever at idle: a much smaller thrust pulse (fan max %.1f %%, idle 23.3 %%, jump 66 %%)",
                result.maxFanHeld);
  expect(result.maxFanHeld <= 45.0, what);
  std::snprintf(what, sizeof(what), "model, lever at idle: the limiter ends (%.1f s after the start end)",
                result.limiterEnd - result.startEnd);
  expect(result.limiterEnd > 0.0 && result.limiterEnd - result.startEnd < MsfsCoreLimiter_A380X::MAX_HOLD_SECONDS + 10.0, what);
  std::snprintf(what, sizeof(what), "model, lever at idle: the engine idles afterwards (core %.1f %%)", result.coreAtTheEnd);
  expect(std::fabs(result.coreAtTheEnd - 61.0) < 0.5, what);
  std::printf("model, lever at idle: core max %.1f %%, fan max %.1f %%, limiter ended %.1f s after the start end\n",
              result.maxCoreHeld, result.maxFanHeld, result.limiterEnd - result.startEnd);
}

/// The lever stays in CL with the A/THR: EngineStartThrottleHold releases the throttle 11 s after the jump, as recorded (274 ->
/// 285 s). The engine accelerates to the climb (core 87 %) without the limiter keeping it below, and the MSFS fuel flow controller
/// has unwound under the hold by then: no overshoot of the climb (with a 3 % hold margin the model went to 95 %).
static void testClosedLoopThrottleRisesAfterTheStart() {
  const ClosedLoopResult result = runClosedLoop(47.0, 56.0, 150.0);
  char                   what[200];
  std::snprintf(what, sizeof(what), "model, lever CL: the engine reaches the climb (core %.1f %%, fan %.1f %%)", result.coreAtTheEnd,
                result.fanAtTheEnd);
  expect(std::fabs(result.coreAtTheEnd - 87.0) < 0.5, what);
  std::snprintf(what, sizeof(what), "model, lever CL: no overshoot of the climb core speed (max %.1f %%, climb 87 %%)",
                result.maxCoreAfterAll);
  expect(result.maxCoreAfterAll <= 89.0, what);
  std::snprintf(what, sizeof(what), "model, lever CL: the limiter ends (%.1f s after the start end)", result.limiterEnd - result.startEnd);
  expect(result.limiterEnd > 0.0, what);
  std::printf(
      "model, lever CL after the start: core max %.1f %% after the throttle rise, end %.1f %%, limiter ended %.1f s after the start end\n",
      result.maxCoreAfterAll, result.coreAtTheEnd, result.limiterEnd - result.startEnd);
}

/// Auto relight of a running engine with the lever in CL (the MSFS throttle stays at the climb throttle): the core accelerates to
/// the climb at a normal rate and is not held at idle.
static void testClosedLoopAutoRelightInClimb() {
  const ClosedLoopResult result = runClosedLoop(0.0, 56.0, 120.0, 56.0);
  char                   what[200];
  std::snprintf(what, sizeof(what), "model, auto relight in CL: the engine reaches the climb (core %.1f %%)", result.coreAtTheEnd);
  expect(std::fabs(result.coreAtTheEnd - 87.0) < 0.5, what);
  std::snprintf(what, sizeof(what), "model, auto relight in CL: the limiter ends (%.1f s after the start end)",
                result.limiterEnd - result.startEnd);
  expect(result.limiterEnd > 0.0, what);
  std::printf("model, auto relight in CL: core max %.1f %%, limiter ended %.1f s after the start end\n", result.maxCoreAfterAll,
              result.limiterEnd - result.startEnd);
}

int main() {
  testReplayRecordedJump();
  testReplayNormalAccelerationNotLimited();
  testFastNormalAccelerationNotLimited();
  testNothingOnTheGround();
  testEndsWhenTheEngineStops();
  testModelReproducesTheJump();
  testClosedLoopRelightAtIdle();
  testClosedLoopThrottleRisesAfterTheStart();
  testClosedLoopAutoRelightInClimb();

  if (failures == 0) {
    std::printf("msfs_core_limiter_test: all passed\n");
  } else {
    std::printf("msfs_core_limiter_test: %d failures\n", failures);
  }
  return failures == 0 ? 0 : 1;
}
