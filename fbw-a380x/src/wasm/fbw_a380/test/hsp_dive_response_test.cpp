// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the A380 high speed and pitch down protections: the generated A380PrimComputerFctl (activation and
// speed thresholds) and A380PitchNormalLaw fly a point-mass A380 that dives with the sidestick held full forward. Run
// test/run_tests.sh.
//
// With full forward sidestick the pitch must stay within 15 deg nose down and the speed must stabilise at VD - 10 kt
// (365 kt) without passing VD (375 kt), then come back to VMO (340 kt) once the sidestick is released.

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "A380PitchNormalLaw.h"
#include "A380PrimComputerFctl.h"

static int failures = 0;

static void expect(bool condition, const char* what, const char* model) {
  if (!condition) {
    std::printf("FAIL %s (%s)\n", what, model);
    ++failures;
  }
}

static constexpr double FRAME_TIME = 0.05;
static constexpr double G = 9.81;
static constexpr double KNOTS_PER_MS = 1.94384;
static constexpr double FEET_PER_M = 3.28084;
static constexpr double DEG_PER_RAD = 57.29578;

// Point-mass A380, clean, 450 t, thrust levers in CL, starting level at 320 kt, FL150, in the ISA.
static constexpr double MASS_KG = 450000;
static constexpr double WING_AREA_M2 = 845;
static constexpr double SEA_LEVEL_DENSITY = 1.225;
static constexpr double SEA_LEVEL_SPEED_OF_SOUND_KN = 661.47;
static constexpr double ISA_LAPSE_PER_FT = 6.8756e-6;  // temperature ratio lost per foot below the tropopause
static constexpr double ISA_DENSITY_EXPONENT = 4.2559;
static constexpr double START_ALTITUDE_FT = 15000;
static constexpr double LIFT_SLOPE_PER_RAD = 5.5;
static constexpr double ZERO_LIFT_ALPHA_DEG = -2;
static constexpr double PARASITE_DRAG = 0.018;
static constexpr double INDUCED_DRAG_FACTOR = 0.045;
static constexpr double REFERENCE_EAS_KN = 320;
static constexpr double ELEVATOR_LAG_S = 0.1;
// Climb thrust at FL150: the sim recording of the A380X (320 kt level, A/THR off, levers in CL) gains 0.85 kt/s.
static constexpr double THRUST_N = 515000;

/// The short period: a second-order response of the angle of attack to the elevator, scaled with the dynamic pressure.
/// No single set matches the sim, so the dive is flown with several: the first holds the pitch, the others overshoot
/// it as the sim recording did (20 deg nose down and 388 kt with the protection starting at VMO + 10 kt).
struct PitchModel {
  const char* name;
  double stiffness;           // q dot per deg of alpha away from trim, at the reference speed
  double damping;             // q dot per deg/s of pitch rate, at the reference speed
  double elevatorPower;       // q dot per deg of elevator (negative elevator is nose up)
  double noseDownTravelDeg;   // elevator travel available for nose down
};

static constexpr PitchModel PITCH_MODELS[] = {
    {"stiff", -2.0, -1.4, -0.8, 30},
    {"short nose-down travel", -2.0, -1.4, -0.8, 10},
    {"soft, short nose-down travel", -1.5, -1.4, -0.8, 12},
    {"weak elevator", -2.0, -1.4, -0.4, 30},
};

static double densityRatio(double altitudeFt) {
  return std::pow(1 - ISA_LAPSE_PER_FT * altitudeFt, ISA_DENSITY_EXPONENT);
}

static double dynamicPressure(double easKn) {
  const double eas = easKn / KNOTS_PER_MS;
  return 0.5 * SEA_LEVEL_DENSITY * eas * eas;
}

static double liftCoefficient(double alphaDeg) {
  return LIFT_SLOPE_PER_RAD * (alphaDeg - ZERO_LIFT_ALPHA_DEG) / DEG_PER_RAD;
}

static double drag(double easKn, double alphaDeg) {
  const double cl = liftCoefficient(alphaDeg);
  return dynamicPressure(easKn) * WING_AREA_M2 * (PARASITE_DRAG + INDUCED_DRAG_FACTOR * cl * cl);
}

struct DiveResult {
  double peakIasKn = 0;
  double lowestPitchDeg = 0;
  double iasAfterHoldKn = 0;
  double iasAfterReleaseKn = 0;
};

