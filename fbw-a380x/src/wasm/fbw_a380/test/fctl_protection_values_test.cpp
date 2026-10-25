// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the A380 values of the normal law protections and of the law reconfiguration, with the generated
// A380PrimComputerFctl, A380PitchNormalLaw and A380LateralNormalLaw models: run test/run_tests.sh.
//
// Build with -DWITHOUT_THE_FIX to call the lateral normal law without its high lift input (its signature before the
// fix): the checks of the A380 values must then fail.

#include <cmath>
#include <cstdio>

#include "A380LateralNormalLaw.h"
#include "A380PitchNormalLaw.h"
#include "A380PrimComputerFctl.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FRAME_TIME = 0.05;

/// The PRIM FCTL model in flight at 10000 ft RA, clean, autopilots off, with valid air and inertial data.
struct PrimInFlight {
  A380PrimComputerFctl prim;

  PrimInFlight(double ias, double mach) {
    prim.initialize();
    auto& in = prim.A380PrimComputerFctl_U.in;
    in = {};
    in.data.time.dt = FRAME_TIME;
    in.data.sim_data.computer_running = true;
    in.general_logic.on_ground = false;
    in.general_logic.ra_computation_data_ft = 10000;
    in.general_logic.adr_computation_data.V_ias_kn = ias;
    in.general_logic.adr_computation_data.V_tas_kn = ias;
    in.general_logic.adr_computation_data.mach = mach;
    in.general_logic.adr_computation_data.alpha_deg = 3;
    in.general_logic.ir_computation_data.theta_deg = 3;
    in.general_logic.ir_computation_data.n_z_g = 1;
  }

  void run(double seconds) {
    auto& in = prim.A380PrimComputerFctl_U.in;
    for (double end = in.data.time.simulation_time + seconds; in.data.time.simulation_time < end;
         in.data.time.simulation_time += FRAME_TIME) {
      prim.step();
    }
  }

  const base_prim_fctl_logic_outputs& logic() const { return prim.A380PrimComputerFctl_Y.out.fctl_logic; }
};

static void highSpeedProtectionLimit() {
  PrimInFlight lowMach(300, 0.5);
  lowMach.run(1);
  expect(std::abs(lowMach.logic().high_speed_prot_hi_thresh_kn - 365) < 0.01,
         "full forward sidestick stabilises the speed at VD - 10 kt");

  // At M .88 and 300 kt the Mach limit MD - .02 is 300 * .94 / .88 kt.
  PrimInFlight highMach(300, 0.88);
  highMach.run(1);
  expect(std::abs(highMach.logic().high_speed_prot_hi_thresh_kn - 300 * 0.94 / 0.88) < 0.05,
         "full forward sidestick stabilises the speed at MD - .02");

  PrimInFlight belowActivation(348, 0.6);
  belowActivation.run(1);
  expect(!belowActivation.logic().high_speed_prot_active, "the protection is not active at VMO + 8 kt");

  PrimInFlight aboveActivation(352, 0.6);
  aboveActivation.run(1);
  expect(aboveActivation.logic().high_speed_prot_active, "the protection is active above VMO + 10 kt");

  PrimInFlight diving(342, 0.6);
  diving.prim.A380PrimComputerFctl_U.in.general_logic.ir_computation_data.theta_deg = -2;
  diving.run(1);
  expect(diving.logic().high_speed_prot_active, "in a 5 deg dive the protection is active from VMO");

  PrimInFlight divingBelowVmo(338, 0.6);
  divingBelowVmo.prim.A380PrimComputerFctl_U.in.general_logic.ir_computation_data.theta_deg = -2;
  divingBelowVmo.run(1);
  expect(!divingBelowVmo.logic().high_speed_prot_active, "the protection is never active below VMO");
}

static void directLawTriggers() {
  PrimInFlight highAlpha(200, 0.4);
  highAlpha.prim.A380PrimComputerFctl_U.in.general_logic.adr_computation_data.alpha_deg = 32;
  highAlpha.run(1);
  expect(highAlpha.logic().pitch_law_capability == a380_pitch_efcs_law::DirectLaw,
         "an angle of attack above 30 deg activates the abnormal attitude law (pitch direct)");

  PrimInFlight belowAbnormalAlpha(200, 0.4);
  belowAbnormalAlpha.prim.A380PrimComputerFctl_U.in.general_logic.adr_computation_data.alpha_deg = 29;
  belowAbnormalAlpha.run(1);
  expect(belowAbnormalAlpha.logic().pitch_law_capability != a380_pitch_efcs_law::DirectLaw,
         "29 deg angle of attack is not an abnormal attitude");

  PrimInFlight threeIrsLost(250, 0.5);
  threeIrsLost.prim.A380PrimComputerFctl_U.in.general_logic.triple_ir_failure = true;
  threeIrsLost.run(1);
  expect(threeIrsLost.logic().pitch_law_capability == a380_pitch_efcs_law::DirectLaw,
         "the loss of the three gyrometers (IRs) gives pitch direct law");
  expect(threeIrsLost.logic().lateral_law_capability == a380_lateral_efcs_law::DirectLaw,
         "the loss of the three gyrometers (IRs) gives roll direct law");
}

