// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the DEGRADED (N1) mode of the A380X FADECs (src/FadecDegradedMode.h): run test/run_tests.sh. The FADEC is the
// generated A380FadecComputer model, used as it is, fed as FlyByWireInterface::updateFadec feeds it, in flight with the A/THR
// off.
//
// Build with -DWITHOUT_THE_FIX to run the same checks without the DEGRADED mode (the model gets the lever): the checks of the
// frozen thrust must fail.

#include <cmath>
#include <cstdio>

#include "A380FadecComputer.h"
#include "FadecDegradedMode.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

/// Thrust limits in climb (percent N1)
static constexpr double IDLE_LIMIT = 30.0;
static constexpr double CLB_LIMIT = 85.0;
static constexpr double MCT_LIMIT = 88.0;
static constexpr double TOGA_LIMIT = 90.0;

static constexpr double CL_DETENT_DEG = 25.0;

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

/// One FADEC model in flight, its engine running, the A/THR off, behind the thrust freeze of the DEGRADED mode.
struct FlightFadec {
  A380FadecComputer fadec;
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
  FadecDegradedMode::ThrustFreeze freeze;
  double climbLimit = CLB_LIMIT;
  bool degraded = false;
  bool autothrustLost = false;

  FlightFadec() { fadec.initialize(); }

  FadecDegradedMode::RatingLimits limits() const { return {IDLE_LIMIT, climbLimit, MCT_LIMIT, TOGA_LIMIT}; }

  void step(double leverDeg) {
    inputs.in.time.dt = FRAME_SECONDS;
    inputs.in.time.simulation_time += FRAME_SECONDS;
    inputs.in.data.on_ground = false;
    inputs.in.data.is_engine_operative = true;
    inputs.in.data.TAT_degC = -20.0;
    inputs.in.data.OAT_degC = -40.0;
    inputs.in.data.engine_N1_percent = n1Command();
    inputs.in.data.commanded_engine_N1_percent = n1Command();

    athr_input& input = inputs.in.input;
    input.thrust_limit_IDLE_percent = IDLE_LIMIT;
    input.thrust_limit_CLB_percent = climbLimit;
    input.thrust_limit_MCT_percent = MCT_LIMIT;
    input.thrust_limit_FLEX_percent = 0.0;
    input.thrust_limit_TOGA_percent = TOGA_LIMIT;
    input.thrust_limit_REV_percent = 70.0;
#ifdef WITHOUT_THE_FIX
    input.TLA_deg = leverDeg;
#else
    const athr_output& last = fadec.getExternalOutputs().out.output;
    input.TLA_deg = freeze.update({degraded, autothrustLost, leverDeg, last.N1_c_percent, static_cast<bool>(last.athr_control_active), limits()});
#endif

    fadec.setExternalInputs(&inputs);
    fadec.step();
  }

  void run(double seconds, double leverDeg) {
    for (double t = 0.0; t < seconds; t += FRAME_SECONDS) {
      step(leverDeg);
    }
  }

  double n1Command() { return fadec.getExternalOutputs().out.output.N1_c_percent; }
};

/// The model sets the N1 of the lever angle the DEGRADED mode computes for it.
static void leverAngleOfN1RoundTrips() {
  FlightFadec fadec;
  for (double n1 = 35.0; n1 <= TOGA_LIMIT; n1 += 5.0) {
    const double tla = FadecDegradedMode::thrustLeverAngleOfN1(n1, fadec.limits());
    // NORMAL mode: the angle goes to the model as it is
    fadec.run(0.5, tla);
    char what[80];
    std::snprintf(what, sizeof(what), "the model sets N1 %.0f at the angle of N1 %.0f", fadec.n1Command(), n1);
    expect(std::abs(fadec.n1Command() - n1) < 0.05, what, fadec.n1Command());
  }
  expect(FadecDegradedMode::thrustLeverAngleOfN1(IDLE_LIMIT - 5.0, fadec.limits()) == 0.0, "below idle: idle angle", 0.0);
  expect(FadecDegradedMode::thrustLeverAngleOfN1(TOGA_LIMIT + 5.0, fadec.limits()) == 45.0, "above TOGA: TOGA angle", 45.0);
}