/// Level at 320 kt, then the sidestick full forward for holdSeconds, then released for releaseSeconds.
static DiveResult fullForwardDive(const PitchModel& model, double holdSeconds, double releaseSeconds) {
  A380PrimComputerFctl prim;
  prim.initialize();
  auto& primIn = prim.A380PrimComputerFctl_U.in;
  primIn = {};
  primIn.data.time.dt = FRAME_TIME;
  primIn.data.sim_data.computer_running = true;
  primIn.general_logic.on_ground = false;
  primIn.general_logic.ra_computation_data_ft = 15000;
  const auto& logic = prim.A380PrimComputerFctl_Y.out.fctl_logic;

  static A380PitchNormalLaw law;
  law.init();
  law.reset();

  const double trimAlphaDeg = MASS_KG * G / (dynamicPressure(REFERENCE_EAS_KN) * WING_AREA_M2) /
                                  LIFT_SLOPE_PER_RAD * DEG_PER_RAD +
                              ZERO_LIFT_ALPHA_DEG;

  double altitudeFt = START_ALTITUDE_FT, tas = REFERENCE_EAS_KN / std::sqrt(densityRatio(START_ALTITUDE_FT));
  double gammaRad = 0, alpha = trimAlphaDeg, q = 0, qDot = 0, eta = 0, etaOrder = 0;
  const double phi = 0, etaTrim = 0, radioHeight = 15000, zero = 0, vls = 200, alphaProt = 30, alphaMax = 35,
               apTheta = 0;
  const boolean_T no = false;
  double trimDot = 0, trimLimitLo = 0, trimLimitUp = 0;

  DiveResult result;
  double peakNz = 0;
  const double stickForwardAt = 5, releaseAt = stickForwardAt + holdSeconds, end = releaseAt + releaseSeconds;
  for (double time = 0; time < end; time += FRAME_TIME) {
    const double ias = tas * std::sqrt(densityRatio(altitudeFt));
    const double lift = dynamicPressure(ias) * WING_AREA_M2 * liftCoefficient(alpha);
    const double nz = lift / (MASS_KG * G);
    const double theta = gammaRad * DEG_PER_RAD + alpha;
    const double stick = time >= stickForwardAt && time < releaseAt ? -1 : 0;

    auto& adr = primIn.general_logic.adr_computation_data;
    adr.V_ias_kn = ias;
    adr.V_tas_kn = tas;
    adr.mach = tas / (SEA_LEVEL_SPEED_OF_SOUND_KN * std::sqrt(1 - ISA_LAPSE_PER_FT * altitudeFt));
    adr.alpha_deg = alpha;
    primIn.general_logic.ir_computation_data.n_z_g = nz;
    primIn.general_logic.ir_computation_data.theta_deg = theta;
    primIn.data.time.simulation_time = time;
    primIn.data.time.monotonic_time = time;
    prim.step();
    const boolean_T hspActive = logic.high_speed_prot_active;
    const double hspHigh = logic.high_speed_prot_hi_thresh_kn, hspLow = logic.high_speed_prot_lo_thresh_kn;

    law.step(&FRAME_TIME, &time, &nz, &theta, &phi, &q, &qDot, &eta, &etaTrim, &alpha, &ias, &tas, &radioHeight, &zero,
             &zero, &zero, &zero, &zero, &zero, &no, &vls, &stick, &no, &no, &no, &hspActive, &alphaProt, &alphaMax,
             &hspHigh, &hspLow, &apTheta, &no, &etaOrder, &trimDot, &trimLimitLo, &trimLimitUp);

    // The dynamic pressure follows the indicated speed: in a fast descent the denser air raises it at constant TAS.
    const double pressureRatio = ias / REFERENCE_EAS_KN;
    eta += (std::min(etaOrder, model.noseDownTravelDeg) - eta) * FRAME_TIME / ELEVATOR_LAG_S;
    qDot = pressureRatio * pressureRatio * (model.stiffness * (alpha - trimAlphaDeg) + model.elevatorPower * eta) +
           pressureRatio * model.damping * q;
    const double tasMs = tas / KNOTS_PER_MS;
    const double gammaDot = G / tasMs * (nz - std::cos(gammaRad));
    const double tasDot = (THRUST_N - drag(ias, alpha)) / MASS_KG - G * std::sin(gammaRad);
    q += qDot * FRAME_TIME;
    alpha += (q - gammaDot * DEG_PER_RAD) * FRAME_TIME;
    altitudeFt += tasMs * std::sin(gammaRad) * FEET_PER_M * FRAME_TIME;
    gammaRad += gammaDot * FRAME_TIME;
    tas += tasDot * KNOTS_PER_MS * FRAME_TIME;

    result.peakIasKn = std::max(result.peakIasKn, ias);
    result.lowestPitchDeg = std::min(result.lowestPitchDeg, theta);
    peakNz = std::max(peakNz, nz);
    if (time < releaseAt) {
      result.iasAfterHoldKn = ias;
    }
    result.iasAfterReleaseKn = ias;
  }
  std::printf("%s: lowest pitch %.1f deg, peak %.2f g, peak %.1f kt, %.1f kt after %.0f s held, %.1f kt %.0f s after release\n",
              model.name, result.lowestPitchDeg, peakNz, result.peakIasKn, result.iasAfterHoldKn, holdSeconds,
              result.iasAfterReleaseKn, releaseSeconds);
  return result;
}

int main() {
  for (const PitchModel& model : PITCH_MODELS) {
    const DiveResult dive = fullForwardDive(model, 90, 90);
    expect(dive.lowestPitchDeg > -15.5, "full forward sidestick: the pitch stays within 15 deg nose down", model.name);
    expect(dive.peakIasKn < 375, "full forward sidestick: the speed stays below VD (375 kt)", model.name);
    expect(std::abs(dive.iasAfterHoldKn - 365) < 3, "full forward sidestick: the speed stabilises at VD - 10 kt (365 kt)",
           model.name);
    // Released, the protection targets VMO and ends once below it: with climb thrust the speed settles on VMO.
    expect(dive.iasAfterReleaseKn < 342, "sidestick released: the speed comes back to VMO (340 kt)", model.name);
  }
  if (failures > 0) {
    std::printf("hsp_dive_response_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("hsp_dive_response_test: all checks passed\n");
  return 0;
}
