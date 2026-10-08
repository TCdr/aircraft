// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the MSFS throttle during and after an in-flight engine start
// (fbw-common/src/wasm/fbw_common/src/EngineStartThrottleHold.h, shared with the A380X): run test/run_tests.sh.
//
// The in-flight relights of the sim test of 2026-10-05 (leap_relight.log) ended with the MSFS N2 at 110-114 % for 3-7 s, with
// the thrust lever in CL (T1, FL150) and even at IDLE (T2, FL265). The thrust loop (the generated FadecComputer model, used here
// as it is) integrates the MSFS throttle until the MSFS commanded N1 meets the N1 target. The scenarios below close that loop
// over a small model of the MSFS engine and replay the two recorded relights.

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "EngineStartThrottleHold.h"
#include "FadecComputer.h"

// Build with -DWITHOUT_THE_FALLBACK to run the same checks without the fallback for a start that ends below the FBW idle (the
// "start ends below idle" scenarios must then fail: the engine never reaches ON).
static EngineStartThrottleHold::Parameters holdParameters() {
  EngineStartThrottleHold::Parameters parameters;
#ifdef WITHOUT_THE_FALLBACK
  parameters.releaseThrottleMaxPercent = 0.0;
#endif
  return parameters;
}

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

/// FBW engine states (L:A32NX_ENGINE_STATE, fadec_a32nx EngineControlA32NX.h).
enum FbwEngineState { OFF = 0, ON = 1, STARTING = 2, RESTARTING = 3, SHUTTING = 4 };

/**
 * A small model of the MSFS engine, as far as the thrust loop sees it (the MSFS engine internals cannot be read offline):
 * - A. While the engine is out and during its start, MSFS does not govern the engine to the throttle: the N2 follows the start
 *   (+1 %/s, as recorded: 61 -> 66 % in 5 s at FL150) and TURB ENG COMMANDED N1 does not answer the throttle (here 0).
 * - B. When its start ends, MSFS governs the N1 to the throttle at once (N2 66 -> 113 % within 1 s in the recordings).
 * - C. With commandedN1Lag, the commanded N1 then climbs from 0 at about 14 %/s before it follows the throttle (fitted to the
 *   recorded time at the N2 limit: 6.2 s to the CLB N1 at FL150, 3.5 s to the idle N1 at FL265; a lever IDLE -> CL later in the
 *   same flight did not overshoot, so it follows the throttle once caught up). Without it, it follows the throttle at once.
 */
struct MsfsEngineModel {
  double idleN1;      // MSFS N1 at throttle 0, percent
  double maxN1;       // MSFS N1 at throttle 100, percent
  double idleN2;      // MSFS N2 at throttle 0, percent
  double maxN2;       // MSFS N2 at throttle 100 (recorded N2 limit), percent
  double startEndN2;  // N2 at which the MSFS start ends, percent
  double n2;          // current N2, percent
  bool   commandedN1Lag;
  bool   running       = false;
  bool   starting      = false;
  double sinceStartEnd = 0.0;
  double n1            = 0.0;
  double commandedN1   = 0.0;

  static constexpr double START_N2_RATE_PERCENT_PER_SECOND         = 1.0;
  static constexpr double COMMANDED_N1_RECOVERY_PERCENT_PER_SECOND = 14.0;
  static constexpr double N1_TIME_CONSTANT_SECONDS                 = 0.4;

  double n1Demand(double throttle) const { return idleN1 + (throttle / 100.0) * (maxN1 - idleN1); }
  double n2FromN1(double value) const {
    if (value <= idleN1) {
      return idleN2 * value / idleN1;
    }
    return std::min(maxN2, idleN2 + (value - idleN1) * (maxN2 - idleN2) / (maxN1 - idleN1));
  }
  double n1FromN2(double value) const { return value <= idleN2 ? idleN1 * value / idleN2 : idleN1; }

