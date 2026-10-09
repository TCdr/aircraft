// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the A380X FADEC failures of ENG 1(2)(3)(4) THRUST LOSS and ENG T.O THRUST DISAGREE (src/FadecThrustFailures.h):
// run test/run_tests.sh. The FADEC is the generated A380FadecComputer model, used as it is, fed as FlyByWireInterface::updateFadec
// feeds it, on the ground before take-off with a FLEX TEMP of 60 degrees C entered.
//
// Build with -DWITHOUT_THE_FIX to run the same checks without the failures (FADEC inputs as before): the checks of the failed
// FADEC must fail.

#include <cmath>
#include <cstdio>

#include "A380FadecComputer.h"
#include "FadecThrustFailures.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

/// Thrust limits on the ground (percent N1)
static constexpr double IDLE_LIMIT = 20.0;
static constexpr double CLB_LIMIT = 78.0;
static constexpr double MCT_LIMIT = 84.0;
static constexpr double FLEX_LIMIT = 80.0;
static constexpr double TOGA_LIMIT = 88.0;

/// The thrust lever angles of the detents (degrees)
static constexpr double FLX_MCT_DETENT_DEG = 35.0;
static constexpr double TOGA_DETENT_DEG = 45.0;

static constexpr double FLEX_TEMP_DEG_C = 60.0;
static constexpr double TAT_DEG_C = 15.0;

/// SignStatusMatrix::NormalOperation
static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

#ifdef WITHOUT_THE_FIX
static double ratingLimit(double limitN1, double, bool) {
  return limitN1;
}
template <typename Word>
static Word flexTemperatureReceived(const Word& word, bool) {
  return word;
}
#else
static double ratingLimit(double limitN1, double idleN1, bool failed) {
  return FadecThrustFailures::ratingLimit(limitN1, idleN1, failed);
}
template <typename Word>
static Word flexTemperatureReceived(const Word& word, bool notReceived) {
  return FadecThrustFailures::flexTemperatureReceived(word, notReceived);
}
#endif

/// One FADEC model on the ground, its engine running, the A/THR off.
struct GroundFadec {
  A380FadecComputer fadec;
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
  bool maxThrustMiscalculated = false;
  bool flexTempNotReceived = false;

  GroundFadec() { fadec.initialize(); }

  void step(double leverTlaDeg) {
    inputs.in.time.dt = FRAME_SECONDS;
    inputs.in.time.simulation_time += FRAME_SECONDS;
    inputs.in.data.on_ground = true;
    inputs.in.data.is_engine_operative = true;
    inputs.in.data.TAT_degC = TAT_DEG_C;
    inputs.in.data.OAT_degC = TAT_DEG_C;
    inputs.in.data.engine_N1_percent = IDLE_LIMIT;
    inputs.in.data.commanded_engine_N1_percent = IDLE_LIMIT;

    // as FlyByWireInterface::updateFadec: the shared limits, then the max thrust miscalculation of this FADEC
    athr_input& limits = inputs.in.input;
    limits.thrust_limit_IDLE_percent = IDLE_LIMIT;
    limits.thrust_limit_CLB_percent = ratingLimit(CLB_LIMIT, IDLE_LIMIT, maxThrustMiscalculated);
    limits.thrust_limit_MCT_percent = ratingLimit(MCT_LIMIT, IDLE_LIMIT, maxThrustMiscalculated);
    limits.thrust_limit_FLEX_percent = ratingLimit(FLEX_LIMIT, IDLE_LIMIT, maxThrustMiscalculated);
    limits.thrust_limit_TOGA_percent = ratingLimit(TOGA_LIMIT, IDLE_LIMIT, maxThrustMiscalculated);
    limits.thrust_limit_REV_percent = 70.0;
    limits.TLA_deg = leverTlaDeg;

    // the FLEX TEMP of the PRIMs, then the FLEX TEMP this FADEC receives
    base_prim_out_bus prim{};
    prim.fg.flx_to_temp_deg_c.SSM = SSM_NORMAL_OPERATION;
    prim.fg.flx_to_temp_deg_c.Data = static_cast<real32_T>(FLEX_TEMP_DEG_C);
    prim.fg.flx_to_temp_deg_c = flexTemperatureReceived(prim.fg.flx_to_temp_deg_c, flexTempNotReceived);
    inputs.in.prim_1 = prim;
    inputs.in.prim_2 = prim;
    inputs.in.prim_3 = prim;

    fadec.setExternalInputs(&inputs);
    fadec.step();
  }

