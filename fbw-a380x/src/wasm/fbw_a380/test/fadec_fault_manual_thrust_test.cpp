// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the A380X thrust loop under ENG 1(2)(3)(4) FADEC FAULT (the FADEC cannot communicate via the avionics networks,
// fbw-common/src/wasm/fbw_common/src/FadecFailureInputs.h): run test/run_tests.sh.
//
// Sim test of 2026-10-06 (s4_main1.log): FL100, 250 kt, A/THR active, the four levers in the CL detent. Engine 1 FADEC network link
// failed at 231.3 s: until the failure was cleared at 280.6 s, engine 1 stayed at the N1 of the failure (50.2 %, MSFS throttle frozen
// at 44.1 %) while the A/THR kept managing engines 2-4. The FCOM gives that engine to its lever ("THR LEVER ... MAN ADJUST"): in the
// CL detent it must go to the CLB thrust. The thrust loop below is the generated A380FadecComputer model, used as it is, fed as
// FlyByWireInterface::updateFadec feeds it; the MSFS engine is a first-order lag on its throttle.
//
// Build with -DWITHOUT_THE_FIX to run the same checks without FadecFailureInputs::thrustLeverAngleWithoutThrustLock: the checks of
// the lost link must fail (the model latches its THRUST LOCK and holds the N1 of the failure).

#include <cmath>
#include <cstdio>

#include "A380FadecComputer.h"
#include "FadecFailureInputs.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

/// Thrust limits of the scenario (percent N1), about FL100 / 250 kt.
static constexpr double IDLE_LIMIT = 22.0;
static constexpr double CLB_LIMIT = 82.0;
static constexpr double MCT_LIMIT = 86.0;
static constexpr double FLEX_LIMIT = 87.0;
static constexpr double TOGA_LIMIT = 90.0;

/// The thrust lever angles of the detents (degrees).
static constexpr double CL_DETENT_DEG = 25.0;
static constexpr double MCT_DETENT_DEG = 35.0;

/// The A/THR N1 order of the PRIMs before the failure (the A/THR was modulating about 50 % in the recording).
static constexpr double ATHR_N1_ORDER = 50.0;

/// ATS discrete word bits read by the FADEC model (A380FadecComputer_data.cpp, BitfromLabel*_bit): bit 11 A/THR engaged,
/// bit 12 A/THR active (thrust control). Bit 24 (alpha floor / TOGA) stays clear.
static constexpr float ATS_WORD_ATHR_ENGAGED_AND_ACTIVE = static_cast<float>((1U << 10) | (1U << 11));

/// SignStatusMatrix::NormalOperation
static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

/// The MSFS engine as the thrust loop sees it: the commanded N1 answers the throttle at once, the N1 follows it with a lag.
struct MsfsEngine {
  static constexpr double IDLE_N1 = 20.0;
  static constexpr double MAX_N1 = 105.0;
  static constexpr double N1_TIME_CONSTANT_SECONDS = 0.6;

  double n1 = ATHR_N1_ORDER;
  double commandedN1 = ATHR_N1_ORDER;

  void step(double throttlePercent, double dt) {
    commandedN1 = IDLE_N1 + throttlePercent / 100.0 * (MAX_N1 - IDLE_N1);
    n1 += (commandedN1 - n1) * (dt / N1_TIME_CONSTANT_SECONDS);
  }
};

/// One FADEC and its engine, stepped as FlyByWireInterface::updateFadec steps them.
struct ThrustLoop {
  A380FadecComputer fadec;
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
  athr_output lastOutput{};  // fadecOutputs[fadecIndex]: the previous frame
  MsfsEngine engine;

  ThrustLoop() { fadec.initialize(); }

  /// The A/THR engages after the FADEC has run without it (its engagement is a rising edge).
  void engageAutothrust(double leverTlaDeg) {
    run(1.0, leverTlaDeg, false, false);
    run(20.0, leverTlaDeg, true, false);
  }

  /// One frame. autothrustEngaged: the A/THR engaged and active in the PRIMs; fadecLinkLost: ENG FADEC FAULT of this engine.
  void step(double leverTlaDeg, bool autothrustEngaged, bool fadecLinkLost) {
    inputs.in.time.dt = FRAME_SECONDS;
    inputs.in.time.simulation_time += FRAME_SECONDS;

    inputs.in.data.V_ias_kn = 250.0;
    inputs.in.data.H_ft = 10000.0;
    inputs.in.data.on_ground = false;
    inputs.in.data.is_engine_operative = true;
    inputs.in.data.engine_N1_percent = engine.n1;
    inputs.in.data.commanded_engine_N1_percent = engine.commandedN1;

    inputs.in.input.thrust_limit_IDLE_percent = IDLE_LIMIT;
    inputs.in.input.thrust_limit_CLB_percent = CLB_LIMIT;
    inputs.in.input.thrust_limit_MCT_percent = MCT_LIMIT;
    inputs.in.input.thrust_limit_FLEX_percent = FLEX_LIMIT;
    inputs.in.input.thrust_limit_TOGA_percent = TOGA_LIMIT;
    inputs.in.input.thrust_limit_REV_percent = 70.0;

    inputs.in.input.TLA_deg = leverTlaDeg;
#ifndef WITHOUT_THE_FIX
    inputs.in.input.TLA_deg =
        FadecFailureInputs::thrustLeverAngleWithoutThrustLock(inputs.in.input.TLA_deg, fadecLinkLost, lastOutput.athr_control_active);
#endif

    // the A/THR orders of the PRIMs (the FADEC model takes PRIM 3 when PRIMs 1 and 2 show no flight control law, as here)
    base_prim_out_bus prim{};
    if (autothrustEngaged) {
      prim.fg.ats_discrete_word.SSM = SSM_NORMAL_OPERATION;
      prim.fg.ats_discrete_word.Data = ATS_WORD_ATHR_ENGAGED_AND_ACTIVE;
      prim.fg.n1_command_percent.SSM = SSM_NORMAL_OPERATION;
      prim.fg.n1_command_percent.Data = static_cast<real32_T>(ATHR_N1_ORDER);
    }
    inputs.in.prim_1 = FadecFailureInputs::autothrustOrdersReceived(prim, fadecLinkLost);
    inputs.in.prim_2 = FadecFailureInputs::autothrustOrdersReceived(prim, fadecLinkLost);
    inputs.in.prim_3 = FadecFailureInputs::autothrustOrdersReceived(prim, fadecLinkLost);

    fadec.setExternalInputs(&inputs);
    fadec.step();
    lastOutput = fadec.getExternalOutputs().out.output;

    engine.step(lastOutput.sim_throttle_lever_pos, FRAME_SECONDS);
  }