  void step(double throttle, double dt) {
    if (!running) {
      if (starting) {
        n2 += START_N2_RATE_PERCENT_PER_SECOND * dt;
        if (n2 >= startEndN2) {
          running       = true;
          sinceStartEnd = 0.0;
        }
      }
      n1          = n1FromN2(n2);
      commandedN1 = 0.0;
      return;
    }
    sinceStartEnd += dt;
    n1 += (n1Demand(throttle) - n1) * (1.0 - std::exp(-dt / N1_TIME_CONSTANT_SECONDS));
    n2          = n2FromN1(n1);
    commandedN1 = commandedN1Lag ? std::min(n1Demand(throttle), COMMANDED_N1_RECOVERY_PERCENT_PER_SECOND * sinceStartEnd)
                                 : n1Demand(throttle);
  }
};

struct Scenario {
  const char* name;
  double      altitudeFeet;
  double      tlaDeg;      // 0 = IDLE, 25 = CL
  double      idleLimit;   // FBW N1 thrust limits, percent
  double      clbLimit;
  double      fbwIdleN2;   // FBW idle N2 (A32NX_ENGINE_IDLE_N2): the FADEC goes ON at idle N2 - 0.1
  double      msfsIdleN1;  // MSFS N1 at throttle 0
  double      msfsIdleN2;
  double      msfsMaxN2;
  double      startEndN2;  // MSFS N2 at which its start ends
  double      outSeconds;  // engine out (SHUTTING) before the ENG MASTER ON
  double      relightN2;   // MSFS N2 when the relight starts
};

struct Result {
  bool   reachedOn          = false;
  double onTime             = 0.0;
  double startEndTime       = -1.0;  // the MSFS start ends (MSFS governs the engine)
  double maxN2AfterOn       = 0.0;
  double maxN2AfterStartEnd = 0.0;
  double finalN2            = 0.0;
  double heldAfterOnSeconds = 0.0;
  double settledAfterOn     = -1.0;  // seconds from ON until N2 stays within 1 % of the lever value
  double steadyN2           = 0.0;   // the N2 for the lever position once settled
};

static Result run(const Scenario& s, bool commandedN1Lag, bool withHold, double durationSeconds) {
  constexpr double dt = 1.0 / 30.0;

  FadecComputer fadec;
  fadec.initialize();
  FadecComputer::ExternalInputs_FadecComputer_T inputs{};

  MsfsEngineModel         engine{s.msfsIdleN1, 104.0, s.msfsIdleN2, s.msfsMaxN2, s.startEndN2, s.relightN2, commandedN1Lag};
  EngineStartThrottleHold hold(holdParameters());

  Result result;
  const double leverN1 = s.tlaDeg <= 0.0 ? s.idleLimit : s.clbLimit;
  result.steadyN2      = engine.n2FromN1(std::max(leverN1, s.msfsIdleN1));

  FbwEngineState state        = SHUTTING;
  double         loopTargetN1 = 0.0;
  for (double t = 0.0; t < durationSeconds; t += dt) {
    // ENG MASTER ON after the engine-out time: the relight starts (RESTARTING), the MSFS start begins.
    if (state == SHUTTING && t >= s.outSeconds) {
      state           = RESTARTING;
      engine.starting = true;
    }
    // fadec_a32nx: STARTING/RESTARTING -> ON once the MSFS N2 reaches the FBW idle N2 - 0.1.
    if (state == RESTARTING && engine.n2 >= s.fbwIdleN2 - 0.1) {
      state            = ON;
      result.reachedOn = true;
      result.onTime    = t;
    }

    inputs.in.time.dt                          = dt;
    inputs.in.time.simulation_time             = t;
    inputs.in.data.on_ground                   = false;
    inputs.in.data.H_ft                        = s.altitudeFeet;
    inputs.in.data.is_engine_operative         = engine.running;
    inputs.in.data.engine_N1_percent           = engine.n1;
    inputs.in.data.commanded_engine_N1_percent = engine.commandedN1;  // N1 = corrected N1 in this model
    inputs.in.input.TLA_deg                    = s.tlaDeg;
    inputs.in.input.thrust_limit_IDLE_percent  = s.idleLimit;
    inputs.in.input.thrust_limit_CLB_percent   = s.clbLimit;
    inputs.in.input.thrust_limit_MCT_percent   = s.clbLimit + 2.0;
    inputs.in.input.thrust_limit_TOGA_percent  = s.clbLimit + 5.0;
    inputs.in.input.thrust_limit_REV_percent   = 70.0;

    EngineStartThrottleHold::Output output{false, engine.commandedN1, 0.0};
    if (withHold) {
      output = hold.update({false, static_cast<double>(state), engine.commandedN1, s.idleLimit, loopTargetN1, dt, engine.n2, s.fbwIdleN2});
    }
    inputs.in.data.commanded_engine_N1_percent = output.loopCommandedN1;

    fadec.setExternalInputs(&inputs);
    fadec.step();
    loopTargetN1              = fadec.getExternalOutputs().out.output.N1_c_percent;
    const double loopThrottle = fadec.getExternalOutputs().out.output.sim_throttle_lever_pos;
    const double throttle     = std::min(99.9999999999999, EngineStartThrottleHold::simThrottle(output, loopThrottle));

    engine.step(throttle, dt);

    if (engine.running) {
      if (result.startEndTime < 0.0) {
        result.startEndTime = t;
      }
      result.maxN2AfterStartEnd = std::max(result.maxN2AfterStartEnd, engine.n2);
    }
    if (result.reachedOn) {
      result.maxN2AfterOn = std::max(result.maxN2AfterOn, engine.n2);
      if (output.throttleAtIdle) {
        result.heldAfterOnSeconds += dt;
      }
      const bool settled = std::fabs(engine.n2 - result.steadyN2) < 1.0;
      if (settled && result.settledAfterOn < 0.0) {
        result.settledAfterOn = t - result.onTime;
      } else if (!settled) {
        result.settledAfterOn = -1.0;
      }
    }
  }
  result.finalN2 = engine.n2;
  return result;
}

