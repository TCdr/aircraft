// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the autopilot disconnection on overspeed (run test/run_tests.sh): the generated FmgcComputer, used as it is,
// fed like FlyByWireInterface feeds it (valid buses, healthy FACs and FCU, nothing else disconnecting the autopilot).
//
// The autopilot disengages at 15 kt above VMO or 0.04 Mach above MMO (VMO 350 kt, MMO 0.82), whatever the autopilot modes.

#include <cstdio>

#include "../src/fmgc/Fmgc.h"
#include "AutopilotOverspeed.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

constexpr double   TIME_STEP_S      = 0.05;
constexpr uint32_T NORMAL_OPERATION = 3;

constexpr double VMO_KNOTS    = 350.0;
constexpr double MMO          = 0.82;
constexpr double CRUISE_KNOTS = 300.0;
constexpr double CRUISE_MACH  = 0.52;
// bits 11 and 13: what the FMGC needs from a FAC to let the autopilot engage
constexpr float FAC_DISCRETE_WORD_2_AP_AVAILABLE = 5120.0F;

static void setWord(base_arinc_429& word, float data) {
  word.SSM  = NORMAL_OPERATION;
  word.Data = data;
}

/// All the words of the buses valid (SSM normal operation), zero data; the values the autopilot needs are set per frame.
static void makeAllBusWordsValid(base_fmgc_bus_inputs& buses) {
  auto*        words = reinterpret_cast<base_arinc_429*>(&buses);
  const size_t count = sizeof(buses) / sizeof(base_arinc_429);
  for (size_t i = 0; i < count; ++i) {
    words[i].SSM  = NORMAL_OPERATION;
    words[i].Data = 0;
  }
}

/// FMGC 1 in level flight at 10 000 ft with the FD on, the autopilot engaged by its button.
class EngagedAutopilot {
 public:
  EngagedAutopilot() : fmgc(true) {
    auto& discrete = fmgc.modelInputs.in.discrete_inputs;
    discrete.is_unit_1 = true;
    discrete.fcu_opp_healthy = discrete.fcu_own_healthy = discrete.fac_opp_healthy = discrete.fac_own_healthy = true;
    discrete.fmgc_opp_healthy = true;
    discrete.fwc_opp_valid = discrete.fwc_own_valid = discrete.pfd_opp_valid = discrete.pfd_own_valid = true;
    discrete.bscu_opp_valid = discrete.bscu_own_valid = true;
    discrete.nav_control_own = true;
    fmgc.modelInputs.in.fms_inputs.fm_valid = true;
    makeAllBusWordsValid(fmgc.modelInputs.in.bus_inputs);

    fly(8.0, CRUISE_KNOTS, CRUISE_MACH);
    pushApButton();
    fly(3.0, CRUISE_KNOTS, CRUISE_MACH);
  }

  void fly(double seconds, double speedKnots, double mach) {
    auto& buses = fmgc.modelInputs.in.bus_inputs;
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      time += TIME_STEP_S;
      setAirData(buses.adr_own_bus, speedKnots, mach);
      setAirData(buses.adr_opp_bus, speedKnots, mach);
      setAirData(buses.adr_3_bus, speedKnots, mach);
      setInertialData(buses.ir_own_bus);
      setInertialData(buses.ir_opp_bus);
      setInertialData(buses.ir_3_bus);
      setFacData(buses.fac_own_bus);
      setFacData(buses.fac_opp_bus);
      setWord(buses.ra_own_bus.radio_height_ft, 10000);
      setWord(buses.ra_opp_bus.radio_height_ft, 10000);
      setWord(buses.fcu_bus.selected_alt_ft, 10000);
      setWord(buses.fcu_bus.selected_spd_kts, 250);
      setWord(buses.fcu_bus.selected_hdg_deg, 90);
      fmgc.modelInputs.in.time.dt              = TIME_STEP_S;
      fmgc.modelInputs.in.time.simulation_time = time;
      fmgc.modelInputs.in.time.monotonic_time  = time;
      fmgc.update(TIME_STEP_S, time, false, true);
    }
  }

  void pushApButton() {
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = true;
    fly(0.3, CRUISE_KNOTS, CRUISE_MACH);
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = false;
  }

  bool isEngaged() const { return fmgc.getDebugOutputs().logic.ap_own_engaged; }

 private:
  static void setAirData(base_adr_bus& adr, double speedKnots, double mach) {
    setWord(adr.altitude_standard_ft, 10000);
    setWord(adr.altitude_corrected_1_ft, 10000);
    setWord(adr.altitude_corrected_2_ft, 10000);
    setWord(adr.mach, static_cast<float>(mach));
    setWord(adr.airspeed_computed_kn, static_cast<float>(speedKnots));
    setWord(adr.airspeed_true_kn, static_cast<float>(speedKnots * 1.2));
    setWord(adr.vertical_speed_ft_min, 0);
    setWord(adr.aoa_corrected_deg, 3);
    setWord(adr.corrected_average_static_pressure, 697);
  }

  static void setInertialData(base_ir_bus& ir) {
    setWord(ir.pitch_angle_deg, 3);
    setWord(ir.roll_angle_deg, 0);
    setWord(ir.heading_magnetic_deg, 90);
    setWord(ir.heading_true_deg, 90);
    setWord(ir.track_angle_magnetic_deg, 90);
    setWord(ir.track_angle_true_deg, 90);
    setWord(ir.ground_speed_kn, 300);
    setWord(ir.flight_path_angle_deg, 0);
    setWord(ir.body_normal_accel_g, 1);
    setWord(ir.vertical_accel_g, 1);
    setWord(ir.inertial_alt_ft, 10000);
    setWord(ir.inertial_vertical_speed_ft_s, 0);
  }

  static void setFacData(base_fac_bus& fac) {
    setWord(fac.v_ls_kn, 140);
    setWord(fac.v_stall_kn, 120);
    setWord(fac.v_alpha_prot_kn, 130);
    setWord(fac.v_alpha_lim_kn, 125);
    setWord(fac.v_max_kn, static_cast<float>(VMO_KNOTS));
    setWord(fac.total_weight_lbs, 140000);
    setWord(fac.center_of_gravity_pos_percent, 30);
    setWord(fac.discrete_word_2, FAC_DISCRETE_WORD_2_AP_AVAILABLE);
  }

  Fmgc   fmgc;
  double time = 0.0;
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