/// Elevator order of the pitch normal law after 15 s (in flight mode) of full aft sidestick at 27 deg pitch attitude, 250 kt.
static double elevatorOrderAt27DegNoseUp(double flapsHandleIndex) {
  static A380PitchNormalLaw law;
  law.init();
  law.reset();
  const double dt = FRAME_TIME;
  double time = 0;
  const double nz = 1, theta = 27, phi = 0, q = 0, qDot = 0, eta = 0, etaTrim = 0, alpha = 5, ias = 250, tas = 250,
               radioHeight = 10000, zero = 0, vls = 150, fullAftStick = 1, alphaProt = 30, alphaMax = 35,
               hspHigh = 365, hspLow = 340, apTheta = 0;
  const boolean_T tailstrikeProtection = false, onGround = false, tracking = false, highAoaProt = false,
                  highSpeedProt = false, apEngaged = false;
  double etaOut = 0, etaTrimDot = 0, etaTrimLimitLo = 0, etaTrimLimitUp = 0;
  for (; time < 15; time += dt) {
    law.step(&dt, &time, &nz, &theta, &phi, &q, &qDot, &eta, &etaTrim, &alpha, &ias, &tas, &radioHeight,
             &flapsHandleIndex, &zero, &zero, &zero, &zero, &zero, &tailstrikeProtection, &vls, &fullAftStick, &onGround,
             &tracking, &highAoaProt, &highSpeedProt, &alphaProt, &alphaMax, &hspHigh, &hspLow, &apTheta, &apEngaged,
             &etaOut, &etaTrimDot, &etaTrimLimitLo, &etaTrimLimitUp);
  }
  return etaOut;
}

static void pitchAttitudeLimit() {
  expect(std::abs(elevatorOrderAt27DegNoseUp(5) - elevatorOrderAt27DegNoseUp(0)) < 0.01,
         "the 30 deg nose-up limit is the same in CONF FULL as in clean configuration");
}

/// Aileron order of the lateral normal law after 10 s of full right sidestick, held at 63 deg bank at 200 kt.
static double aileronOrderAt63DegBank(bool highLift) {
  static A380LateralNormalLaw law;
  law.init();
  law.reset();
  const double dt = FRAME_TIME, theta = 5, phi = 63, r = 0, p = 0, beta = 0, ias = 200, tas = 200, fullRightStick = 1,
               pedals = 0, apPhi = 0, apBeta = 0;
  const boolean_T onGround = false, tracking = false, highAoaProt = false, highSpeedProt = false, apEngaged = false;
  const boolean_T highLiftInput = highLift;
  double xi = 0, zeta = 0;
  for (double time = 0; time < 10; time += dt) {
#ifdef WITHOUT_THE_FIX
    (void)highLiftInput;
    law.step(&dt, &theta, &phi, &r, &p, &beta, &ias, &tas, &fullRightStick, &pedals, &onGround, &tracking, &highAoaProt,
             &highSpeedProt, &apPhi, &apBeta, &apEngaged, &xi, &zeta);
#else
    law.step(&dt, &theta, &phi, &r, &p, &beta, &ias, &tas, &fullRightStick, &pedals, &onGround, &tracking, &highAoaProt,
             &highSpeedProt, &highLiftInput, &apPhi, &apBeta, &apEngaged, &xi, &zeta);
#endif
  }
  return xi;
}

static void bankAngleLimit() {
  const double clean = aileronOrderAt63DegBank(false);
  const double highLift = aileronOrderAt63DegBank(true);
  expect(std::abs(clean) > 0.1, "clean, at 63 deg bank the law still rolls towards the 67 deg limit");
  expect(clean * highLift < 0, "with slats or flaps extended, 63 deg bank is beyond the 60 deg limit: the law rolls back");
}

int main() {
  highSpeedProtectionLimit();
  directLawTriggers();
  pitchAttitudeLimit();
  bankAngleLimit();
  if (failures > 0) {
    std::printf("fctl_protection_values_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("fctl_protection_values_test: all checks passed\n");
  return 0;
}
