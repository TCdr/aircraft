// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the MSFS throttle during and after an in-flight engine start on the A380X
// (fbw-common/src/wasm/fbw_common/src/EngineStartThrottleHold.h, shared with the A32NX): run test/run_tests.sh.
//
// The three in-flight relights of the A380X sim test of 2026-10-05 (b1_inflight.log) all ended with the N3 at 97.5 % (the MSFS N2
// limit) for 5.1-6.7 s, levers in CL with the A/THR: engine 1 windmill relight at FL200/300 kt, engine 4 quick relight at
// FL150/240 kt, engine 3 crossbleed relight at FL150/210 kt. The thrust loop (the generated A380FadecComputer model, used here as it
// is) integrates the MSFS throttle until the MSFS commanded N1 meets the N1 target. The scenarios below close that loop over a small
// model of the MSFS engine and replay the three recorded relights, then the cases where the start ends just below the FBW idle.
//
// Build with -DWITHOUT_THE_FIX to run the same checks without the hold (they must fail: the recorded overshoot), and with
// -DWITHOUT_THE_FALLBACK without the fallback for a start that ends below the FBW idle (those scenarios must fail: never ON).

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "A380FadecComputer.h"
#include "EngineStartThrottleHold.h"

#ifdef WITHOUT_THE_FIX
static constexpr bool HOLD_IN_USE = false;
#else
static constexpr bool HOLD_IN_USE = true;
#endif

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

/// FBW engine states (L:A32NX_ENGINE_STATE, fadec_a380x EngineControl_A380X.h).
enum FbwEngineState { OFF = 0, ON = 1, STARTING = 2, RESTARTING = 3, SHUTTING = 4 };

/**
 * Corrected N3 against corrected N1 of the Trent 972: table 1502 of the MSFS engine (fadec_a380x Table1502_A380X.hpp, copied):
 * CN3, CN1 at Mach 0.2 (columns 1 and 2), CN1 at Mach 0.9 (column 3), linear in Mach.
 */
struct Table1502 {
  static constexpr int    ROWS               = 13;
  static constexpr double TABLE[ROWS][4]     = {
      {16.012, 0.000, 0.000, 17.000},   {19.355, 1.6253, 1.6253, 17.345}, {22.874, 2.1385, 2.1385, 18.127},
      {50.147, 10.949, 10.949, 26.627}, {60.000, 16.299, 16.299, 33.728}, {67.742, 22.240, 22.240, 40.082},
      {73.021, 26.877, 26.877, 43.854}, {78.299, 35.047, 35.047, 48.899}, {81.642, 43.625, 43.625, 53.557},
      {85.337, 63.107, 63.107, 63.107}, {87.977, 74.757, 74.757, 74.757}, {97.800, 97.200, 97.200, 97.200},
      {118.000, 115.347, 115.347, 115.347}};

  static double cn1(int row, double mach) { return TABLE[row][1] + (mach - 0.2) / 0.7 * (TABLE[row][3] - TABLE[row][1]); }

  /// CN3 for a CN1, piecewise linear (extended along the first and last segments).
  static double cn3FromCn1(double value, double mach) {
    int row = 1;
    while (row < ROWS - 1 && cn1(row, mach) < value) {
      ++row;
    }
    const double x0 = cn1(row - 1, mach), x1 = cn1(row, mach);
    return TABLE[row - 1][0] + (value - x0) / (x1 - x0) * (TABLE[row][0] - TABLE[row - 1][0]);
  }

  /// CN1 for a CN3 (the inverse, by bisection: cn3FromCn1 rises with CN1).
  static double cn1FromCn3(double value, double mach) {
    double low = 0.0, high = 130.0;
    for (int i = 0; i < 60; ++i) {
      const double middle = 0.5 * (low + high);
      (cn3FromCn1(middle, mach) < value ? low : high) = middle;
    }
    return 0.5 * (low + high);
  }
};

/**
 * A small model of the MSFS engine of the A380X, as far as the thrust loop sees it (the MSFS engine internals cannot be read
 * offline). The MSFS N2 is the Trent N3 (L:A32NX_ENGINE_N3 = TURB ENG N2 once the engine runs).
 * - A. While the engine is out and during its start, MSFS does not govern the engine to the throttle: the N2 follows the start
 *   (+1 %/s, as recorded: 41 -> 58 % in 17 s) and TURB ENG COMMANDED N1 does not answer the throttle (here 0).
 * - B. The MSFS start ends at N2 58.3 % (recorded: the last start sample before the jump), then MSFS governs the N1 to the
 *   throttle at once (N2 58 -> 97 % within 0.5-1 s in the recordings).
 * - C. With commandedN1Lag, the commanded N1 then climbs from 0 at 11 %/s before it follows the throttle (fitted to the recorded
 *   time with the N3 at 96 % or more: 6.7 s at FL200, 5.1-5.6 s at FL150; the A32NX recordings gave about 14 %/s). Without it, it
 *   follows the throttle at once.
 * - D. N2 from N1: the table 1502 above with N1 = CN1 * sqrt(theta2) and N3 = CN3 * sqrt(theta), limited to the recorded 97.5 %;
 *   throttle 0 gives the MSFS idle N1, throttle 100 gives N1 105 % (so that full throttle reaches the recorded limit). n3Offset
 *   moves the MSFS curve against the FBW one (MSFS idle a little below the FBW idle in the "start ends below idle" cases).
 * - E. With commandedN1WhileStarting, TURB ENG COMMANDED N1 answers the throttle while the engine is out or starting (as recorded on
 *   the A32NX quick relight T2 of 2026-10-05, overshoot.log: 26.6 % at throttle 0 = the idle limit, then 27 -> 68 % while the
 *   throttle rose 1 -> 54 % during the RESTARTING). Not recorded on the A380X yet: the same MSFS engine model is assumed.
 */
struct MsfsEngineModel {
  double mach;
  double sqrtTheta;   // N3 = CN3 * sqrtTheta
  double sqrtTheta2;  // N1 = CN1 * sqrtTheta2
  double idleN1;      // MSFS N1 at throttle 0, percent
  double n3Offset;    // MSFS N3 against the FBW table, percent
  double n2;          // current N2, percent
  bool   commandedN1Lag;
  bool   commandedN1WhileStarting = false;  // see E. above
  bool   running       = false;
  bool   starting      = false;
  double sinceStartEnd = 0.0;
  double n1            = 0.0;
  double commandedN1   = 0.0;

  static constexpr double MAX_N1                                   = 105.0;
  static constexpr double MAX_N2                                   = 97.5;
  static constexpr double START_END_N2                             = 58.3;
  static constexpr double START_N2_RATE_PERCENT_PER_SECOND         = 1.0;
  static constexpr double COMMANDED_N1_RECOVERY_PERCENT_PER_SECOND = 11.0;
  static constexpr double N1_TIME_CONSTANT_SECONDS                 = 0.4;

