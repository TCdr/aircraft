// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the DOx derated takeoff on the FADEC model (src/TakeoffDerate.h): run test/run_tests.sh. The FADEC is the
// generated A380FadecComputer model, used as it is, fed as FlyByWireInterface::updateFadec feeds it, on the ground before
// take-off with a derate selected on the MFD PERF T.O panel and no FLEX TEMP (the MFD writes 0).
//
// Build with -DWITHOUT_THE_FIX to run the same checks with the PRIM word as it is: the derated checks must fail.

#include <cmath>
#include <cstdio>
#include <initializer_list>

#include "A380FadecComputer.h"
#include "TakeoffDerate.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

/// Thrust limits on the ground (percent N1): the FLX limit is the derated rating the FADEC module writes for D12
static constexpr double IDLE_LIMIT = 20.0;
static constexpr double CLB_LIMIT = 78.0;
static constexpr double MCT_LIMIT = 84.0;
static constexpr double DERATED_FLX_LIMIT = 79.0;
static constexpr double TOGA_LIMIT = 88.0;

/// The thrust lever angles of the detents (degrees)
static constexpr double FLX_MCT_DETENT_DEG = 35.0;
static constexpr double TOGA_DETENT_DEG = 45.0;

static constexpr double TAT_DEG_C = 45.0;  // a hot day
static constexpr double D12_REDUCTION_PERCENT = 12.0;

static constexpr uint32_T SSM_NO_COMPUTED_DATA = 1U;
static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

static constexpr double FRAME_SECONDS = 1.0 / 30.0;

#ifdef WITHOUT_THE_FIX
template <typename Word>
static Word takeoffTemperatureWord(const Word& word, double) {
  return word;
}
#else
template <typename Word>
static Word takeoffTemperatureWord(const Word& word, double derate) {
  return TakeoffDerate::takeoffTemperatureWord(word, derate);
}
#endif

/// One FADEC model, its engine running, the A/THR off.
struct Fadec {
  A380FadecComputer fadec;
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
  double derate = D12_REDUCTION_PERCENT;
  bool onGround = true;
  // the FLEX TEMP word of the PRIMs without FLEX TEMP
  uint32_T primFlexSsm = SSM_NO_COMPUTED_DATA;
  real32_T primFlexTemp = 0.0f;

  Fadec() { fadec.initialize(); }

  void step(double leverTlaDeg) {
    inputs.in.time.dt = FRAME_SECONDS;
    inputs.in.time.simulation_time += FRAME_SECONDS;
    inputs.in.data.on_ground = onGround;
    inputs.in.data.is_engine_operative = true;
    inputs.in.data.TAT_degC = TAT_DEG_C;
    inputs.in.data.OAT_degC = TAT_DEG_C;
    inputs.in.data.engine_N1_percent = IDLE_LIMIT;
    inputs.in.data.commanded_engine_N1_percent = IDLE_LIMIT;

    athr_input& limits = inputs.in.input;
    limits.thrust_limit_IDLE_percent = IDLE_LIMIT;
    limits.thrust_limit_CLB_percent = CLB_LIMIT;
    limits.thrust_limit_MCT_percent = MCT_LIMIT;
    limits.thrust_limit_FLEX_percent = derate > 0 ? DERATED_FLX_LIMIT : 0.0;
    limits.thrust_limit_TOGA_percent = TOGA_LIMIT;
    limits.thrust_limit_REV_percent = 70.0;
    limits.TLA_deg = leverTlaDeg;

    base_prim_out_bus prim{};
    prim.fg.flx_to_temp_deg_c.SSM = primFlexSsm;
    prim.fg.flx_to_temp_deg_c.Data = primFlexTemp;
    prim.fg.flx_to_temp_deg_c = takeoffTemperatureWord(prim.fg.flx_to_temp_deg_c, derate);
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
  bool flexPathActive() { return fadec.getExternalOutputs().out.data_computed.is_FLX_active; }
};

/// DSC-70-20-40 (l.111561-111565) and DSC-22-FG-50-30 MAN DTO (l.11443-11446): the derated rating at the FLX-MCT detent.
static void derateGivesTheDeratedThrustAtTheFlxMctDetent() {
  for (const uint32_T ssm : {SSM_NO_COMPUTED_DATA, SSM_NORMAL_OPERATION}) {
    Fadec derated;
    derated.primFlexSsm = ssm;
    derated.run(2.0, FLX_MCT_DETENT_DEG);
    expect(derated.flexPathActive(), "derate: the FADEC uses its reduced takeoff rating", derated.flexPathActive());
    expect(std::abs(derated.n1Command() - DERATED_FLX_LIMIT) < 0.1, "derate: derated N1 at the FLX-MCT detent",
           derated.n1Command());

    // after lift-off the levers stay at FLX-MCT: the derated rating stays until the levers are moved
    derated.onGround = false;
    derated.run(2.0, FLX_MCT_DETENT_DEG);
    expect(std::abs(derated.n1Command() - DERATED_FLX_LIMIT) < 0.1, "derate: derated N1 kept in flight", derated.n1Command());
  }
}

static void togaDetentAndNoDerateAreUnchanged() {
  Fadec toga;
  toga.run(2.0, TOGA_DETENT_DEG);
  expect(std::abs(toga.n1Command() - TOGA_LIMIT) < 0.1, "derate, TOGA detent: TOGA thrust", toga.n1Command());

  Fadec noDerate;
  noDerate.derate = 0.0;
  noDerate.run(2.0, FLX_MCT_DETENT_DEG);
  expect(!noDerate.flexPathActive(), "no derate, no FLEX TEMP: TOGA mode", noDerate.flexPathActive());
  expect(std::abs(noDerate.n1Command() - MCT_LIMIT) < 0.1, "no derate: MCT at the FLX-MCT detent", noDerate.n1Command());

  // a FLEX TEMP entered keeps its word (the MFD does not allow both)
  base_arinc_429 flex{};
  flex.SSM = SSM_NORMAL_OPERATION;
  flex.Data = 60.0f;
  const base_arinc_429 word = TakeoffDerate::takeoffTemperatureWord(flex, D12_REDUCTION_PERCENT);
  expect(word.Data == 60.0f && word.SSM == SSM_NORMAL_OPERATION, "FLEX TEMP word kept", word.Data);
}

int main() {
  derateGivesTheDeratedThrustAtTheFlxMctDetent();
  togaDetentAndNoDerateAreUnchanged();
  if (failures > 0) {
    std::printf("takeoff_derate_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("takeoff_derate_test: all checks passed\n");
  return 0;
}