static void report(const char* name, const char* variant, const Result& r) {
  std::printf("%-44s %-22s ON %5.1f s (%4.1f s after the MSFS start end) | max N2 %6.1f %% (lever %5.1f %%) | settled %5.1f s after ON |"
              " held %4.1f s after ON\n",
              name, variant, r.onTime, r.onTime - r.startEndTime, r.maxN2AfterStartEnd, r.steadyN2, r.settledAfterOn,
              r.heldAfterOnSeconds);
}

static void checkScenario(const Scenario& s, double duration, double settleLimitSeconds) {
  for (const bool lag : {true, false}) {
    const char*  variant = lag ? "commanded N1 lag" : "no commanded N1 lag";
    const Result r       = run(s, lag, true, duration);
    report(s.name, variant, r);
    char what[200];
    std::snprintf(what, sizeof what, "%s, %s: the relight reaches ON", s.name, variant);
    expect(r.reachedOn, what, r.onTime);
    std::snprintf(what, sizeof what, "%s, %s: ON within 15 s of the MSFS start end", s.name, variant);
    expect(r.reachedOn && r.onTime - r.startEndTime <= 15.0, what, r.onTime - r.startEndTime);
    std::snprintf(what, sizeof what, "%s, %s: N2 never above the lever value after the start", s.name, variant);
    expect(r.maxN2AfterStartEnd <= r.steadyN2 + 1.0, what, r.maxN2AfterStartEnd);
    std::snprintf(what, sizeof what, "%s, %s: N2 settles at the lever value within %.0f s of ON", s.name, variant, settleLimitSeconds);
    expect(r.settledAfterOn >= 0.0 && r.settledAfterOn <= settleLimitSeconds, what, r.settledAfterOn);
  }
}

/**
 * Replay of the A32NX quick relight T2 of the sim test of 2026-10-05 (overshoot.log, engine 1, FL150 / 248 kt, lever CL with the
 * A/THR): ENG MASTER OFF at 441.2 s (SHUTTING), ON at 447.3 s (RESTARTING), FBW ON at 452.0 s. MSFS already commanded its idle N1
 * at throttle 0 (26.6 % against the idle limit 26.0-26.1 %) while the engine still turned fast, so the hold took the commanded N1 at
 * the RESTARTING for "idle reached" and let the loop drive the throttle during the start: 0.8 -> 59 % in 5 s, then N2 96.8 %
 * against about 90 % for the lever. The recorded inputs are fed to the hold at 30 frames per second, each sample held for its
 * 0.5 s; the hold is shared by both aircraft (the decision does not depend on the engine).
 */