  double n1Demand(double throttle) const { return idleN1 + (throttle / 100.0) * (MAX_N1 - idleN1); }
  double n2FromN1(double value) const {
    return std::min(MAX_N2, Table1502::cn3FromCn1(value / sqrtTheta2, mach) * sqrtTheta + n3Offset);
  }
  double idleN2() const { return n2FromN1(idleN1); }
  double n1FromN2(double value) const { return value <= idleN2() ? idleN1 * value / idleN2() : idleN1; }

  void step(double throttle, double dt) {
    if (!running) {
      if (starting) {
        n2 += START_N2_RATE_PERCENT_PER_SECOND * dt;
        if (n2 >= START_END_N2) {
          running       = true;
          sinceStartEnd = 0.0;
        }
      }
      n1          = n1FromN2(n2);
      commandedN1 = commandedN1WhileStarting ? n1Demand(throttle) : 0.0;
      return;
    }
    sinceStartEnd += dt;
    n1 += (n1Demand(throttle) - n1) * (1.0 - std::exp(-dt / N1_TIME_CONSTANT_SECONDS));
    n2          = n2FromN1(n1);
    commandedN1 = commandedN1Lag ? std::min(n1Demand(throttle), COMMANDED_N1_RECOVERY_PERCENT_PER_SECOND * sinceStartEnd)
                                 : n1Demand(throttle);
  }
};

/// One in-flight relight (ISA). The recordings hold no N1: the FBW idle N1 limit and the A/THR N1 target are derived from the
/// recorded FBW idle N3 and steady N3 through the table 1502, as the FBW FADEC derives its idle N1 (Table1502_A380X::iCN1).
struct Scenario {
  const char* name;
  double      altitudeFeet;
  double      iasKnots;
  double      mach;
  double      theta;            // ambient temperature ratio
  double      tlaDeg;           // 0 = IDLE, 25 = CL
  double      fbwIdleN3;        // FBW idle N3 (A32NX_ENGINE_IDLE_N3, recorded): the FADEC goes ON at idle N3 - 0.1
  double      steadyN3;         // recorded N3 once settled with the levers in CL and the A/THR
  double      msfsIdleN3Below;  // MSFS idle N3 at throttle 0 below the FBW idle N3, percent
  double      msfsIdleN1Below;  // MSFS idle N1 at throttle 0 below the FBW idle N1 limit, percent
  double      outSeconds;       // engine out (SHUTTING) before the relight starts (RESTARTING)
  double      relightN2;        // MSFS N2 when the relight starts
  bool        commandedN1WhileStarting = false;  // MsfsEngineModel E.
  bool        compressorStall          = false;  // the flyPad compressor stall failure is active (CompressorStallModel)

  double sqrtTheta() const { return std::sqrt(theta); }
  double sqrtTheta2() const { return std::sqrt(theta * (1.0 + 0.2 * mach * mach)); }
  double n1ForN3(double n3) const { return Table1502::cn1FromCn3(n3 / sqrtTheta(), mach) * sqrtTheta2(); }
  double idleLimit() const { return n1ForN3(fbwIdleN3); }
  double clbLimit() const { return n1ForN3(steadyN3); }  // the A/THR N1 target, given to the model as its CLB limit (lever in CL)
  MsfsEngineModel engine(bool commandedN1Lag, double startN2) const {
    const double msfsIdleN1 = idleLimit() - msfsIdleN1Below;
    const double offset = (fbwIdleN3 - msfsIdleN3Below) - Table1502::cn3FromCn1(msfsIdleN1 / sqrtTheta2(), mach) * sqrtTheta();
    return MsfsEngineModel{mach, sqrtTheta(), sqrtTheta2(), msfsIdleN1, offset, startN2, commandedN1Lag, commandedN1WhileStarting};
  }
};

struct Result {
  bool   reachedOn          = false;
  double onTime             = 0.0;
  double startEndTime       = -1.0;  // the MSFS start ends (MSFS governs the engine)
  double maxN2AfterStartEnd = 0.0;
  double secondsAtLimit     = 0.0;   // seconds with the N2 at 96 % or more
  double heldAfterOnSeconds = 0.0;
  double settledAfterOn     = -1.0;  // seconds from ON until N2 stays within 1 % of the lever value
  double steadyN2           = 0.0;   // the N2 for the lever position once settled
  double throttleBeforeOn   = 0.0;   // the highest MSFS throttle while RESTARTING, percent
  double releaseCommandedN1 = -1.0;  // the MSFS commanded N1 (without the stall loss) when the hold released the throttle, percent
};

/**
 * The compressor stall failure as the systems WASM computes it (fbw-common engine_malfunction.rs with the A380 values of
 * a380_systems engine_malfunction.rs, copied): the engine stalls once the FADEC reports it running (ENGINE_STATE ON) while its N1
 * command (A32NX_AUTOTHRUST_N1_COMMANDED = the loop N1 target) is at or above 60 %, and recovers below 57 %. The stall intensity
 * follows with a 1 s (onset) / 3 s (recovery) time constant; the N1 loss (ENGINE_n_STALL_N1_LOSS) is 15 % at full intensity, and
 * FlyByWireInterface adds it to the MSFS commanded N1 given to the thrust loop and to the hold.
 */
struct CompressorStallModel {
  static constexpr double THRESHOLD_N1_PERCENT = 60.0;
  static constexpr double HYSTERESIS_PERCENT   = 3.0;
  static constexpr double N1_LOSS_PERCENT      = 15.0;
  static constexpr double ONSET_SECONDS        = 1.0;
  static constexpr double RECOVERY_SECONDS     = 3.0;

  bool   stalled   = false;
  double intensity = 0.0;

  /// @return the N1 loss of this frame, percent.
  double update(bool engineOn, double commandedN1, double dt) {
    stalled = engineOn && (stalled ? commandedN1 >= THRESHOLD_N1_PERCENT - HYSTERESIS_PERCENT : commandedN1 >= THRESHOLD_N1_PERCENT);
    const double target       = stalled ? 1.0 : 0.0;
    const double timeConstant = stalled ? ONSET_SECONDS : RECOVERY_SECONDS;
    intensity += (target - intensity) * (1.0 - std::exp(-dt / timeConstant));
    return intensity * N1_LOSS_PERCENT;
  }
};

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

/// Fills the inputs of the thrust loop for one frame.
static void setLoopInputs(A380FadecComputer::ExternalInputs_A380FadecComputer_T& inputs, const Scenario& s, double t, bool onGround,
                          const MsfsEngineModel& engine, double tlaDeg) {
  inputs.in.time.dt                         = FRAME_SECONDS;
  inputs.in.time.simulation_time            = t;
  inputs.in.data.on_ground                  = onGround;
  inputs.in.data.V_ias_kn                   = onGround ? 0.0 : s.iasKnots;
  inputs.in.data.H_ft                       = s.altitudeFeet;
  inputs.in.data.is_engine_operative        = engine.running;
  inputs.in.data.engine_N1_percent          = engine.n1;
  inputs.in.input.TLA_deg                   = tlaDeg;
  inputs.in.input.thrust_limit_IDLE_percent = s.idleLimit();
  inputs.in.input.thrust_limit_CLB_percent  = s.clbLimit();
  inputs.in.input.thrust_limit_MCT_percent  = s.clbLimit() + 2.0;
  inputs.in.input.thrust_limit_FLEX_percent = s.clbLimit() + 3.0;
  inputs.in.input.thrust_limit_TOGA_percent = s.clbLimit() + 5.0;
  inputs.in.input.thrust_limit_REV_percent  = 70.0;
}

