// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the alpha floor Mach inhibition of the generated A380PrimComputerFe model (flight envelope part of the
// PRIMs): run test/run_tests.sh.
//
// A380 FCOM DSC-22-27 Flight envelope protections, Alpha floor (a380_fcom.txt:9223-9226): "alpha-floor is inhibited if
// one of the following conditions occurs: - The Mach is above 0.5". The model used to inhibit it above M 0.6 only.

#include <cstdio>

#include "A380PrimComputerFe.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

/// Flies the model for 2 s in normal law, clean, 3000 ft RA, at a constant 200 kt and an angle of attack far above
/// the alpha floor threshold, at the given Mach. Returns the alpha floor condition of the last step.
static bool alphaFloorConditionAt(double mach) {
  A380PrimComputerFe model;
  model.initialize();

  prim_outputs& in = model.A380PrimComputerFe_U.in;
  in.data.sim_data.computer_running = true;
  in.data.time.dt = 0.05;
  in.general_logic.on_ground = false;
  in.general_logic.all_ra_failure = false;
  in.general_logic.ra_computation_data_ft = 3000.0;
  in.general_logic.flap_handle_index = 0.0F;
  in.general_logic.adr_computation_data.mach = mach;
  in.general_logic.adr_computation_data.V_ias_kn = 200.0;
  in.general_logic.adr_computation_data.alpha_deg = 25.0;
  in.fctl_logic.active_pitch_law = a380_pitch_efcs_law::NormalLaw;
  in.fctl_logic.high_alpha_prot_active = true;

  for (int step = 0; step < 40; ++step) {
    model.step();
  }

  return model.A380PrimComputerFe_Y.out.flight_envelope.alpha_floor_condition;
}

int main() {
  expect(alphaFloorConditionAt(0.45), "alpha floor at M 0.45 (below the M 0.5 inhibition)");
  expect(!alphaFloorConditionAt(0.55), "no alpha floor at M 0.55 (FCOM: inhibited above M 0.5)");
  expect(!alphaFloorConditionAt(0.65), "no alpha floor at M 0.65");

  if (failures == 0) {
    std::printf("alpha_floor_mach_inhibit_test: all checks passed\n");
    return 0;
  }
  return 1;
}
