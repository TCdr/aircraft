// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the automatic TOGA of the FADEC at takeoff (src/fadec/TakeoffAutoToga.h): run test/run_tests.sh. The lever angle
// it gives goes into the unmodified generated FadecComputer, as FlyByWireInterface::updateFadec chains them.
//
// Built with -DWITHOUT_THE_FIX, the FADEC model gets the lever as before: with the lever in FLX/MCT and no flex temperature the
// thrust stays at MCT, and the "TOGA after 8 s" checks fail.

#include <cmath>
#include <cstdio>

#include "FadecComputer.h"
#include "fadec/TakeoffAutoToga.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

static constexpr double IDLE_N1 = 19.6;
static constexpr double CLB_N1 = 82.0;
static constexpr double MCT_N1 = 84.0;
static constexpr double FLEX_N1 = 80.0;
static constexpr double TOGA_N1 = 86.0;

/// One engine on its FADEC: the lever angle goes through the automatic TOGA into the FADEC model each frame.
struct Engine {
  static constexpr double DT = 1.0 / 30.0;

  FadecComputer fadec;
  FadecComputer::ExternalInputs_FadecComputer_T inputs{};
  TakeoffAutoToga autoToga;
  double time = 0.0;
  bool flexTemperatureEntered = false;

  Engine() { fadec.initialize(); }

  /// Runs `seconds` with the lever at `leverAngleDeg`, returns the N1 command of the FADEC.
  double run(double leverAngleDeg, double seconds, bool onGround = true) {
    for (double elapsed = 0.0; elapsed < seconds - DT / 2; elapsed += DT) {
      step(leverAngleDeg, onGround);
    }
    return fadec.getExternalOutputs().out.output.N1_c_percent;
  }

  void step(double leverAngleDeg, bool onGround) {
    time += DT;
    inputs.in.time.dt = DT;
    inputs.in.time.simulation_time = time;
    inputs.in.data.on_ground = onGround;
    inputs.in.data.is_engine_operative = true;
    inputs.in.data.engine_N1_percent = IDLE_N1;
    inputs.in.data.commanded_engine_N1_percent = IDLE_N1;
    inputs.in.data.TAT_degC = 15.0;
    inputs.in.input.thrust_limit_IDLE_percent = IDLE_N1;
    inputs.in.input.thrust_limit_CLB_percent = CLB_N1;
    inputs.in.input.thrust_limit_MCT_percent = MCT_N1;
    inputs.in.input.thrust_limit_FLEX_percent = FLEX_N1;
    inputs.in.input.thrust_limit_TOGA_percent = TOGA_N1;
    inputs.in.input.thrust_limit_REV_percent = TOGA_N1 * 0.813;
    inputs.in.fcu_input.fcu_flex_to_temp_deg_c.SSM =
        static_cast<uint32_T>(flexTemperatureEntered ? SignStatusMatrix::NormalOperation : SignStatusMatrix::NoComputedData);
    inputs.in.fcu_input.fcu_flex_to_temp_deg_c.Data = flexTemperatureEntered ? 60.0f : 0.0f;

#ifdef WITHOUT_THE_FIX
    inputs.in.input.TLA_deg = leverAngleDeg;
#else
    const bool togaLimitEngaged = fadec.getExternalOutputs().out.output.thrust_limit_type == athr_thrust_limit_type::TOGA;
    inputs.in.input.TLA_deg = autoToga.update({leverAngleDeg, onGround, togaLimitEngaged}, DT);
#endif
    fadec.setExternalInputs(&inputs);
    fadec.step();
  }
};

static bool near(double value, double expected) {
  return std::abs(value - expected) < 0.01;
}

/// No flex temperature, lever left in FLX/MCT: MCT thrust for 8 s, then TOGA, until the lever goes back to CL.
static void leverLeftInFlxMctWithoutFlex() {
  Engine engine;
  engine.run(0.0, 1.0);
  const double beforeTheDelay = engine.run(35.0, 7.9);
  expect(near(beforeTheDelay, MCT_N1), "no flex, FLX/MCT for 7.9 s: still MCT", beforeTheDelay);
  const double afterTheDelay = engine.run(35.0, 0.2);
  expect(near(afterTheDelay, TOGA_N1), "no flex, FLX/MCT for 8.1 s: TOGA", afterTheDelay);
  const double afterLiftOff = engine.run(35.0, 5.0, false);
  expect(near(afterLiftOff, TOGA_N1), "TOGA stays after lift-off with the lever still in FLX/MCT", afterLiftOff);
  const double leverBackToCl = engine.run(25.0, 0.1, false);
  expect(near(leverBackToCl, CLB_N1), "lever back to CL: CLB", leverBackToCl);
  const double leverBackToMct = engine.run(35.0, 10.0, false);
  expect(near(leverBackToMct, MCT_N1), "in flight the FLX/MCT detent is MCT again", leverBackToMct);
}

/// Any lever angle above CL and below TOGA counts, not only the detent.
static void leverBetweenMctAndToga() {
  Engine engine;
  const double afterTheDelay = engine.run(40.0, 8.1);
  expect(near(afterTheDelay, TOGA_N1), "no flex, lever between MCT and TOGA for 8.1 s: TOGA", afterTheDelay);
}

/// The timer restarts when the lever leaves the range before 8 s.
static void leverPulledBackBeforeTheDelay() {
  Engine engine;
  engine.run(35.0, 5.0);
  engine.run(20.0, 0.5);
  const double fiveSecondsAgain = engine.run(35.0, 5.0);
  expect(near(fiveSecondsAgain, MCT_N1), "lever pulled back after 5 s, 5 s more in FLX/MCT: still MCT", fiveSecondsAgain);
}

/// Flex armed: the FLX/MCT detent gives FLEX thrust, never TOGA.
static void flexArmed() {
  Engine engine;
  engine.flexTemperatureEntered = true;
  const double flex = engine.run(35.0, 20.0);
  expect(near(flex, FLEX_N1), "flex armed, FLX/MCT for 20 s: FLEX", flex);
}

/// In flight the FLX/MCT detent is MCT: the automatic TOGA is a takeoff function only.
static void inFlight() {
  Engine engine;
  const double mct = engine.run(35.0, 20.0, false);
  expect(near(mct, MCT_N1), "in flight, FLX/MCT for 20 s: MCT", mct);
}

int main() {
  leverLeftInFlxMctWithoutFlex();
  leverBetweenMctAndToga();
  leverPulledBackBeforeTheDelay();
  flexArmed();
  inFlight();
  if (failures == 0) {
    std::printf("takeoff_auto_toga_test: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