/// Manual thrust in the CL detent: the reversion keeps the thrust when the climb limit goes down, until the lever moves.
static void reversionFreezesTheThrustUntilTheLeverMoves() {
  FlightFadec fadec;
  fadec.run(1.0, CL_DETENT_DEG);
  expect(std::abs(fadec.n1Command() - CLB_LIMIT) < 0.05, "NORMAL: CLB thrust in the CL detent", fadec.n1Command());

  fadec.degraded = true;
  fadec.run(0.5, CL_DETENT_DEG);
  fadec.climbLimit = 80.0;
  fadec.run(1.0, CL_DETENT_DEG);
  expect(std::abs(fadec.n1Command() - CLB_LIMIT) < 0.05, "DEGRADED: the thrust of the reversion is kept", fadec.n1Command());
  expect(fadec.freeze.isFrozen(), "DEGRADED: thrust frozen", 0.0);

  // a small lever noise does not end the freeze
  fadec.run(0.5, CL_DETENT_DEG - 0.5);
  expect(std::abs(fadec.n1Command() - CLB_LIMIT) < 0.05, "lever noise: thrust still frozen", fadec.n1Command());

  // the crew moves the lever: N1 control from the lever
  const double lever = 20.0;
  fadec.run(1.0, lever);
  const double leverN1 = IDLE_LIMIT + (fadec.climbLimit - IDLE_LIMIT) * lever / CL_DETENT_DEG;
  expect(std::abs(fadec.n1Command() - leverN1) < 0.05, "lever moved: N1 of the lever", fadec.n1Command());
  expect(!fadec.freeze.isFrozen(), "lever moved: no longer frozen", 0.0);
}

/// Back to NORMAL (air data available again): the lever controls the thrust again.
static void normalModeEndsTheFreeze() {
  FlightFadec fadec;
  fadec.run(1.0, CL_DETENT_DEG);
  fadec.degraded = true;
  fadec.run(0.5, CL_DETENT_DEG);
  fadec.climbLimit = 80.0;
  fadec.degraded = false;
  fadec.run(1.0, CL_DETENT_DEG);
  expect(std::abs(fadec.n1Command() - 80.0) < 0.05, "NORMAL again: CLB thrust of the lever", fadec.n1Command());
}

/// The A/THR keeps the engines of one or two degraded FADECs: no freeze. With three or four it is lost: the freeze follows the
/// A/THR command until the A/THR stops controlling the engine, then holds it.
static void autothrustAndTheFreeze() {
  FadecDegradedMode::ThrustFreeze freeze;
  const FadecDegradedMode::RatingLimits limits{IDLE_LIMIT, CLB_LIMIT, MCT_LIMIT, TOGA_LIMIT};

  double tla = freeze.update({true, false, CL_DETENT_DEG, 70.0, true, limits});
  expect(!freeze.isFrozen() && tla == CL_DETENT_DEG, "A/THR kept: no freeze", tla);

  tla = freeze.update({true, true, CL_DETENT_DEG, 72.0, true, limits});
  expect(freeze.isFrozen() && tla == CL_DETENT_DEG, "A/THR lost, still active this frame: lever angle", tla);
  tla = freeze.update({true, true, CL_DETENT_DEG, 72.0, false, limits});
  const double expected = FadecDegradedMode::thrustLeverAngleOfN1(72.0, limits);
  expect(freeze.isFrozen() && std::abs(tla - expected) < 1e-9, "A/THR disconnected: the last A/THR N1 is held", tla);

  // a manual thrust freeze with one degraded FADEC, then the crew engages the A/THR, which keeps the engine: the freeze ends
  FadecDegradedMode::ThrustFreeze manual;
  manual.update({false, false, CL_DETENT_DEG, 80.0, false, limits});
  manual.update({true, false, CL_DETENT_DEG, 80.0, false, limits});
  expect(manual.isFrozen(), "manual thrust reversion: frozen", 0.0);
  tla = manual.update({true, false, CL_DETENT_DEG, 75.0, true, limits});
  expect(!manual.isFrozen() && tla == CL_DETENT_DEG, "A/THR keeps the engine: freeze ended", tla);
  // the A/THR disconnected later: the lever controls the thrust, no frozen N1 left
  tla = manual.update({true, false, CL_DETENT_DEG, 75.0, false, limits});
  expect(!manual.isFrozen() && tla == CL_DETENT_DEG, "A/THR off later: lever thrust", tla);
}

static void autothrustLostWithThreeOrFourEngines() {
  const bool two[4] = {true, false, true, false};
  const bool three[4] = {true, true, false, true};
  const bool four[4] = {true, true, true, true};
  expect(!FadecDegradedMode::autothrustLost(two), "two degraded FADECs: A/THR kept", 2);
  expect(FadecDegradedMode::autothrustLost(three), "three degraded FADECs: A/THR lost", 3);
  expect(FadecDegradedMode::autothrustLost(four), "four degraded FADECs: A/THR lost", 4);
  expect(FadecDegradedMode::autothrustDisconnectOrder(true, true), "A/THR lost and engaged: disconnect", 1);
  expect(!FadecDegradedMode::autothrustDisconnectOrder(true, false), "A/THR lost, off: no continuous disconnect input", 0);
  expect(!FadecDegradedMode::autothrustDisconnectOrder(false, true), "A/THR kept: no disconnect", 0);
}

int main() {
  leverAngleOfN1RoundTrips();
  reversionFreezesTheThrustUntilTheLeverMoves();
  normalModeEndsTheFreeze();
  autothrustAndTheFreeze();
  autothrustLostWithThreeOrFourEngines();
  if (failures > 0) {
    std::printf("fadec_degraded_mode_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fadec_degraded_mode_test: all checks passed\n");
  return 0;
}