/// An in-flight relight: engine out, relight (RESTARTING), FADEC ON once the MSFS N2 reaches the FBW idle N3 - 0.1.
static Result runRelight(const Scenario& s, bool commandedN1Lag, bool withHold, double durationSeconds) {
  A380FadecComputer fadec;
  fadec.initialize();
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};

  MsfsEngineModel         engine = s.engine(commandedN1Lag, s.relightN2);
  EngineStartThrottleHold hold(holdParameters());

  Result result;
  const double leverN1 = s.tlaDeg <= 0.0 ? s.idleLimit() : s.clbLimit();
  // a stalled engine settles at its N1 target minus the stall loss (the stall lasts while the target stays above 57 %)
  const bool   stallsAtLever = s.compressorStall && leverN1 >= CompressorStallModel::THRESHOLD_N1_PERCENT;
  const double settledN1     = stallsAtLever ? leverN1 - CompressorStallModel::N1_LOSS_PERCENT : leverN1;
  result.steadyN2            = engine.n2FromN1(std::max(settledN1, engine.idleN1));

  CompressorStallModel stall;
  FbwEngineState       state        = SHUTTING;
  double               loopTargetN1 = 0.0;
  bool                 heldBefore   = false;
  for (double t = 0.0; t < durationSeconds; t += FRAME_SECONDS) {
    if (state == SHUTTING && t >= s.outSeconds) {
      state           = RESTARTING;
      engine.starting = true;
    }
    // fadec_a380x engineStateMachine: STARTING/RESTARTING -> ON once the MSFS N2 (sim N3) reaches the FBW idle N3 - 0.1.
    if (state == RESTARTING && engine.n2 >= s.fbwIdleN3 - 0.1) {
      state            = ON;
      result.reachedOn = true;
      result.onTime    = t;
    }

    setLoopInputs(inputs, s, t, false, engine, s.tlaDeg);
    // FlyByWireInterface: the stall N1 loss is added to the MSFS commanded N1 that the loop and the hold get
    const double stallN1Loss    = s.compressorStall ? stall.update(state == ON, loopTargetN1, FRAME_SECONDS) : 0.0;
    const double loopFeedbackN1 = engine.commandedN1 + stallN1Loss;
#ifdef WITHOUT_THE_STALL_FIX
    const double holdStallN1Loss = 0.0;  // the hold takes the whole feedback for engine speed
#else
    const double holdStallN1Loss = stallN1Loss;
#endif
    EngineStartThrottleHold::Output output{false, loopFeedbackN1, 0.0};
    if (withHold) {
      output = hold.update({false, static_cast<double>(state), loopFeedbackN1, s.idleLimit(), loopTargetN1, FRAME_SECONDS, engine.n2,
                            s.fbwIdleN3, holdStallN1Loss});
    }
    inputs.in.data.commanded_engine_N1_percent = output.loopCommandedN1;
    if (heldBefore && !output.throttleAtIdle && result.releaseCommandedN1 < 0.0) {
      result.releaseCommandedN1 = engine.commandedN1;
    }
    heldBefore = output.throttleAtIdle;

    fadec.setExternalInputs(&inputs);
    fadec.step();
    loopTargetN1              = fadec.getExternalOutputs().out.output.N1_c_percent;
    const double loopThrottle = fadec.getExternalOutputs().out.output.sim_throttle_lever_pos;
    const double throttle     = std::min(99.9999999999999, EngineStartThrottleHold::simThrottle(output, loopThrottle));

    engine.step(throttle, FRAME_SECONDS);
    if (state == RESTARTING) {
      result.throttleBeforeOn = std::max(result.throttleBeforeOn, throttle);
    }

    if (engine.running) {
      if (result.startEndTime < 0.0) {
        result.startEndTime = t;
      }
      result.maxN2AfterStartEnd = std::max(result.maxN2AfterStartEnd, engine.n2);
      if (engine.n2 >= 96.0) {
        result.secondsAtLimit += FRAME_SECONDS;
      }
    }
    if (result.reachedOn) {
      if (output.throttleAtIdle) {
        result.heldAfterOnSeconds += FRAME_SECONDS;
      }
      const bool settled = std::fabs(engine.n2 - result.steadyN2) < 1.0;
      if (settled && result.settledAfterOn < 0.0) {
        result.settledAfterOn = t - result.onTime;
      } else if (!settled) {
        result.settledAfterOn = -1.0;
      }
    }
  }
  return result;
}

/// A running engine whose thrust lever moves IDLE -> CL -> IDLE (in flight), or a start on the ground (STARTING -> ON): returns
/// the largest difference of the MSFS throttle between the runs with and without the hold.
static double throttleDifference(const Scenario& s, bool onGround) {
  static double throttles[2][3000] = {};
  for (int variant = 0; variant < 2; ++variant) {
    A380FadecComputer fadec;
    fadec.initialize();
    A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
    MsfsEngineModel         engine = s.engine(true, onGround ? 20.0 : 0.0);
    EngineStartThrottleHold hold(holdParameters());
    engine.running      = !onGround;
    engine.starting     = onGround;
    if (!onGround) {
      engine.n2 = engine.idleN2();
    }
    engine.n1            = engine.n1FromN2(engine.n2);
    engine.commandedN1   = onGround ? 0.0 : engine.n1;
    FbwEngineState state = onGround ? STARTING : ON;
    double loopTargetN1  = 0.0;
    for (int frame = 0; frame < 3000; ++frame) {
      const double t = frame * FRAME_SECONDS;
      if (state == STARTING && engine.n2 >= s.fbwIdleN3 - 0.1) {
        state = ON;
      }
      const double tlaDeg = onGround ? 0.0 : (t >= 10.0 && t < 60.0 ? 25.0 : 0.0);
      setLoopInputs(inputs, s, t, onGround, engine, tlaDeg);
      EngineStartThrottleHold::Output output{false, engine.commandedN1, 0.0};
      if (variant == 1) {
        output = hold.update({onGround, static_cast<double>(state), engine.commandedN1, s.idleLimit(), loopTargetN1, FRAME_SECONDS,
                              engine.n2, s.fbwIdleN3});
      }
      inputs.in.data.commanded_engine_N1_percent = output.loopCommandedN1;
      fadec.setExternalInputs(&inputs);
      fadec.step();
      loopTargetN1              = fadec.getExternalOutputs().out.output.N1_c_percent;
      const double loopThrottle = fadec.getExternalOutputs().out.output.sim_throttle_lever_pos;
      const double throttle     = std::min(99.9999999999999, EngineStartThrottleHold::simThrottle(output, loopThrottle));
      throttles[variant][frame] = throttle;
      engine.step(throttle, FRAME_SECONDS);
    }
  }
  double largest = 0.0;
  for (int frame = 0; frame < 3000; ++frame) {
    largest = std::max(largest, std::fabs(throttles[0][frame] - throttles[1][frame]));
  }
  return largest;
}

