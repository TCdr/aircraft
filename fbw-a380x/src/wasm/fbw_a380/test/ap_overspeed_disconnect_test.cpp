// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the autopilot disconnection on overspeed (run test/run_tests.sh): the generated A380PrimComputerFg model, used
// as it is, with a healthy PRIM, FCUs and air data, and nothing else disconnecting the autopilot.
//
// The autopilot disengages at 15 kt above VMO or 0.04 Mach above MMO (VMO 340 kt, MMO 0.89), whatever the autopilot modes.

#include <cstdio>

#include "A380PrimComputerFg.h"
#include "AutopilotOverspeed.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

constexpr double TIME_STEP_S = 0.05;

constexpr double VMO_KNOTS                     = 340.0;
constexpr double MMO                           = 0.89;
constexpr double CRUISE_KNOTS                  = 300.0;
constexpr double CRUISE_MACH                   = 0.5;
constexpr double LOWEST_SELECTABLE_SPEED_KNOTS = 140.0;

/// PRIM 1 in flight, master, healthy: the autopilot 1 engaged with its pushbutton.
class EngagedAutopilot {
 public:
  EngagedAutopilot() {
    fg.initialize();
    inputs.data.sim_data.computer_running                = true;
    inputs.fctl_logic.ap_authorised                      = true;
    inputs.fctl_logic.is_master_prim                     = true;
    inputs.data.discrete_inputs.fcu_1_healthy            = true;
    inputs.data.discrete_inputs.fcu_2_healthy            = true;
    inputs.data.discrete_inputs.is_unit_1                = true;
    inputs.general_logic.engine_running                  = true;
    inputs.flight_envelope.v_max_kn                      = VMO_KNOTS;
    inputs.flight_envelope.v_ls_kn                       = LOWEST_SELECTABLE_SPEED_KNOTS;

    fly(6.0, CRUISE_KNOTS, CRUISE_MACH);
    pushApButton();
    fly(3.0, CRUISE_KNOTS, CRUISE_MACH);
  }

  void fly(double seconds, double speedKnots, double mach) {
    inputs.general_logic.adr_computation_data.V_ias_kn = speedKnots;
    inputs.general_logic.adr_computation_data.mach     = mach;
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      step();
    }
  }

  void pushApButton() {
    inputs.data.discrete_inputs.ap_1_pushbutton_pressed = true;
    fly(0.3, inputs.general_logic.adr_computation_data.V_ias_kn, inputs.general_logic.adr_computation_data.mach);
    inputs.data.discrete_inputs.ap_1_pushbutton_pressed = false;
  }

  bool isEngaged() const { return fg.A380PrimComputerFg_Y.out.fg_logic.ap_1_engaged; }

 private:
  void step() {
    time += TIME_STEP_S;
    inputs.data.time.dt              = TIME_STEP_S;
    inputs.data.time.simulation_time = time;
    inputs.data.time.monotonic_time  = time;
    fg.A380PrimComputerFg_U.in       = inputs;
    fg.step();
  }

  A380PrimComputerFg fg;
  prim_outputs       inputs{};
  double             time = 0.0;
};

static void theThresholdsAreFifteenKnotsAndFourHundredthsOfMach() {
  using AutopilotOverspeed::isExceeded;
  expect(!isExceeded(VMO_KNOTS + 14.9, MMO - 0.1, VMO_KNOTS, MMO), "helper: VMO + 14.9 kt is not an overspeed disconnection");
  expect(isExceeded(VMO_KNOTS + 15.0, MMO - 0.1, VMO_KNOTS, MMO), "helper: VMO + 15 kt disconnects");
  expect(!isExceeded(VMO_KNOTS - 20.0, MMO + 0.039, VMO_KNOTS, MMO), "helper: MMO + 0.039 is not an overspeed disconnection");
  expect(isExceeded(VMO_KNOTS - 20.0, MMO + 0.04, VMO_KNOTS, MMO), "helper: MMO + 0.04 disconnects");
}

static void theAutopilotEngagesAndStaysEngagedBelowTheLimits() {
  EngagedAutopilot autopilot;
  expect(autopilot.isEngaged(), "test setup: the autopilot is engaged at cruise speed");
  autopilot.fly(5.0, VMO_KNOTS, CRUISE_MACH);
  expect(autopilot.isEngaged(), "at VMO the autopilot stays engaged");
  autopilot.fly(5.0, VMO_KNOTS + 14.0, MMO + 0.03);
  expect(autopilot.isEngaged(), "just below VMO + 15 kt and MMO + 0.04 the autopilot stays engaged");
}

static void theAutopilotDisengagesAboveTheLimits() {
  {
    EngagedAutopilot autopilot;
    autopilot.fly(3.0, VMO_KNOTS + 16.0, CRUISE_MACH);
    expect(!autopilot.isEngaged(), "VMO + 16 kt: the autopilot disengages");
  }
  {
    EngagedAutopilot autopilot;
    autopilot.fly(3.0, CRUISE_KNOTS, MMO + 0.05);
    expect(!autopilot.isEngaged(), "MMO + 0.05: the autopilot disengages");
  }
}

static void theAutopilotStaysOffUntilTheCrewEngagesItAgain() {
  EngagedAutopilot autopilot;
  autopilot.fly(3.0, VMO_KNOTS + 16.0, CRUISE_MACH);
  autopilot.fly(5.0, CRUISE_KNOTS, CRUISE_MACH);
  expect(!autopilot.isEngaged(), "back at cruise speed the autopilot stays off");
  autopilot.pushApButton();
  autopilot.fly(3.0, CRUISE_KNOTS, CRUISE_MACH);
  expect(autopilot.isEngaged(), "the crew can engage it again once the speed is normal");
}

int main() {
  theThresholdsAreFifteenKnotsAndFourHundredthsOfMach();
  theAutopilotEngagesAndStaysEngagedBelowTheLimits();
  theAutopilotDisengagesAboveTheLimits();
  theAutopilotStaysOffUntilTheCrewEngagesItAgain();
  if (failures > 0) {
    std::printf("ap_overspeed_disconnect_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("ap_overspeed_disconnect_test: all tests passed\n");
  return 0;
}
