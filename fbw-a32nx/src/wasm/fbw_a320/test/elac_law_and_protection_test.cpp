// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the generated ElacComputer: pitch law after a dual hydraulic loss, the high speed protection limit and
// the sidestick priority latch. Run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/model/ElacComputer.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FRAME_TIME = 0.05;
static constexpr uint32_T NORMAL_OPERATION = static_cast<uint32_T>(SignStatusMatrix::NormalOperation);

template <typename Bus>
static void setAllWordsValid(Bus& bus) {
  base_arinc_429* words = reinterpret_cast<base_arinc_429*>(&bus);
  for (size_t i = 0; i < sizeof(Bus) / sizeof(base_arinc_429); ++i) {
    words[i].SSM = NORMAL_OPERATION;
    words[i].Data = 0;
  }
}

/// ELAC 2 running with three valid ADRs, IRs and RAs; in flight at 10000 ft RA or on the ground. ELAC 1 and the SECs
/// are not simulated, so the laws are checked on the pitch law capability the ELAC computes.
struct Elac2 {
  ElacComputer computer;
  ElacComputer::ExternalInputs_ElacComputer_T inputs = {};
  double time = 0;

  explicit Elac2(bool onGround) {
    computer.initialize();
    auto& in = inputs.in;
    in.sim_data.computer_running = true;
    in.discrete_inputs.is_unit_2 = true;
    in.discrete_inputs.elac_engaged_from_switch = true;
    in.discrete_inputs.ap_1_disengaged = true;
    in.discrete_inputs.ap_2_disengaged = true;
    in.discrete_inputs.lgciu_1_nose_gear_pressed = onGround;
    in.discrete_inputs.lgciu_2_nose_gear_pressed = onGround;
    in.discrete_inputs.lgciu_1_left_main_gear_pressed = onGround;
    in.discrete_inputs.lgciu_2_left_main_gear_pressed = onGround;
    in.discrete_inputs.lgciu_1_right_main_gear_pressed = onGround;
    in.discrete_inputs.lgciu_2_right_main_gear_pressed = onGround;
    setHydraulics(true, true, true);

    base_adr_bus* adrs[] = {&in.bus_inputs.adr_1_bus, &in.bus_inputs.adr_2_bus, &in.bus_inputs.adr_3_bus};
    for (base_adr_bus* adr : adrs) {
      setAllWordsValid(*adr);
    }
    base_ir_bus* irs[] = {&in.bus_inputs.ir_1_bus, &in.bus_inputs.ir_2_bus, &in.bus_inputs.ir_3_bus};
    for (base_ir_bus* ir : irs) {
      setAllWordsValid(*ir);
      ir->body_normal_accel_g.Data = 1;
    }
    setAllWordsValid(in.bus_inputs.ra_1_bus);
    setAllWordsValid(in.bus_inputs.ra_2_bus);
    in.bus_inputs.ra_1_bus.radio_height_ft.Data = onGround ? 0 : 10000;
    in.bus_inputs.ra_2_bus.radio_height_ft.Data = onGround ? 0 : 10000;
    setAirData(onGround ? 0 : 250, onGround ? 0 : 0.45);
  }

  void setAirData(float ias, float mach) {
    base_adr_bus* adrs[] = {&inputs.in.bus_inputs.adr_1_bus, &inputs.in.bus_inputs.adr_2_bus,
                            &inputs.in.bus_inputs.adr_3_bus};
    for (base_adr_bus* adr : adrs) {
      adr->airspeed_computed_kn.Data = ias;
      adr->airspeed_true_kn.Data = ias;
      adr->mach.Data = mach;
      adr->aoa_corrected_deg.Data = 3;
    }
  }

  void setHydraulics(bool blue, bool green, bool yellow) {
    auto& in = inputs.in;
    in.analog_inputs.blue_hyd_pressure_psi = blue ? 3000 : 0;
    in.analog_inputs.green_hyd_pressure_psi = green ? 3000 : 0;
    in.analog_inputs.yellow_hyd_pressure_psi = yellow ? 3000 : 0;
    in.discrete_inputs.blue_low_pressure = !blue;
    in.discrete_inputs.green_low_pressure = !green;
    in.discrete_inputs.yellow_low_pressure = !yellow;
  }

