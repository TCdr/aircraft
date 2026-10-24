// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the thrust limit type after a FLEX takeoff (run test/run_tests.sh): the generated
// A380FadecComputer model, used as it is, fed as FlyByWireInterface::updateFadec feeds it.
//
// Measured in the sim on the A32NX, which has the same FADEC logic (FLX takeoff, lever moved from the FLX/MCT detent to CL): the
// thrust limit type stayed FLX for 780 s with the lever reading 25.0, and the climb limit stayed 5.4 % N1 below the real CLB
// limit the whole time. The FADEC compared the lever angle with 25.0 exactly: a lever resting a hair above the detent (its
// position is an analog value) is not CL for the type selection, and it did not reset the flex latch.

#include <cstdio>

#include "A380FadecComputer.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double   TIME_STEP_S          = 1.0 / 30.0;
static constexpr double   TAT_DEG_C            = 30.0;
static constexpr double   FLEX_TEMPERATURE_DEG_C = 60.0;
static constexpr double   CL_DETENT_DEG        = 25.0;
static constexpr double   FLX_MCT_DETENT_DEG   = 35.0;
static constexpr uint32_T SSM_NO_COMPUTED_DATA = 1U;
static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

/// One FADEC model with a FLEX takeoff behind it: it runs a second at the FLX/MCT detent on the ground, as the crew set the takeoff.
class FadecAfterFlexTakeoff {
 public:
  explicit FadecAfterFlexTakeoff(bool flexTemperatureSet = true) : flexTemperatureSet(flexTemperatureSet) {
    fadec.initialize();
    run(true, FLX_MCT_DETENT_DEG, 1.0);
  }

  /// The limit type after `seconds` with the lever at `leverTlaDeg`.
  athr_thrust_limit_type typeAfter(bool onGround, double leverTlaDeg, double seconds) {
    run(onGround, leverTlaDeg, seconds);
    return fadec.getExternalOutputs().out.output.thrust_limit_type;
  }

 private:
  void run(bool onGround, double leverTlaDeg, double seconds) {
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      inputs.in.time.dt                          = TIME_STEP_S;
      inputs.in.time.simulation_time             += TIME_STEP_S;
      inputs.in.data.on_ground                   = onGround;
      inputs.in.data.is_engine_operative         = true;
      inputs.in.data.TAT_degC                    = TAT_DEG_C;
      inputs.in.data.OAT_degC                    = TAT_DEG_C;
      inputs.in.data.engine_N1_percent           = 80.0;
      inputs.in.data.commanded_engine_N1_percent = 80.0;

      athr_input& limits               = inputs.in.input;
      limits.thrust_limit_IDLE_percent = 20.0;
      limits.thrust_limit_CLB_percent  = 78.0;
      limits.thrust_limit_MCT_percent  = 84.0;
      limits.thrust_limit_FLEX_percent = flexTemperatureSet ? 79.0 : 0.0;
      limits.thrust_limit_TOGA_percent = 88.0;
      limits.thrust_limit_REV_percent  = 70.0;
      limits.TLA_deg                   = leverTlaDeg;

      base_prim_out_bus prim{};
      prim.fg.flx_to_temp_deg_c.SSM  = flexTemperatureSet ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
      prim.fg.flx_to_temp_deg_c.Data = flexTemperatureSet ? static_cast<real32_T>(FLEX_TEMPERATURE_DEG_C) : 0.0f;
      inputs.in.prim_1               = prim;
      inputs.in.prim_2               = prim;
      inputs.in.prim_3               = prim;

      fadec.setExternalInputs(&inputs);
      fadec.step();
    }
  }

  A380FadecComputer                                     fadec;
  A380FadecComputer::ExternalInputs_A380FadecComputer_T inputs{};
  bool                                                  flexTemperatureSet;
};

int main() {
  // The takeoff itself: the FLEX rating is the FLX limit on the runway.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(true, FLX_MCT_DETENT_DEG, 1.0) == athr_thrust_limit_type::FLEX, "takeoff: FLX at the FLX/MCT detent");
  }

  // The lever in the CL detent exactly: CLB (this always worked).
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT_DEG, 2.0) == athr_thrust_limit_type::CLB, "CL detent exactly: CLB");
  }

  // The lever a hair above the CL detent, as an analog lever rests: still the CL detent, so CLB.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT_DEG + 1.0e-9, 2.0) == athr_thrust_limit_type::CLB, "lever 25.000000001: CLB, not stuck on FLX");
  }
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT_DEG + 0.4, 2.0) == athr_thrust_limit_type::CLB, "lever 25.4: CLB, not stuck on FLX");
  }

  // Clearly beyond the CL detent: the limit follows the lever. FLX while the takeoff latch is set, MCT without a FLEX takeoff.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, 28.0, 2.0) == athr_thrust_limit_type::FLEX, "lever 28 after a FLEX takeoff: FLX");
  }
  {
    FadecAfterFlexTakeoff fadec(false);
    expect(fadec.typeAfter(false, FLX_MCT_DETENT_DEG, 2.0) == athr_thrust_limit_type::MCT, "lever at FLX/MCT without a FLEX takeoff: MCT");
  }

  // The latch is reset by the CL detent: the lever back to the FLX/MCT detent after CL is MCT, not FLX again.
  {
    FadecAfterFlexTakeoff fadec;
    fadec.typeAfter(false, CL_DETENT_DEG + 1.0e-9, 2.0);
    expect(fadec.typeAfter(false, FLX_MCT_DETENT_DEG, 2.0) == athr_thrust_limit_type::MCT, "CL (a hair above) then FLX/MCT: MCT, latch reset");
  }

  if (failures == 0) {
    std::printf("clb_limit_after_flex_takeoff_test: all tests passed\n");
    return 0;
  }
  std::printf("clb_limit_after_flex_takeoff_test: %d failure(s)\n", failures);
  return 1;
}