  void run(double seconds, double leverTlaDeg, bool autothrustEngaged, bool fadecLinkLost) {
    for (double t = 0.0; t < seconds; t += FRAME_SECONDS) {
      step(leverTlaDeg, autothrustEngaged, fadecLinkLost);
    }
  }
};

/// The recorded case: the link of the FADEC is lost with the lever in the CL detent and the A/THR active.
static void lostLinkInClimbDetentGivesClimbThrust() {
  ThrustLoop loop;
  loop.engageAutothrust(CL_DETENT_DEG);
  expect(loop.lastOutput.athr_control_active, "CL: A/THR controls the engine before the failure", 0.0);
  expect(std::abs(loop.engine.n1 - ATHR_N1_ORDER) < 1.0, "CL: N1 at the A/THR order before the failure", loop.engine.n1);

  bool thrustLocked = false;
  for (double t = 0.0; t < 30.0; t += FRAME_SECONDS) {
    loop.step(CL_DETENT_DEG, true, true);
    thrustLocked = thrustLocked || loop.lastOutput.memo_thrust_active;
  }
  expect(!loop.lastOutput.athr_control_active, "CL: no A/THR control of the engine with the link lost", 0.0);
  expect(!thrustLocked, "CL: no THRUST LOCK with the link lost (the A/THR is not disconnected)", 1.0);
  expect(std::abs(loop.lastOutput.N1_c_percent - CLB_LIMIT) < 0.1, "CL: N1 target = CLB with the link lost", loop.lastOutput.N1_c_percent);
  expect(std::abs(loop.engine.n1 - CLB_LIMIT) < 1.0, "CL: N1 reaches CLB with the link lost", loop.engine.n1);

  // the failure cleared: the A/THR takes the engine again
  loop.run(20.0, CL_DETENT_DEG, true, false);
  expect(loop.lastOutput.athr_control_active, "CL: A/THR controls the engine again after the failure", 0.0);
  expect(std::abs(loop.engine.n1 - ATHR_N1_ORDER) < 1.0, "CL: N1 back at the A/THR order after the failure", loop.engine.n1);
}

/// The same in the MCT detent (one engine out): the engine goes to MCT.
static void lostLinkInMctDetentGivesMctThrust() {
  ThrustLoop loop;
  loop.engageAutothrust(MCT_DETENT_DEG);
  bool thrustLocked = false;
  for (double t = 0.0; t < 30.0; t += FRAME_SECONDS) {
    loop.step(MCT_DETENT_DEG, true, true);
    thrustLocked = thrustLocked || loop.lastOutput.memo_thrust_active;
  }
  expect(!thrustLocked, "MCT: no THRUST LOCK with the link lost", 1.0);
  expect(std::abs(loop.lastOutput.N1_c_percent - MCT_LIMIT) < 0.1, "MCT: N1 target = MCT with the link lost", loop.lastOutput.N1_c_percent);
  expect(std::abs(loop.engine.n1 - MCT_LIMIT) < 1.0, "MCT: N1 reaches MCT with the link lost", loop.engine.n1);
}

/// The THRUST LOCK function itself is kept: an A/THR disconnection with a working link (A/THR pb on the AFS CP, or the A/THR
/// inoperative) in the CL detent still freezes the thrust at its level (A380 FCOM DSC-22-FG-50-40 THRUST LOCK FUNCTION).
static void autothrustDisconnectionStillLocksTheThrust() {
  ThrustLoop loop;
  loop.engageAutothrust(CL_DETENT_DEG);
  loop.run(10.0, CL_DETENT_DEG, false, false);
  expect(loop.lastOutput.memo_thrust_active, "A/THR off: THRUST LOCK active", 0.0);
  expect(std::abs(loop.engine.n1 - ATHR_N1_ORDER) < 1.0, "A/THR off: N1 locked at its level", loop.engine.n1);
}

int main() {
  lostLinkInClimbDetentGivesClimbThrust();
  lostLinkInMctDetentGivesMctThrust();
  autothrustDisconnectionStillLocksTheThrust();
  if (failures > 0) {
    std::printf("fadec_fault_manual_thrust_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fadec_fault_manual_thrust_test: all checks passed\n");
  return 0;
}
