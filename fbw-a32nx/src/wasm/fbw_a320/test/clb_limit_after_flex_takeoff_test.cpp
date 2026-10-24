// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the thrust limit type after a FLX takeoff (run test/run_tests.sh): the generated FadecComputer, used as it is.
//
// Measured in the sim (A32NX, FLX takeoff, lever moved from the FLX/MCT detent to CL): the thrust limit type stayed FLX for 780 s
// (to FL259) with the lever reading 25.0, and the climb limit stayed 5.4 % N1 below the real CLB limit the whole time. The type only
// became CLB after the lever left the CL detent and came back. The FADEC compared the lever angle with 25.0 exactly: a lever resting
// a hair above the detent (its position is an analog value) is not CL for the type selection, and it did not reset the flex latch.

#include <cstdio>

#include "FadecComputer.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

constexpr double   TIME_STEP_S            = 1.0 / 30.0;
constexpr double   FLEX_TEMPERATURE       = 40.0;
constexpr double   TAT_ON_THE_RUNWAY      = 30.0;
constexpr uint32_T ARINC_NORMAL_OPERATION = 3;
constexpr double   CL_DETENT              = 25.0;
constexpr double   FLX_MCT_DETENT         = 35.0;

/// One FADEC with a flex takeoff behind it: it runs a second at the FLX/MCT detent on the ground, as the crew set the takeoff.
class FadecAfterFlexTakeoff {
 public:
  explicit FadecAfterFlexTakeoff(bool flexTemperatureSet = true) : flexSet(flexTemperatureSet) {
    fadec.initialize();
    inputs.in.input.thrust_limit_IDLE_percent = 19.6;
    inputs.in.input.thrust_limit_CLB_percent  = 85.0;
    inputs.in.input.thrust_limit_MCT_percent  = 88.0;
    inputs.in.input.thrust_limit_FLEX_percent = 81.4;
    inputs.in.input.thrust_limit_TOGA_percent = 88.0;
    inputs.in.input.thrust_limit_REV_percent  = 70.0;
    run(true, FLX_MCT_DETENT, 1.0);
  }

  /// The limit type after `seconds` with the lever at `tlaDeg`.
  athr_thrust_limit_type typeAfter(bool onGround, double tlaDeg, double seconds) {
    run(onGround, tlaDeg, seconds);
    return fadec.getExternalOutputs().out.output.thrust_limit_type;
  }

 private:
  void run(bool onGround, double tlaDeg, double seconds) {
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      time += TIME_STEP_S;
      inputs.in.time.dt                               = TIME_STEP_S;
      inputs.in.time.simulation_time                  = time;
      inputs.in.data.on_ground                        = onGround;
      inputs.in.data.is_engine_operative              = true;
      inputs.in.data.TAT_degC                         = TAT_ON_THE_RUNWAY;
      inputs.in.data.engine_N1_percent                = 80.0;
      inputs.in.data.commanded_engine_N1_percent      = 80.0;
      inputs.in.input.TLA_deg                         = tlaDeg;
      inputs.in.fcu_input.fcu_flex_to_temp_deg_c.SSM  = flexSet ? ARINC_NORMAL_OPERATION : 0;
      inputs.in.fcu_input.fcu_flex_to_temp_deg_c.Data = static_cast<float>(FLEX_TEMPERATURE);
      fadec.setExternalInputs(&inputs);
      fadec.step();
    }
  }

  FadecComputer                                 fadec;
  FadecComputer::ExternalInputs_FadecComputer_T inputs{};
  double                                        time = 0.0;
  bool                                          flexSet;
};

int main() {
  // The takeoff itself: the flex latch is set, the type on the runway is FLX.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(true, FLX_MCT_DETENT, 1.0) == athr_thrust_limit_type::FLEX, "takeoff: FLX at the FLX/MCT detent");
  }

  // The lever in the CL detent exactly: CLB (this always worked).
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT, 2.0) == athr_thrust_limit_type::CLB, "CL detent exactly: CLB");
  }

  // The lever a hair above the CL detent, as an analog lever rests: still the CL detent, so CLB.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT + 1.0e-9, 2.0) == athr_thrust_limit_type::CLB, "lever 25.000000001: CLB, not stuck on FLX");
  }
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, CL_DETENT + 0.4, 2.0) == athr_thrust_limit_type::CLB, "lever 25.4: CLB, not stuck on FLX");
  }

  // Clearly beyond the CL detent: the limit follows the lever. FLX while the flex latch is set, MCT without a flex takeoff.
  {
    FadecAfterFlexTakeoff fadec;
    expect(fadec.typeAfter(false, 28.0, 2.0) == athr_thrust_limit_type::FLEX, "lever 28 after a FLX takeoff: FLX");
  }
  {
    FadecAfterFlexTakeoff fadec(false);
    expect(fadec.typeAfter(false, FLX_MCT_DETENT, 2.0) == athr_thrust_limit_type::MCT, "lever at FLX/MCT without a flex takeoff: MCT");
  }

  // The flex latch is reset by the CL detent: the lever back to the FLX/MCT detent after CL is MCT, not FLX again.
  {
    FadecAfterFlexTakeoff fadec;
    fadec.typeAfter(false, CL_DETENT + 1.0e-9, 2.0);
    expect(fadec.typeAfter(false, FLX_MCT_DETENT, 2.0) == athr_thrust_limit_type::MCT, "CL (a hair above) then FLX/MCT: MCT, flex latch reset");
  }

  if (failures == 0) {
    std::printf("clb_limit_after_flex_takeoff_test: all tests passed\n");
    return 0;
  }
  std::printf("clb_limit_after_flex_takeoff_test: %d failure(s)\n", failures);
  return 1;
}