static void replayA32nxQuickRelightT2() {
  struct Sample {
    double t;               // s
    double engineState;     // L:A32NX_ENGINE_STATE:1
    double coreSpeed;       // TURB ENG N2:1, percent
    double simCommandedN1;  // TURB ENG COMMANDED N1:1, percent
    double loopTargetN1;    // L:A32NX_AUTOTHRUST_N1_COMMANDED:1, percent
    double idleN1Limit;     // L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE, percent
    double loopThrottle;    // GENERAL ENG THROTTLE LEVER POSITION:1 as recorded (the loop throttle), percent
  };
  static constexpr double IDLE_CORE_SPEED = 66.6;  // L:A32NX_ENGINE_IDLE_N2 (recorded)
  static constexpr Sample SAMPLES[]       = {
      {440.7, 1, 92.7, 60.5, 58.6, 26.1, 45.9}, {441.2, 4, 92.3, 26.6, 58.6, 26.1, 0.0},  {441.7, 4, 87.8, 26.6, 58.7, 26.1, 0.0},
      {442.2, 4, 83.4, 26.6, 58.8, 26.1, 0.0},  {442.7, 4, 79.4, 26.6, 59.1, 26.1, 0.0},  {443.2, 4, 75.4, 26.6, 59.5, 26.1, 0.0},
      {443.7, 4, 71.6, 26.6, 60.2, 26.1, 0.0},  {444.2, 4, 68.0, 26.6, 61.1, 26.1, 0.0},  {444.7, 4, 64.5, 26.6, 61.7, 26.1, 0.0},
      {445.2, 4, 61.4, 26.6, 62.5, 26.1, 0.0},  {445.8, 4, 60.5, 26.6, 63.5, 26.0, 0.0},  {446.3, 4, 61.0, 26.6, 64.3, 26.0, 0.0},
      {446.8, 4, 61.5, 26.6, 65.1, 26.0, 0.0},  {447.3, 3, 62.0, 27.0, 66.0, 26.0, 0.8},  {447.8, 3, 62.5, 30.5, 67.0, 26.0, 7.1},
      {448.3, 3, 63.0, 35.4, 67.8, 26.0, 15.8}, {448.9, 3, 63.5, 40.9, 68.6, 26.0, 24.0}, {449.4, 3, 64.0, 46.6, 69.4, 26.0, 31.8},
      {449.9, 3, 64.5, 52.3, 70.2, 26.0, 37.3}, {450.4, 3, 65.0, 57.4, 71.2, 26.0, 41.7}, {450.9, 3, 65.5, 62.1, 71.9, 26.0, 47.7},
      {451.4, 3, 66.0, 67.8, 72.8, 26.0, 54.2}, {452.0, 1, 81.7, 73.1, 73.6, 26.0, 59.2}, {452.5, 1, 90.1, 74.9, 74.3, 26.0, 61.1},
      {453.0, 1, 93.1, 75.9, 74.9, 26.0, 62.1}, {453.5, 1, 94.6, 76.5, 75.1, 26.0, 62.7}, {454.0, 1, 95.6, 77.0, 75.4, 26.0, 63.3},
  };
  constexpr double FRAME = 1.0 / 30.0;

  EngineStartThrottleHold hold;
  int    restartingFrames         = 0;
  int    restartingFramesReleased = 0;
  double highestRestartingThrottle = 0.0;
  bool   releasedOnceOn            = false;
  for (const Sample& sample : SAMPLES) {
    for (int frame = 0; frame < 15; ++frame) {
      const EngineStartThrottleHold::Output output =
          hold.update({false, sample.engineState, sample.simCommandedN1, sample.idleN1Limit, sample.loopTargetN1, FRAME,
                       sample.coreSpeed, IDLE_CORE_SPEED});
      const double throttle = EngineStartThrottleHold::simThrottle(output, sample.loopThrottle);
      if (sample.engineState == EngineStartThrottleHold::ENGINE_STATE_RESTARTING) {
        ++restartingFrames;
        if (!output.throttleAtIdle) {
          ++restartingFramesReleased;
        }
        highestRestartingThrottle = std::max(highestRestartingThrottle, throttle);
      }
      if (sample.engineState == EngineStartThrottleHold::ENGINE_STATE_ON && sample.t > 450.0 && !output.throttleAtIdle) {
        releasedOnceOn = true;
      }
    }
  }
  std::printf("T2 replay (A32NX quick relight FL150, lever CL): %d of %d RESTARTING frames released, highest MSFS throttle %.1f %% "
              "while RESTARTING, released once ON: %s\n",
              restartingFramesReleased, restartingFrames, highestRestartingThrottle, releasedOnceOn ? "yes" : "no");
  expect(restartingFramesReleased == 0, "T2 replay: the hold keeps the engine at idle during the whole RESTARTING",
         restartingFramesReleased);
  expect(highestRestartingThrottle == 0.0, "T2 replay: MSFS throttle at idle while RESTARTING", highestRestartingThrottle);
  expect(releasedOnceOn, "T2 replay: released once ON with the commanded N1 at idle", 0.0);
}

