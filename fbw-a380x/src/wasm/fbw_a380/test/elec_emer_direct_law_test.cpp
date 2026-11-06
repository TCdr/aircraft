// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the direct law in the electrical emergency configuration, with the generated A380PrimComputerFctl model:
// run test/run_tests.sh.
//
// Build with -DWITHOUT_THE_FIX to leave the electrical emergency input unset (the model before the fix): the checks of the
// direct law must then fail.

#include <cstdio>

#include "A380PrimComputerFctl.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FRAME_TIME = 0.05;

/// One PRIM FCTL model at 250 kt, M .5 and 10000 ft RA, clean, autopilots off, with valid air and inertial data.
struct PrimInFlight {
  A380PrimComputerFctl prim;

  PrimInFlight() {
    prim.initialize();
    auto& in = prim.A380PrimComputerFctl_U.in;
    in = {};
    in.data.time.dt = FRAME_TIME;
    in.data.sim_data.computer_running = true;
    in.general_logic.on_ground = false;
    in.general_logic.ra_computation_data_ft = 10000;
    in.general_logic.adr_computation_data.V_ias_kn = 250;
    in.general_logic.adr_computation_data.V_tas_kn = 250;
    in.general_logic.adr_computation_data.mach = 0.5;
    in.general_logic.adr_computation_data.alpha_deg = 3;
    in.general_logic.ir_computation_data.theta_deg = 3;
    in.general_logic.ir_computation_data.n_z_g = 1;
  }

  void setElecEmerConfig(bool lost) {
#ifndef WITHOUT_THE_FIX
    prim.A380PrimComputerFctl_U.in.data.discrete_inputs.elec_emer_config = lost;
#else
    (void)lost;
#endif
  }

  void run(double seconds) {
    auto& in = prim.A380PrimComputerFctl_U.in;
    for (double end = in.data.time.simulation_time + seconds; in.data.time.simulation_time < end;
         in.data.time.simulation_time += FRAME_TIME) {
      prim.step();
    }
  }

  bool pitchIsDirect() const {
    return prim.A380PrimComputerFctl_Y.out.fctl_logic.pitch_law_capability == a380_pitch_efcs_law::DirectLaw;
  }

  bool lateralIsDirect() const {
    return prim.A380PrimComputerFctl_Y.out.fctl_logic.lateral_law_capability == a380_lateral_efcs_law::DirectLaw;
  }
};

/// The three PRIMs exchanging their law status words, as the wrapper does with the output bus of each one.
struct ThreePrims {
  PrimInFlight prims[3];

  ThreePrims() {
    for (int i = 0; i < 3; ++i) {
      prims[i].prim.A380PrimComputerFctl_U.in.data.discrete_inputs.is_unit_1 = (i == 0);
      prims[i].prim.A380PrimComputerFctl_U.in.data.discrete_inputs.is_unit_2 = (i == 1);
      prims[i].prim.A380PrimComputerFctl_U.in.data.discrete_inputs.is_unit_3 = (i == 2);
    }
  }

  void run(double seconds) {
    for (double time = 0; time < seconds; time += FRAME_TIME) {
      for (auto& prim : prims) {
        prim.run(FRAME_TIME);
      }
      // PRIM x is the lower numbered of the two other PRIMs, PRIM y the higher one
      for (int i = 0; i < 3; ++i) {
        const int x = (i == 0) ? 1 : 0;
        const int y = (i == 2) ? 1 : 2;
        auto& in = prims[i].prim.A380PrimComputerFctl_U.in.data.bus_inputs;
        in.prim_x_bus.fctl = prims[x].prim.A380PrimComputerFctl_Y.out.bus_outputs.fctl;
        in.prim_y_bus.fctl = prims[y].prim.A380PrimComputerFctl_Y.out.bus_outputs.fctl;
      }
    }
  }

  /// The pitch law of the PRIM that flies the aircraft: the one that sends its law as active.
  a380_pitch_efcs_law activePitchLaw() const {
    for (const auto& prim : prims) {
      const auto law = prim.prim.A380PrimComputerFctl_Y.out.fctl_logic.active_pitch_law;
      if (law != a380_pitch_efcs_law::None) {
        return law;
      }
    }
    return a380_pitch_efcs_law::None;
  }
};

static void acBusbarsLostInFlight() {
  // The PRIM with the best law becomes the active one: all three must reach direct law, or the one that stays in normal
  // law takes over from the others.
  ThreePrims all;
  for (auto& prim : all.prims) {
    prim.setElecEmerConfig(true);
  }
  all.run(1);
  for (int i = 0; i < 3; ++i) {
    char what[96];
    std::snprintf(what, sizeof(what), "PRIM %d: all four AC busbars lost in flight gives pitch direct law", i + 1);
    expect(all.prims[i].pitchIsDirect(), what);
    std::snprintf(what, sizeof(what), "PRIM %d: all four AC busbars lost in flight gives roll direct law", i + 1);
    expect(all.prims[i].lateralIsDirect(), what);
  }
  expect(all.activePitchLaw() == a380_pitch_efcs_law::DirectLaw, "the active PRIM flies pitch direct law");

  // Why every PRIM needs the input: with only PRIM 1 fed, a PRIM with a better law takes over from it.
  ThreePrims onlyPrim1;
  onlyPrim1.prims[0].setElecEmerConfig(true);
  onlyPrim1.run(1);
  expect(onlyPrim1.prims[0].pitchIsDirect(), "the PRIM that gets the input has pitch direct law");
  expect(onlyPrim1.activePitchLaw() != a380_pitch_efcs_law::DirectLaw && onlyPrim1.activePitchLaw() != a380_pitch_efcs_law::None,
         "with only one PRIM fed, a PRIM that is not in direct law is the active one (so all three must be fed)");
}

static void acBusbarBack() {
  PrimInFlight prim;
  prim.setElecEmerConfig(false);
  prim.run(1);
  expect(!prim.pitchIsDirect(), "with the AC busbars powered the pitch law is not direct");
  expect(!prim.lateralIsDirect(), "with the AC busbars powered the roll law is not direct");
}

static void onTheGround() {
  PrimInFlight prim;
  prim.prim.A380PrimComputerFctl_U.in.general_logic.on_ground = true;
  prim.setElecEmerConfig(true);
  prim.run(1);
  expect(!prim.pitchIsDirect(), "on the ground the lost AC busbars (batteries only) do not give pitch direct law");
  expect(!prim.lateralIsDirect(), "on the ground the lost AC busbars (batteries only) do not give roll direct law");
}

static void lawReturnsWhenABusbarComesBack() {
  PrimInFlight prim;
  prim.setElecEmerConfig(true);
  prim.run(1);
  expect(prim.pitchIsDirect(), "direct law while the AC busbars are lost");
  prim.setElecEmerConfig(false);
  prim.run(1);
  expect(!prim.pitchIsDirect(), "the pitch law leaves direct law when an AC busbar is powered again");
  expect(!prim.lateralIsDirect(), "the roll law leaves direct law when an AC busbar is powered again");
}

int main() {
  acBusbarsLostInFlight();
  acBusbarBack();
  onTheGround();
  lawReturnsWhenABusbarComesBack();
  if (failures > 0) {
    std::printf("elec_emer_direct_law_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("elec_emer_direct_law_test: all checks passed\n");
  return 0;
}