static void report(const char* name, const char* variant, const Result& r) {
  std::printf("%-44s %-20s ON %5.1f s (%4.1f s after start end) | max N3 %5.1f %% (lever %5.1f %%) | %3.1f s >= 96 %% | settled %5.1f s"
              " after ON | held %4.1f s after ON\n",
              name, variant, r.onTime, r.onTime - r.startEndTime, r.maxN2AfterStartEnd, r.steadyN2, r.secondsAtLimit,
              r.settledAfterOn, r.heldAfterOnSeconds);
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

/**
 * Replay of the A380X flight of the sim test of 2026-10-05 in which all four engines flamed out at once (overshoot.log, engines 1
 * and 4; flight loaded in the air at FL050 / 267 kt at 657 s, engines running, normal climb, all four out at 703.8 s at 7 870 ft /
 * 239 kt with throttle 82 % and N1 85.8 %, FBW state still ON, no fuel cut). The engines were running and never out or starting
 * for the FADEC (OFF while the FADEC initialised after the spawn, then ON): the hold must be transparent for the whole flight, up
 * to and after the flameout, i.e. give the thrust loop the MSFS commanded N1 unchanged and the MSFS the loop throttle unchanged.
 * This shows that the fbw.wasm changes (hold + TURB ENG N2 read) did not touch the MSFS engines in that flight.
 */
static void replayA380xAllEngineFlameoutFlight() {
  struct EngineSample {
    double engineState;     // L:A32NX_ENGINE_STATE:n
    double coreSpeed;       // TURB ENG N2:n, percent
    double simCommandedN1;  // TURB ENG COMMANDED N1:n, percent
    double loopTargetN1;    // L:A32NX_AUTOTHRUST_N1_COMMANDED:n, percent
    double loopThrottle;    // GENERAL ENG THROTTLE LEVER POSITION:n as recorded, percent
    double combustion;      // GENERAL ENG COMBUSTION:n
  };
  struct Sample {
    double       t;              // s
    double       onGround;       // SIM ON GROUND
    double       idleN1Limit;    // L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE, percent
    double       idleCoreSpeed;  // L:A32NX_ENGINE_IDLE_N3, percent
    EngineSample engines[2];     // engines 1 and 4
  };
  static constexpr Sample SAMPLES[] = {
      {657.3, 0.0, 0.0, 0.0, {{0.0, 96.0, 30.4, 0.0, 17.3, 1.0}, {0.0, 96.0, 30.4, 0.0, 17.3, 1.0}}},
      {657.8, 0.0, 0.0, 0.0, {{0.0, 84.3, 30.4, 0.0, 17.3, 1.0}, {0.0, 84.3, 30.4, 0.0, 17.3, 1.0}}},
      {658.3, 0.0, 0.0, 0.0, {{0.0, 78.4, 30.4, 0.0, 17.3, 1.0}, {0.0, 78.4, 30.4, 0.0, 17.3, 1.0}}},
      {658.8, 0.0, 0.0, 0.0, {{0.0, 73.2, 30.4, 0.0, 17.3, 1.0}, {0.0, 73.2, 30.4, 0.0, 17.3, 1.0}}},
      {659.4, 0.0, 0.0, 0.0, {{0.0, 69.7, 30.4, 0.0, 17.3, 1.0}, {0.0, 69.7, 30.4, 0.0, 17.3, 1.0}}},
      {659.9, 0.0, 0.0, 0.0, {{0.0, 68.3, 30.4, 0.0, 17.3, 1.0}, {0.0, 68.3, 30.4, 0.0, 17.3, 1.0}}},
      {660.4, 0.0, 0.0, 0.0, {{0.0, 67.6, 30.4, 0.0, 17.3, 1.0}, {0.0, 67.6, 30.4, 0.0, 17.3, 1.0}}},
      {660.9, 0.0, 0.0, 0.0, {{0.0, 67.4, 30.3, 0.0, 17.3, 1.0}, {0.0, 67.4, 30.3, 0.0, 17.3, 1.0}}},
      {661.4, 0.0, 0.0, 0.0, {{0.0, 67.0, 30.3, 0.0, 17.3, 1.0}, {0.0, 67.0, 30.3, 0.0, 17.3, 1.0}}},
      {661.9, 0.0, 0.0, 0.0, {{0.0, 66.9, 30.3, 0.0, 17.3, 1.0}, {0.0, 66.9, 30.3, 0.0, 17.3, 1.0}}},
      {662.4, 0.0, 0.0, 0.0, {{0.0, 67.0, 30.3, 0.0, 17.3, 1.0}, {0.0, 67.0, 30.3, 0.0, 17.3, 1.0}}},
      {662.9, 0.0, 0.0, 0.0, {{0.0, 67.1, 30.3, 0.0, 17.3, 1.0}, {0.0, 67.1, 30.3, 0.0, 17.3, 1.0}}},
      {663.4, 0.0, 0.0, 0.0, {{0.0, 67.3, 30.3, 0.0, 17.3, 1.0}, {0.0, 67.3, 30.3, 0.0, 17.3, 1.0}}},
      {663.9, 0.0, 24.2, 61.8, {{1.0, 67.4, 22.7, 24.2, 2.4, 1.0}, {1.0, 67.4, 22.7, 24.2, 2.3, 1.0}}},
      {664.5, 0.0, 24.1, 61.8, {{1.0, 67.3, 23.8, 24.1, 4.4, 1.0}, {1.0, 67.3, 23.8, 24.1, 4.5, 1.0}}},
      {665.0, 0.0, 24.1, 61.8, {{1.0, 67.1, 24.0, 24.1, 4.9, 1.0}, {1.0, 67.1, 24.0, 24.1, 4.9, 1.0}}},
      {665.5, 0.0, 24.1, 61.8, {{1.0, 66.8, 24.1, 24.1, 5.0, 1.0}, {1.0, 66.8, 24.1, 24.1, 5.0, 1.0}}},
      {666.0, 0.0, 24.1, 61.8, {{1.0, 65.8, 24.1, 24.1, 5.1, 1.0}, {1.0, 65.8, 24.1, 24.1, 5.1, 1.0}}},
      {666.5, 0.0, 24.1, 61.8, {{1.0, 64.6, 24.1, 24.1, 5.1, 1.0}, {1.0, 64.6, 24.1, 24.1, 5.1, 1.0}}},
      {667.0, 0.0, 24.1, 61.8, {{1.0, 63.1, 24.1, 24.1, 5.1, 1.0}, {1.0, 63.1, 24.1, 24.1, 5.1, 1.0}}},
      {667.5, 0.0, 24.1, 61.8, {{1.0, 63.0, 35.4, 48.3, 27.9, 1.0}, {1.0, 62.4, 24.0, 24.1, 5.0, 1.0}}},
      {668.0, 0.0, 24.1, 61.8, {{1.0, 64.1, 73.3, 84.6, 75.0, 1.0}, {1.0, 62.0, 24.0, 24.1, 5.0, 1.0}}},
      {668.5, 0.0, 24.1, 61.8, {{1.0, 65.9, 83.4, 84.5, 86.0, 1.0}, {1.0, 62.4, 24.0, 24.1, 5.0, 1.0}}},
      {669.1, 0.0, 24.1, 61.8, {{1.0, 74.6, 84.4, 84.6, 87.2, 1.0}, {1.0, 62.7, 24.0, 24.1, 5.1, 1.0}}},
      {669.6, 0.0, 24.0, 61.8, {{1.0, 86.2, 84.5, 84.6, 87.2, 1.0}, {1.0, 62.3, 24.0, 24.0, 5.1, 1.0}}},
      {670.1, 0.0, 24.0, 61.8, {{1.0, 87.9, 46.2, 41.0, 45.0, 1.0}, {1.0, 62.2, 24.0, 24.0, 5.1, 1.0}}},
      {670.6, 0.0, 24.0, 61.8, {{1.0, 81.8, 39.9, 38.6, 35.9, 1.0}, {1.0, 62.5, 24.0, 24.0, 5.1, 1.0}}},
      {671.1, 0.0, 24.0, 61.8, {{1.0, 80.6, 37.6, 36.2, 32.0, 1.0}, {1.0, 62.8, 28.8, 36.4, 14.7, 1.0}}},
      {671.6, 0.0, 24.0, 61.8, {{1.0, 79.3, 35.1, 33.6, 27.6, 1.0}, {1.0, 63.7, 33.2, 33.8, 24.2, 1.0}}},
      {672.1, 0.0, 24.0, 61.8, {{1.0, 78.1, 32.5, 30.9, 22.9, 1.0}, {1.0, 64.7, 32.3, 31.1, 22.4, 1.0}}},
      {672.6, 0.0, 24.0, 61.8, {{1.0, 77.0, 30.6, 28.7, 18.2, 1.0}, {1.0, 65.5, 30.5, 28.9, 18.1, 1.0}}},
      {673.1, 0.0, 24.0, 61.8, {{1.0, 75.4, 27.8, 26.0, 12.5, 1.0}, {1.0, 66.3, 27.8, 26.1, 12.5, 1.0}}},
      {673.7, 0.0, 24.0, 61.8, {{1.0, 73.8, 25.2, 24.0, 7.4, 1.0}, {1.0, 67.0, 25.1, 24.0, 7.3, 1.0}}},
      {674.2, 0.0, 24.0, 61.8, {{1.0, 72.8, 24.3, 24.0, 5.7, 1.0}, {1.0, 67.3, 24.2, 24.0, 5.6, 1.0}}},
      {674.7, 0.0, 24.0, 61.8, {{1.0, 71.7, 24.0, 24.0, 5.2, 1.0}, {1.0, 67.4, 24.0, 24.0, 5.2, 1.0}}},
      {675.2, 0.0, 24.0, 61.8, {{1.0, 70.7, 24.0, 24.0, 5.1, 1.0}, {1.0, 67.4, 24.0, 24.0, 5.1, 1.0}}},
      {675.7, 0.0, 24.0, 61.8, {{1.0, 69.6, 24.0, 24.0, 5.1, 1.0}, {1.0, 67.2, 24.0, 24.0, 5.1, 1.0}}},
      {676.2, 0.0, 24.0, 61.8, {{1.0, 68.7, 24.1, 24.5, 5.3, 1.0}, {1.0, 67.0, 24.0, 24.4, 5.2, 1.0}}},
      {676.7, 0.0, 24.0, 61.8, {{1.0, 66.9, 25.1, 26.1, 7.3, 1.0}, {1.0, 66.7, 25.1, 26.0, 7.2, 1.0}}},
      {677.2, 0.0, 24.0, 61.8, {{1.0, 65.1, 26.7, 28.0, 10.3, 1.0}, {1.0, 65.3, 26.7, 27.9, 10.3, 1.0}}},
      {677.7, 0.0, 24.0, 61.8, {{1.0, 65.1, 28.7, 30.3, 14.5, 1.0}, {1.0, 65.1, 28.7, 30.2, 14.5, 1.0}}},
      {678.2, 0.0, 24.0, 61.8, {{1.0, 65.3, 31.0, 32.7, 19.2, 1.0}, {1.0, 65.4, 31.0, 32.6, 19.2, 1.0}}},
      {678.7, 0.0, 24.0, 61.9, {{1.0, 65.7, 33.1, 35.0, 24.3, 1.0}, {1.0, 65.7, 33.2, 34.9, 24.3, 1.0}}},
      {679.2, 0.0, 23.9, 61.9, {{1.0, 66.2, 35.6, 37.1, 28.6, 1.0}, {1.0, 66.2, 35.6, 36.9, 28.6, 1.0}}},
      {679.8, 0.0, 23.9, 61.9, {{1.0, 66.8, 37.7, 39.0, 32.3, 1.0}, {1.0, 66.8, 37.7, 38.9, 32.3, 1.0}}},
      {680.3, 0.0, 23.9, 61.9, {{1.0, 67.4, 39.3, 40.5, 35.1, 1.0}, {1.0, 67.4, 39.3, 40.3, 35.1, 1.0}}},
      {680.8, 0.0, 23.9, 61.9, {{1.0, 70.1, 41.5, 42.0, 37.6, 1.0}, {1.0, 70.0, 41.5, 41.9, 37.7, 1.0}}},
      {681.3, 0.0, 23.9, 61.9, {{1.0, 73.6, 42.4, 42.7, 38.6, 1.0}, {1.0, 73.5, 42.4, 42.6, 38.7, 1.0}}},
      {681.8, 0.0, 23.9, 61.9, {{1.0, 75.9, 42.9, 43.1, 39.2, 1.0}, {1.0, 75.8, 42.9, 43.1, 39.2, 1.0}}},
      {682.3, 0.0, 23.9, 61.9, {{1.0, 77.3, 43.4, 43.7, 39.8, 1.0}, {1.0, 77.3, 43.4, 43.6, 39.8, 1.0}}},
      {682.8, 0.0, 23.8, 61.9, {{1.0, 78.2, 43.8, 44.2, 40.4, 1.0}, {1.0, 78.2, 43.8, 44.1, 40.4, 1.0}}},
      {683.3, 0.0, 23.8, 61.9, {{1.0, 78.9, 44.3, 44.7, 41.3, 1.0}, {1.0, 78.9, 44.3, 44.6, 41.3, 1.0}}},
      {683.8, 0.0, 23.8, 61.9, {{1.0, 80.3, 45.9, 46.2, 44.5, 1.0}, {1.0, 80.3, 45.9, 46.1, 44.5, 1.0}}},
      {684.3, 0.0, 23.7, 61.9, {{1.0, 81.4, 48.3, 48.3, 47.7, 1.0}, {1.0, 81.4, 48.3, 48.2, 47.7, 1.0}}},
      {684.8, 0.0, 23.6, 61.9, {{1.0, 82.4, 50.4, 50.3, 49.7, 1.0}, {1.0, 82.4, 50.4, 50.2, 49.7, 1.0}}},
      {685.3, 0.0, 23.6, 61.9, {{1.0, 82.9, 52.5, 52.2, 51.8, 1.0}, {1.0, 82.9, 52.5, 52.1, 51.8, 1.0}}},
      {685.9, 0.0, 23.6, 61.9, {{1.0, 83.4, 54.7, 54.4, 53.9, 1.0}, {1.0, 83.3, 54.6, 54.3, 53.9, 1.0}}},
      {686.4, 0.0, 23.6, 61.9, {{1.0, 83.9, 56.9, 56.5, 56.1, 1.0}, {1.0, 83.9, 56.8, 56.3, 56.0, 1.0}}},
      {686.9, 0.0, 23.6, 62.0, {{1.0, 84.3, 58.9, 58.5, 58.1, 1.0}, {1.0, 84.3, 58.9, 58.4, 58.1, 1.0}}},
      {687.4, 0.0, 23.6, 61.9, {{1.0, 84.8, 60.9, 60.6, 60.1, 1.0}, {1.0, 84.8, 60.9, 60.4, 60.2, 1.0}}},
      {687.9, 0.0, 23.6, 61.9, {{1.0, 85.2, 62.7, 62.3, 62.1, 1.0}, {1.0, 85.2, 62.7, 62.2, 62.1, 1.0}}},
      {688.4, 0.0, 23.6, 61.9, {{1.0, 85.7, 65.1, 64.7, 64.8, 1.0}, {1.0, 85.7, 65.0, 64.5, 64.7, 1.0}}},
      {688.9, 0.0, 23.6, 61.9, {{1.0, 86.0, 66.2, 65.9, 66.1, 1.0}, {1.0, 86.0, 66.2, 65.7, 66.1, 1.0}}},
      {689.4, 0.0, 23.6, 61.9, {{1.0, 86.5, 68.8, 68.7, 68.9, 1.0}, {1.0, 86.6, 68.4, 68.6, 68.5, 1.0}}},
      {689.9, 0.0, 23.7, 61.9, {{1.0, 87.0, 71.0, 70.7, 71.4, 1.0}, {1.0, 87.0, 70.9, 70.6, 71.3, 1.0}}},
      {690.5, 0.0, 23.7, 61.9, {{1.0, 87.6, 73.2, 72.9, 73.9, 1.0}, {1.0, 87.6, 73.7, 72.7, 74.4, 1.0}}},
      {691.0, 0.0, 23.7, 61.9, {{1.0, 87.9, 75.3, 74.9, 75.9, 1.0}, {1.0, 87.9, 75.1, 74.7, 75.7, 1.0}}},
      {691.5, 0.0, 23.7, 61.9, {{1.0, 88.7, 77.7, 76.9, 78.5, 1.0}, {1.0, 88.7, 77.6, 76.8, 78.5, 1.0}}},
      {692.0, 0.0, 23.8, 61.9, {{1.0, 89.7, 80.0, 78.9, 81.1, 1.0}, {1.0, 89.7, 80.0, 78.8, 81.0, 1.0}}},
      {692.5, 0.0, 23.8, 61.9, {{1.0, 90.7, 82.3, 81.0, 83.4, 1.0}, {1.0, 90.7, 82.1, 80.9, 83.2, 1.0}}},
      {693.0, 0.0, 23.8, 61.9, {{1.0, 91.6, 84.4, 83.1, 85.5, 1.0}, {1.0, 91.6, 84.4, 83.0, 85.5, 1.0}}},
      {693.6, 0.0, 23.8, 61.9, {{1.0, 92.5, 86.2, 84.8, 87.1, 1.0}, {1.0, 92.5, 86.3, 84.8, 87.2, 1.0}}},
      {694.1, 0.0, 23.9, 61.9, {{1.0, 92.4, 84.9, 84.9, 85.4, 1.0}, {1.0, 92.4, 84.7, 84.9, 85.2, 1.0}}},
      {694.6, 0.0, 23.9, 61.9, {{1.0, 92.2, 85.0, 84.9, 85.2, 1.0}, {1.0, 92.3, 85.0, 84.9, 85.1, 1.0}}},
      {695.1, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.2, 85.0, 85.0, 1.0}, {1.0, 92.3, 85.2, 85.0, 85.0, 1.0}}},
      {695.6, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.3, 85.0, 84.8, 1.0}, {1.0, 92.3, 85.3, 85.0, 84.7, 1.0}}},
      {696.1, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.4, 85.1, 84.6, 1.0}, {1.0, 92.3, 85.4, 85.1, 84.6, 1.0}}},
      {696.6, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.5, 85.2, 84.4, 1.0}, {1.0, 92.3, 85.5, 85.1, 84.4, 1.0}}},
      {697.1, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.6, 85.2, 84.2, 1.0}, {1.0, 92.3, 85.6, 85.2, 84.2, 1.0}}},
      {697.6, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.7, 85.3, 84.0, 1.0}, {1.0, 92.3, 85.7, 85.3, 84.0, 1.0}}},
      {698.1, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.8, 85.3, 83.8, 1.0}, {1.0, 92.3, 85.7, 85.3, 83.8, 1.0}}},
      {698.6, 0.0, 23.9, 61.9, {{1.0, 92.3, 85.8, 85.4, 83.6, 1.0}, {1.0, 92.3, 85.8, 85.4, 83.6, 1.0}}},
      {699.2, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.0, 85.4, 83.4, 1.0}, {1.0, 92.3, 86.0, 85.4, 83.5, 1.0}}},
      {699.7, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.1, 85.5, 83.2, 1.0}, {1.0, 92.3, 86.1, 85.5, 83.2, 1.0}}},
      {700.2, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.2, 85.6, 83.0, 1.0}, {1.0, 92.3, 86.2, 85.6, 83.0, 1.0}}},
      {700.7, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.4, 85.6, 82.9, 1.0}, {1.0, 92.3, 86.3, 85.6, 82.9, 1.0}}},
      {701.2, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.4, 85.7, 82.7, 1.0}, {1.0, 92.3, 86.4, 85.7, 82.7, 1.0}}},
      {701.7, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.5, 85.7, 82.6, 1.0}, {1.0, 92.3, 86.6, 85.7, 82.6, 1.0}}},
      {702.2, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.6, 85.8, 82.4, 1.0}, {1.0, 92.3, 86.7, 85.8, 82.4, 1.0}}},
      {702.7, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.7, 85.8, 82.3, 1.0}, {1.0, 92.3, 86.7, 85.8, 82.3, 1.0}}},
      {703.2, 0.0, 23.9, 61.9, {{1.0, 92.3, 86.7, 85.9, 82.2, 1.0}, {1.0, 92.3, 86.7, 85.9, 82.3, 1.0}}},
      {703.8, 0.0, 23.9, 61.9, {{1.0, 45.8, 86.7, 85.9, 81.9, 0.0}, {1.0, 45.8, 85.4, 85.9, 81.1, 0.0}}},
      {704.3, 0.0, 23.8, 62.0, {{1.0, 26.4, 86.3, 86.0, 81.4, 0.0}, {1.0, 26.4, 75.7, 86.0, 72.9, 0.0}}},
      {704.8, 0.0, 23.6, 62.0, {{1.0, 24.9, 86.1, 86.0, 81.1, 0.0}, {1.0, 24.9, 96.6, 86.0, 88.0, 0.0}}},
      {705.3, 0.0, 23.5, 62.0, {{1.0, 24.7, 86.2, 86.1, 80.9, 0.0}, {1.0, 24.7, 76.4, 86.1, 73.6, 0.0}}},
      {705.8, 0.0, 23.4, 62.1, {{1.0, 24.7, 86.2, 86.1, 80.9, 0.0}, {1.0, 24.7, 81.4, 86.1, 77.8, 0.0}}},
      {706.3, 0.0, 23.3, 62.1, {{1.0, 24.7, 86.2, 86.1, 80.9, 0.0}, {1.0, 24.7, 86.2, 86.1, 80.8, 0.0}}},
      {706.8, 0.0, 23.3, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {707.3, 0.0, 23.3, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {707.8, 0.0, 23.3, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {708.4, 0.0, 23.3, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {708.9, 0.0, 23.3, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {709.4, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {709.9, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {710.4, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {710.9, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {711.4, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
      {711.9, 0.0, 23.2, 62.1, {{1.0, 24.6, 86.2, 86.1, 80.8, 0.0}, {1.0, 24.6, 86.2, 86.1, 80.8, 0.0}}},
  };
  constexpr double FRAME = 1.0 / 30.0;

  EngineStartThrottleHold holds[2];
  int    framesChanged     = 0;
  int    framesNotNormal   = 0;
  double largestDifference = 0.0;
  int    flameoutFrames    = 0;  // frames after the flameout (MSFS combustion 0, FBW state ON)
  for (const Sample& sample : SAMPLES) {
    for (int frame = 0; frame < 15; ++frame) {
      for (int engine = 0; engine < 2; ++engine) {
        const EngineSample&                   e      = sample.engines[engine];
        const EngineStartThrottleHold::Output output = holds[engine].update({sample.onGround > 0.5, e.engineState, e.simCommandedN1,
                                                                             sample.idleN1Limit, e.loopTargetN1, FRAME, e.coreSpeed,
                                                                             sample.idleCoreSpeed});
        const double difference = (std::max)(std::fabs(output.loopCommandedN1 - e.simCommandedN1),
                                             std::fabs(EngineStartThrottleHold::simThrottle(output, e.loopThrottle) - e.loopThrottle));
        largestDifference       = (std::max)(largestDifference, difference);
        framesChanged += difference != 0.0 ? 1 : 0;
        framesNotNormal += holds[engine].currentPhase() != EngineStartThrottleHold::Phase::NORMAL ? 1 : 0;
        flameoutFrames += e.combustion < 0.5 ? 1 : 0;
      }
    }
  }
  std::printf("A380X all-engine flameout flight replay (657-712 s, engines 1 and 4): %d frames changed by the hold (largest %.3f), "
              "%d frames not NORMAL, %d frames after the flameout\n",
              framesChanged, largestDifference, framesNotNormal, flameoutFrames);
  expect(flameoutFrames > 0, "flameout flight replay: the replay covers the flameout", flameoutFrames);
  expect(framesNotNormal == 0, "flameout flight replay: the hold stays NORMAL (engines never out or starting for the FADEC)",
         framesNotNormal);
  expect(framesChanged == 0, "flameout flight replay: loop input and MSFS throttle unchanged by the hold", largestDifference);
}

static void checkScenario(const Scenario& s, double duration, double settleLimitSeconds) {
  for (const bool lag : {true, false}) {
    const char*  variant = lag ? "commanded N1 lag" : "no commanded N1 lag";
    const Result r       = runRelight(s, lag, HOLD_IN_USE, duration);
    report(s.name, variant, r);
    char what[220];
    std::snprintf(what, sizeof what, "%s, %s: the relight reaches ON", s.name, variant);
    expect(r.reachedOn, what, r.onTime);
    std::snprintf(what, sizeof what, "%s, %s: ON within 15 s of the MSFS start end", s.name, variant);
    expect(r.reachedOn && r.onTime - r.startEndTime <= 15.0, what, r.onTime - r.startEndTime);
    std::snprintf(what, sizeof what, "%s, %s: N3 never above the lever value after the start", s.name, variant);
    expect(r.maxN2AfterStartEnd <= r.steadyN2 + 1.0, what, r.maxN2AfterStartEnd);
    std::snprintf(what, sizeof what, "%s, %s: N3 settles at the lever value within %.0f s of ON", s.name, variant, settleLimitSeconds);
    expect(r.settledAfterOn >= 0.0 && r.settledAfterOn <= settleLimitSeconds, what, r.settledAfterOn);
  }
}

int main() {
  // ISA temperature ratios: FL150 0.8969, FL200 0.8626. Mach from the IAS (ISA).
  // name, altitude, IAS, Mach, theta, TLA, FBW idle N3, steady N3, MSFS idle N3 below, MSFS idle N1 below, engine out s, relight N2
  // Engine 1: windmill relight at FL200 / 300 kt, lever CL with A/THR (recorded: out 52 s, relight from N2 26 %, ON after 33 s,
  // FBW idle N3 61.0 %, then 83.0 %).
  const Scenario r1{"R1 eng 1 windmill FL200/300 kt, CL", 20000, 300, 0.63, 0.8626, 25.0, 61.0, 83.0, 0.0, 0.0, 52.0, 26.1};
  // Engine 4: quick relight at FL150 / 240 kt, lever CL with A/THR (recorded: out 3 s, relight from N2 33 %, ON after 26 s,
  // FBW idle N3 62.0 %, then 80.3 %).
  const Scenario r2{"R2 eng 4 quick relight FL150/240 kt, CL", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, 0.0, 0.0, 3.0, 33.3};
  // Engine 3: crossbleed relight at FL150 / 210 kt, lever CL with A/THR (recorded: out 72 s, relight from N2 26 %, ON after 34 s,
  // FBW idle N3 62.0 %, then 81.1 %).
  const Scenario r3{"R3 eng 3 crossbleed FL150/210 kt, CL", 15000, 210, 0.42, 0.8969, 25.0, 62.0, 81.1, 0.0, 0.0, 72.0, 25.7};
  // The QRH case, lever at IDLE.
  const Scenario r4{"R4 eng 4 quick relight FL150/240 kt, IDLE", 15000, 240, 0.48, 0.8969, 0.0, 62.0, 80.3, 0.0, 0.0, 3.0, 33.3};
  // The MSFS idle N1 at throttle 0 settles below the FBW idle limit: the commanded N1 never reaches it, the hold must still end.
  const Scenario r5{"R5 MSFS idle N1 2 % below the limit, CL", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, -1.0, 2.0, 3.0, 33.3};
  // The MSFS idle N3 settles below the FBW idle N3: the FADEC never sees the start end at idle; the idle N1 capture releases it.
  const Scenario r6{"R6 MSFS idle N3 2 % below the FBW idle, CL", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, 2.0, 0.0, 3.0, 33.3};
  // The start ends below the FBW idle (recorded at FL150: MSFS idle 61.9 % against the FBW 62.0 %): the MSFS idle N3 0.5 % / 1 %
  // below the FBW idle N3 AND the MSFS idle N1 2 % below the FBW idle limit (beyond the 1 % idle capture margin): neither the FADEC
  // nor the idle N1 capture sees the start end; the fallback must bring the engine to ON.
  const Scenario r7{"R7 start ends 0.5 % below idle, CL", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, 0.5, 2.0, 3.0, 33.3};
  const Scenario r8{"R8 start ends 1 % below idle, CL", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, 1.0, 2.0, 3.0, 33.3};
  const Scenario r9{"R9 start ends 1 % below idle, IDLE", 15000, 240, 0.48, 0.8969, 0.0, 62.0, 80.3, 1.0, 2.0, 3.0, 33.3};

  // The model without the hold must reproduce the recordings: N3 at the 97.5 % limit for 5.1-6.7 s (here 4-8 s) on all three.
  const struct {
    const Scenario* scenario;
    double          duration;
  } recorded[] = {{&r1, 120.0}, {&r2, 90.0}, {&r3, 140.0}};
  for (const auto& [s, duration] : recorded) {
    const Result r = runRelight(*s, true, false, duration);
    report(s->name, "model WITHOUT hold", r);
    char what[220];
    std::snprintf(what, sizeof what, "%s: the model without the hold reaches the recorded N3 limit", s->name);
    expect(r.maxN2AfterStartEnd >= 97.0, what, r.maxN2AfterStartEnd);
    std::snprintf(what, sizeof what, "%s: the model without the hold stays at the limit for the recorded time", s->name);
    expect(r.secondsAtLimit >= 4.0 && r.secondsAtLimit <= 8.0, what, r.secondsAtLimit);
  }

  // Settled within 15 s of ON (idle reached, then the rise of the target at 10 %/s); 20 s when the hold ends on its 10 s limit.
  constexpr double LONGEST_SETTLE = EngineStartThrottleHold::IDLE_STABILISATION_MAX_SECONDS + 10.0;
  checkScenario(r1, 120.0, 15.0);
  checkScenario(r2, 90.0, 15.0);
  checkScenario(r3, 140.0, 15.0);
  checkScenario(r4, 90.0, 15.0);
  checkScenario(r5, 90.0, LONGEST_SETTLE);
  checkScenario(r6, 90.0, 15.0);
  checkScenario(r7, 90.0, LONGEST_SETTLE);
  checkScenario(r8, 90.0, LONGEST_SETTLE);
  checkScenario(r9, 90.0, LONGEST_SETTLE);

  // The quick relights R2 / R4 with MSFS commanding its idle N1 at throttle 0 during the start (MsfsEngineModel E., as on the A32NX
  // T2): the hold must not take that commanded N1 for "idle reached" before the FADEC sees the start end.
  const Scenario r10{"R10 = R2, commanded N1 at idle while starting", 15000, 240, 0.48, 0.8969, 25.0, 62.0, 80.3, 0.0, 0.0, 3.0, 33.3,
                     true};
  const Scenario r11{"R11 = R4, commanded N1 at idle while starting", 15000, 240, 0.48, 0.8969, 0.0, 62.0, 80.3, 0.0, 0.0, 3.0, 33.3,
                     true};
  checkScenario(r10, 90.0, 15.0);
  checkScenario(r11, 90.0, 15.0);
  for (const Scenario* s : {&r10, &r11}) {
    const Result r = runRelight(*s, true, HOLD_IN_USE, 90.0);
    char         what[220];
    std::snprintf(what, sizeof what, "%s: MSFS throttle held until ON", s->name);
    expect(r.throttleBeforeOn == 0.0, what, r.throttleBeforeOn);
  }

  // A compressor stall active during the relight (flyPad ATA 72 compressor stall), R1 conditions (levers in CL with the A/THR, N1
  // target above the 60 % stall threshold; at the R2/R3 conditions the target is below it): the engine stalls as soon as it is ON
  // and the stall N1 loss (up to 15 %) is added to the MSFS commanded N1 that the hold sees. The hold must still wait for the MSFS
  // commanded N1 itself to reach idle (integration note of 2026-10-07: "the stall makes the commanded N1 look higher"). Without
  // the fix the hold ends 0.8 s early with the commanded N1 9 % below idle; the target ramp of the ACCELERATING phase still keeps
  // the N3 at the lever value, so the early release has no visible effect in this model.
  const Scenario r12{"R12 = R1, compressor stall", 20000, 300, 0.63, 0.8626, 25.0, 61.0, 83.0, 0.0, 0.0, 52.0, 26.1, false, true};
  checkScenario(r12, 120.0, 15.0);
  {
    const Result r = runRelight(r12, true, HOLD_IN_USE, 120.0);
    std::printf("%s: hold released with the MSFS commanded N1 at %.1f %% (idle limit %.1f %%)\n", r12.name, r.releaseCommandedN1,
                r12.idleLimit());
    expect(r12.clbLimit() >= CompressorStallModel::THRESHOLD_N1_PERCENT, "R12: the N1 target is above the stall threshold",
           r12.clbLimit());
    expect(r.releaseCommandedN1 >= r12.idleLimit() - EngineStartThrottleHold::IDLE_REACHED_MARGIN_PERCENT,
           "R12: hold released only once the MSFS commanded N1 (without the stall loss) reached idle", r.releaseCommandedN1);
  }

  replayA32nxQuickRelightT2();
  replayA380xAllEngineFlameoutFlight();

  // Unchanged: a thrust lever change of a running engine in flight, and a start on the ground.
  {
    const double inFlight = throttleDifference(r2, false);
    std::printf("in flight, engine running, lever IDLE -> CL -> IDLE: largest throttle difference with the hold %.9f %%\n", inFlight);
    expect(inFlight == 0.0, "in flight, engine running, lever change: MSFS throttle unchanged by the hold", inFlight);
    const double ground = throttleDifference(r2, true);
    std::printf("on the ground, engine start (STARTING -> ON): largest throttle difference with the hold %.9f %%\n", ground);
    expect(ground == 0.0, "ground start: MSFS throttle unchanged by the hold", ground);
  }

  const bool  fallbackOff = holdParameters().releaseThrottleMaxPercent == 0.0;
  const char* variant     = !HOLD_IN_USE ? ", WITHOUT the fix" : (fallbackOff ? ", WITHOUT the fallback" : "");
  if (failures == 0) {
    std::printf("engine_start_throttle_hold_test (A380X%s): all tests passed\n", variant);
    return 0;
  }
  std::printf("engine_start_throttle_hold_test (A380X%s): %d failure(s)\n", variant, failures);
  return 1;
}