  void run(double seconds) {
    for (double end = time + seconds; time < end; time += FRAME_TIME) {
      inputs.in.time.dt = FRAME_TIME;
      inputs.in.time.simulation_time = time;
      inputs.in.time.monotonic_time = time;
      computer.setExternalInputs(&inputs);
      computer.step();
    }
  }

  const elac_outputs& out() const { return computer.getExternalOutputs().out; }
};

static void pitchLawAfterDualHydraulicLoss() {
  Elac2 allPressurised(false);
  allPressurised.run(5);
  expect(allPressurised.out().logic.is_engaged_in_pitch, "ELAC 2 is engaged in pitch with the 3 hydraulic systems");
  expect(allPressurised.out().logic.pitch_law_capability == pitch_efcs_law::NormalLaw,
         "normal law with the 3 hydraulic systems");

  // Only the right elevator is lost: ELAC 2 keeps the pitch axis on the left elevator (green) and stays in normal law.
  Elac2 blueAndYellowLost(false);
  blueAndYellowLost.run(5);
  blueAndYellowLost.setHydraulics(false, true, false);
  blueAndYellowLost.run(5);
  expect(blueAndYellowLost.out().logic.is_engaged_in_pitch, "ELAC 2 keeps the pitch axis after the B+Y loss");
  expect(blueAndYellowLost.out().logic.pitch_law_capability == pitch_efcs_law::NormalLaw,
         "pitch normal law remains active after the B+Y loss");

  Elac2 greenAndBlueLost(false);
  greenAndBlueLost.run(5);
  greenAndBlueLost.setHydraulics(false, false, true);
  greenAndBlueLost.run(5);
  expect(greenAndBlueLost.out().logic.pitch_law_capability == pitch_efcs_law::AlternateLaw2,
         "alternate law with roll direct (ALT2) after the G+B loss");

  Elac2 greenAndYellowLost(false);
  greenAndYellowLost.run(5);
  greenAndYellowLost.setHydraulics(true, false, false);
  greenAndYellowLost.run(5);
  expect(greenAndYellowLost.out().logic.pitch_law_capability == pitch_efcs_law::AlternateLaw1,
         "alternate law after the G+Y loss");
}

static void highSpeedProtectionLimit() {
  Elac2 lowMach(false);
  lowMach.run(2);
  expect(std::abs(lowMach.out().logic.high_speed_prot_hi_thresh_kn - 366) < 0.01,
         "full nose-down authority ends at VMO + 16 kt");

  // At M .82 and 300 kt the Mach limit MMO + .04 is 300 * .86 / .82 kt.
  Elac2 highMach(false);
  highMach.setAirData(300, 0.82);
  highMach.run(2);
  expect(std::abs(highMach.out().logic.high_speed_prot_hi_thresh_kn - 300 * 0.86 / 0.82) < 0.05,
         "full nose-down authority ends at MMO + .04");
}

/// The F/O keeps the take over pb pressed for the given time, then releases it: is the CAPT sidestick still
/// deactivated 1 s later?
static bool captSidestickDisabledAfterFoTakeover(double pressedSeconds) {
  Elac2 elac(true);
  elac.run(2);
  elac.inputs.in.discrete_inputs.fo_priority_takeover_pressed = true;
  elac.run(pressedSeconds);
  elac.inputs.in.discrete_inputs.fo_priority_takeover_pressed = false;
  elac.run(1);
  return elac.out().logic.left_sidestick_disabled;
}

static void sidestickPriorityLatch() {
  expect(!captSidestickDisabledAfterFoTakeover(35),
         "a 35 s take over does not latch: the CAPT sidestick is active again after the release");
  expect(captSidestickDisabledAfterFoTakeover(41),
         "a take over held 40 s latches: the CAPT sidestick stays deactivated after the release");
}

int main() {
  pitchLawAfterDualHydraulicLoss();
  highSpeedProtectionLimit();
  sidestickPriorityLatch();
  if (failures > 0) {
    std::printf("elac_law_and_protection_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("elac_law_and_protection_test: all checks passed\n");
  return 0;
}