int main() {
  // T1 of the sim test: quick relight at FL150 / 250 kt, thrust lever in CL (FBW idle N2 66.8 %, MSFS N2 limit 113.6 %).
  const Scenario t1{"T1 quick relight FL150, lever CL", 15000, 25.0, 30.0, 87.0, 66.8, 30.0, 72.0, 113.6, 66.0, 6.0, 61.0};
  // T2 of the sim test: windmill relight at FL265 / 279 kt, thrust lever at IDLE (FBW idle N2 65.6 %, MSFS idle N2 ~75.5 %,
  // N2 limit 110.7 %), engine out 30 s (relight N2 35 %).
  const Scenario t2{"T2 windmill relight FL265, lever IDLE", 26500, 0.0, 40.0, 88.0, 65.6, 40.0, 75.5, 110.7, 64.8, 30.0, 35.0};
  // The MSFS idle N1 at throttle 0 settles below the FBW idle limit: the commanded N1 never reaches it, the hold must still end.
  const Scenario t3{"MSFS idle N1 below the FBW idle limit, CL", 15000, 25.0, 30.0, 87.0, 66.8, 26.0, 72.0, 113.6, 66.0, 6.0, 61.0};
  // The MSFS idle N2 settles below the FBW idle N2: the FADEC never sees the start end at idle; the throttle must still be released.
  const Scenario t4{"MSFS idle N2 below the FBW idle N2, CL", 15000, 25.0, 30.0, 87.0, 66.8, 30.0, 65.0, 113.6, 64.5, 6.0, 61.0};
  // The start ends below the FBW idle: the MSFS idle N2 0.5 % / 1 % below the FBW idle N2 AND the MSFS idle N1 below the FBW idle
  // limit by more than the 1 % margin: neither the FADEC (ON at idle - 0.1) nor the idle N1 capture sees the start end; the
  // fallback must bring the engine to ON (lever CL and IDLE).
  const Scenario t5{"start ends 0.5 % below idle, CL", 15000, 25.0, 30.0, 87.0, 66.8, 28.0, 66.3, 113.6, 66.0, 6.0, 61.0};
  const Scenario t6{"start ends 1 % below idle, CL", 15000, 25.0, 30.0, 87.0, 66.8, 28.0, 65.8, 113.6, 65.5, 6.0, 61.0};
  const Scenario t7{"start ends 1 % below idle, IDLE", 15000, 0.0, 30.0, 87.0, 66.8, 28.0, 65.8, 113.6, 65.5, 6.0, 61.0};

  // The recorded behaviour without the hold: the loop winds the throttle up during the start and MSFS overshoots.
  {
    const Result r1 = run(t1, true, false, 40.0);
    const Result r2 = run(t2, true, false, 90.0);
    report(t1.name, "WITHOUT the hold", r1);
    report(t2.name, "WITHOUT the hold", r2);
    std::printf("(without the hold the model reproduces the recordings: N2 limit 113.6 %% at FL150 lever CL, 110.7 %% at FL265 "
                "lever IDLE)\n");
  }

  // Settled within 15 s of ON (idle reached, then the 5 s rise of the target); 20 s when the hold ends on its 10 s limit.
  checkScenario(t1, 40.0, 15.0);
  checkScenario(t2, 90.0, 15.0);
  checkScenario(t3, 50.0, EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 10.0);
  checkScenario(t4, 50.0, 15.0);
  // ON within 15 s of the MSFS start end (plateau 3 s, then the throttle rise), then the idle capture (at most 10 s) and the rise.
  checkScenario(t5, 60.0, EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 10.0);
  checkScenario(t6, 60.0, EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 10.0);
  checkScenario(t7, 60.0, EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 10.0);

  replayA32nxQuickRelightT2();

  {
    const Result r3 = run(t3, true, true, 50.0);
    expect(r3.heldAfterOnSeconds <= EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 0.1,
           "low MSFS idle N1: hold released within the idle stabilisation time", r3.heldAfterOnSeconds);
  }

  // The decision itself.
  {
    using Hold  = EngineStartThrottleHold;
    using Phase = EngineStartThrottleHold::Phase;
    // On the ground the thrust loop always drives the throttle (ground starts are unchanged).
    Hold ground;
    expect(!ground.update({true, STARTING, 0.0, 20.0, 20.0, 0.1, 0.0, 66.8}).throttleAtIdle, "ground start: no hold", 0.0);
    expect(ground.update({true, SHUTTING, 5.0, 20.0, 20.0, 0.1, 0.0, 66.8}).loopCommandedN1 == 5.0, "ground: loop input unchanged", 0.0);
    // A running engine in flight that did not just start (e.g. a spawn in flight), or OFF while the FADEC initialises: no hold.
    Hold running;
    expect(!running.update({false, ON, 60.0, 30.0, 80.0, 0.1, 0.0, 66.8}).throttleAtIdle, "flight, engine running: no hold", 0.0);
    expect(!running.update({false, OFF, 60.0, 30.0, 80.0, 0.1, 0.0, 66.8}).throttleAtIdle, "flight, FADEC initialising (OFF): no hold",
           0.0);
    // An engine out in flight (flameout, master OFF): held at idle, the loop sees an engine above any N1 target.
    Hold                  out;
    const Hold::Output    outOutput = out.update({false, SHUTTING, 0.0, 30.0, 80.0, 0.1, 0.0, 66.8});
    expect(outOutput.throttleAtIdle, "flight, engine out: hold", 0.0);
    expect(Hold::simThrottle(outOutput, 80.0) == 0.0, "flight, engine out: MSFS throttle at idle", 0.0);
    expect(outOutput.loopCommandedN1 > 150.0, "flight, engine out: loop commanded N1 above any target", outOutput.loopCommandedN1);
    expect(out.update({false, SHUTTING, 35.0, 30.0, 80.0, 0.1, 0.0, 66.8}).throttleAtIdle, "flight, engine out at idle N1: still held",
           0.0);
    // Starting, then started: held until the MSFS commanded N1 reaches the idle limit (1 % margin).
    expect(out.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 0.0, 66.8}).throttleAtIdle, "flight, relight: hold", 0.0);
    expect(out.update({false, ON, 10.0, 30.0, 80.0, 0.1, 0.0, 66.8}).throttleAtIdle, "flight, start just ended: hold until idle", 0.0);
    // Then the loop target is released from the idle reached at 10 %/s: the loop sees the target part not yet released.
    const Hold::Output accel = out.update({false, ON, 29.5, 30.0, 80.0, 0.1, 0.0, 66.8});
    expect(!accel.throttleAtIdle && out.currentPhase() == Phase::ACCELERATING, "flight, idle reached: accelerating", 0.0);
    expect(std::fabs(accel.loopCommandedN1 - (29.5 + (80.0 - 30.5))) < 1e-9, "flight, accelerating: loop sees the released target",
           accel.loopCommandedN1);
    for (int i = 0; i < 60; ++i) {
      out.update({false, ON, 60.0, 30.0, 80.0, 0.1, 0.0, 66.8});
    }
    expect(out.currentPhase() == Phase::NORMAL, "flight, target reached: normal", 0.0);
    expect(out.update({false, ON, 60.0, 30.0, 80.0, 0.1, 0.0, 66.8}).loopCommandedN1 == 60.0, "flight, normal: loop input unchanged", 0.0);
    // A lever at IDLE (target at or below the idle reached): straight to normal.
    Hold idle;
    idle.update({false, RESTARTING, 0.0, 40.0, 40.0, 0.1, 0.0, 66.8});
    idle.update({false, ON, 41.0, 40.0, 40.0, 0.1, 0.0, 66.8});
    expect(idle.currentPhase() == Phase::NORMAL, "flight, lever at IDLE: normal once idle is reached", 0.0);
    // A quick relight: MSFS already commands its idle N1 at throttle 0 while the engine still starts (sim test T2): held until ON.
    Hold quick;
    quick.update({false, SHUTTING, 26.6, 26.0, 60.0, 0.1, 80.0, 66.6});
    expect(quick.update({false, RESTARTING, 27.0, 26.0, 66.0, 0.1, 62.0, 66.6}).throttleAtIdle,
           "flight, quick relight, commanded N1 at idle while RESTARTING: still held", 0.0);
    expect(quick.currentPhase() == Phase::HOLD, "flight, quick relight while RESTARTING: phase HOLD", 0.0);
    expect(!quick.update({false, ON, 73.0, 26.0, 73.6, 0.1, 81.7, 66.6}).throttleAtIdle,
           "flight, quick relight, ON with the commanded N1 at idle: released", 0.0);
    // Fallback: a start that stops rising just below the FBW idle (here 63 % against 66.8 %) gets a slowly rising throttle after
    // 3 s, at most 15 %; none while the core speed still rises, nor far below the idle (windmilling).
    Hold plateau;
    plateau.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 30.0, 66.8});
    double core = 60.0;
    for (int i = 0; i < 30; ++i) {  // 3 s of start at 1 %/s: still rising
      core += 0.1;
      plateau.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, core, 66.8});
    }
    expect(plateau.fallbackThrottle() == 0.0, "fallback: none while the start still rises", plateau.fallbackThrottle());
    for (int i = 0; i < 25; ++i) {  // 2.5 s at 63 %: not yet a plateau
      plateau.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 63.0, 66.8});
    }
    expect(plateau.fallbackThrottle() == 0.0, "fallback: none before 3 s of plateau", plateau.fallbackThrottle());
    Hold::Output released{};
    for (int i = 0; i < 20; ++i) {  // 2 s more: the plateau is 3 s old within the last 0.5 % of rise, then 2 %/s
      released = plateau.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 63.0, 66.8});
    }
    expect(released.throttleAtIdle && released.loopCommandedN1 > 150.0, "fallback: the loop stays at its idle stop", 0.0);
    expect(released.minimumThrottle >= 2.0 && released.minimumThrottle <= 5.0, "fallback: throttle rises at 2 %/s",
           released.minimumThrottle);
    expect(Hold::simThrottle(released, 0.0) == released.minimumThrottle, "fallback: MSFS throttle raised", 0.0);
    for (int i = 0; i < 200; ++i) {
      plateau.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 63.0, 66.8});
    }
    expect(plateau.fallbackThrottle() == Hold::RELEASE_THROTTLE_MAX_PERCENT, "fallback: throttle limited", plateau.fallbackThrottle());
    expect(plateau.update({false, SHUTTING, 0.0, 30.0, 80.0, 0.1, 50.0, 66.8}).minimumThrottle == 0.0, "fallback: reset on engine out",
           0.0);
    Hold windmill;
    for (int i = 0; i < 300; ++i) {  // 30 s windmilling at 20 % before light-up
      windmill.update({false, RESTARTING, 0.0, 30.0, 80.0, 0.1, 20.0, 66.8});
    }
    expect(windmill.fallbackThrottle() == 0.0, "fallback: none while windmilling far below idle", windmill.fallbackThrottle());
  }

  if (failures == 0) {
    std::printf("engine_start_throttle_hold_test: all tests passed\n");
    return 0;
  }
  std::printf("engine_start_throttle_hold_test: %d failure(s)\n", failures);
  return 1;
}