  void run(double seconds, double leverTlaDeg) {
    for (double t = 0.0; t < seconds; t += FRAME_SECONDS) {
      step(leverTlaDeg);
    }
  }

  double n1Command() { return fadec.getExternalOutputs().out.output.N1_c_percent; }

  FadecThrustFailures::TakeoffMode takeoffMode() {
    return FadecThrustFailures::takeoffMode(fadec.getExternalOutputs().out.data_computed.is_FLX_active);
  }
};

/// ENG T.O THRUST DISAGREE: the FADEC without the FLEX TEMP is in TOGA mode and its engine gives MCT in the FLX/MCT detent.
static void flexTempNotReceivedGivesTogaMode() {
  GroundFadec healthy;
  GroundFadec failed;
  failed.flexTempNotReceived = true;
  healthy.run(2.0, FLX_MCT_DETENT_DEG);
  failed.run(2.0, FLX_MCT_DETENT_DEG);

  expect(healthy.takeoffMode() == FadecThrustFailures::FLEX, "healthy FADEC: take-off mode FLEX", healthy.takeoffMode());
  expect(std::abs(healthy.n1Command() - FLEX_LIMIT) < 0.1, "healthy FADEC: FLEX thrust in the FLX/MCT detent", healthy.n1Command());
  expect(failed.takeoffMode() == FadecThrustFailures::TOGA, "FADEC without FLEX TEMP: take-off mode TOGA", failed.takeoffMode());
  expect(std::abs(failed.n1Command() - MCT_LIMIT) < 0.1, "FADEC without FLEX TEMP: MCT thrust in the FLX/MCT detent",
         failed.n1Command());

  // the failure cleared: the FADEC gets the FLEX TEMP again
  failed.flexTempNotReceived = false;
  failed.run(1.0, FLX_MCT_DETENT_DEG);
  expect(failed.takeoffMode() == FadecThrustFailures::FLEX, "failure cleared: take-off mode FLEX again", failed.takeoffMode());
}

/// ENG THRUST LOSS: the FADEC with the max thrust miscalculation gives 15 % less thrust above idle at TOGA, max THR 85 %.
static void maxThrustMiscalculatedGivesThrustLoss() {
  GroundFadec healthy;
  GroundFadec failed;
  failed.maxThrustMiscalculated = true;
  healthy.run(2.0, TOGA_DETENT_DEG);
  failed.run(2.0, TOGA_DETENT_DEG);

  expect(std::abs(healthy.n1Command() - TOGA_LIMIT) < 0.1, "healthy FADEC: TOGA thrust", healthy.n1Command());
  const double expectedFailedN1 = IDLE_LIMIT + 0.85 * (TOGA_LIMIT - IDLE_LIMIT);
  expect(std::abs(failed.n1Command() - expectedFailedN1) < 0.1, "miscalculated FADEC: 15 % less thrust above idle at TOGA",
         failed.n1Command());

  const double healthyMaxThr =
      FadecThrustFailures::maxThrPercent(healthy.inputs.in.input.thrust_limit_TOGA_percent, TOGA_LIMIT, IDLE_LIMIT);
  const double failedMaxThr = FadecThrustFailures::maxThrPercent(failed.inputs.in.input.thrust_limit_TOGA_percent, TOGA_LIMIT, IDLE_LIMIT);
  expect(std::abs(healthyMaxThr - 100.0) < 0.01, "healthy FADEC: max THR 100 %", healthyMaxThr);
  // the FADEC detects the loss when its max THR is 10 % lower than the others (FCOM l.173388-173390)
  expect(failedMaxThr <= 0.9 * healthyMaxThr, "miscalculated FADEC: max THR at least 10 % lower", failedMaxThr);

  // the idle and a FLEX limit of 0 (no FLEX TEMP) are not scaled
  expect(FadecThrustFailures::ratingLimit(IDLE_LIMIT, IDLE_LIMIT, true) == IDLE_LIMIT, "idle not scaled", IDLE_LIMIT);
  expect(FadecThrustFailures::ratingLimit(0.0, IDLE_LIMIT, true) == 0.0, "FLEX limit 0 not scaled", 0.0);
  // no valid limits yet: nothing to compare
  expect(FadecThrustFailures::maxThrPercent(0.0, 0.0, 0.0) == 100.0, "max THR without limits", 0.0);
}

int main() {
  flexTempNotReceivedGivesTogaMode();
  maxThrustMiscalculatedGivesThrustLoss();
  if (failures > 0) {
    std::printf("fadec_thrust_failures_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fadec_thrust_failures_test: all checks passed\n");
  return 0;
}
