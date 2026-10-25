// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the derated thrust ratings of the FADEC (src/Fadec/ThrustDerate_A32NX.hpp): the derated takeoff, the
// derated climb and the soft go-around. Run test/run_tests.sh. Built with -DWITHOUT_THE_FIX the N1 limit ignores the reduction
// and the climb stays at the maximum climb thrust: the checks fail.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/ThrustDerate_A32NX.hpp"

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.3f)\n", what, value);
    ++failures;
  }
}

static constexpr double RATED_CORRECTED_N1 = 85.0;

static double deratedN1(double ratedN1, double reduction) {
#ifdef WITHOUT_THE_FIX
  (void)reduction;
  return ratedN1;
#else
  return ThrustDerate_A32NX::deratedCorrectedN1(ratedN1, reduction);
#endif
}

static void eachLevelReducesTheThrustByItsPercentage() {
  const double ratedThrust = ThrustDerate_A32NX::thrustOfCorrectedN1(RATED_CORRECTED_N1);
  double       previousN1  = RATED_CORRECTED_N1;
  for (int level = 1; level <= ThrustDerate_A32NX::TAKEOFF_LEVELS; ++level) {
    const double reduction = level * ThrustDerate_A32NX::TAKEOFF_THRUST_REDUCTION_PER_LEVEL;
    const double n1        = deratedN1(RATED_CORRECTED_N1, reduction);
    const double thrust    = ThrustDerate_A32NX::thrustOfCorrectedN1(n1);
    expect("derate level lowers the N1", n1 < previousN1, n1);
    expect("derate level reduces the thrust by its percentage", std::abs(thrust / ratedThrust - (1.0 - reduction / 100.0)) < 0.002,
           thrust / ratedThrust);
    previousN1 = n1;
  }
}

static void noReductionKeepsTheRating() {
  expect("no derate keeps the N1", deratedN1(RATED_CORRECTED_N1, 0.0) == RATED_CORRECTED_N1, deratedN1(RATED_CORRECTED_N1, 0.0));
}

static double climbReduction(DeratedClimb_A32NX& climb, double takeoffDerate, bool onGround, bool atClimbDetent, double altitude) {
#ifdef WITHOUT_THE_FIX
  (void)climb;
  (void)takeoffDerate;
  (void)onGround;
  (void)atClimbDetent;
  (void)altitude;
  return 0.0;
#else
  return DeratedClimb_A32NX::thrustReductionPercent(climb.update({takeoffDerate, onGround, atClimbDetent}), altitude);
#endif
}

static void derateClimbFollowsTheTakeoffDerateAndWashesOut() {
  DeratedClimb_A32NX climb;
  climbReduction(climb, 12.0, true, false, 0.0);
  expect("derated climb at the CL detent", climbReduction(climb, 12.0, false, true, 5000.0) == 12.0,
         climbReduction(climb, 12.0, false, true, 5000.0));
  const double mid = climbReduction(climb, 12.0, false, true, 22500.0);
  expect("washout halfway", std::abs(mid - 6.0) < 0.01, mid);
  expect("washed out at the end", climbReduction(climb, 12.0, false, true, 31000.0) == 0.0, 0.0);
  // the crew takes the levers out of the CL detent: the derate is cancelled for the flight
  climbReduction(climb, 12.0, false, false, 5000.0);
  expect("cancelled out of the detent", climbReduction(climb, 12.0, false, true, 5000.0) == 0.0,
         climbReduction(climb, 12.0, false, true, 5000.0));
  // a new takeoff derates again
  climbReduction(climb, 8.0, true, false, 0.0);
  expect("next flight derated again", climbReduction(climb, 8.0, false, true, 5000.0) == 8.0, 0.0);
}

static void noTakeoffDerateNoClimbDerate() {
  DeratedClimb_A32NX climb;
  climbReduction(climb, 0.0, true, false, 0.0);
  expect("no derated takeoff, full climb thrust", climbReduction(climb, 0.0, false, true, 5000.0) == 0.0, 0.0);
}

static GaSoft_A32NX::Inputs approach() {
  return {false, 3.0, true, GaSoft_A32NX::FLIGHT_PHASE_APPROACH, true};
}

static bool gaSoftActive(const GaSoft_A32NX::Inputs& in) {
#ifdef WITHOUT_THE_FIX
  return !in.onGround && in.flapsHandleIndex >= 0.5 && in.bothEnginesRunning;
#else
  return GaSoft_A32NX::isActive(in);
#endif
}

static void softGoAroundNeedsTheApproachConfigurationAndBothEngines() {
  expect("soft go-around in the approach configuration", gaSoftActive(approach()), 0.0);
  GaSoft_A32NX::Inputs in = approach();
  in.flightPhase          = GaSoft_A32NX::FLIGHT_PHASE_GO_AROUND;
  expect("soft go-around in the go-around phase", gaSoftActive(in), 0.0);
  in          = approach();
  in.onGround = true;
  expect("not on the ground", !gaSoftActive(in), 0.0);
  in                  = approach();
  in.flapsHandleIndex = 0.0;
  expect("not with the flaps up", !gaSoftActive(in), 0.0);
  in                    = approach();
  in.bothEnginesRunning = false;
  expect("not with one engine inoperative", !gaSoftActive(in), 0.0);
  const double soft = deratedN1(RATED_CORRECTED_N1, ThrustDerate_A32NX::GA_SOFT_THRUST_REDUCTION_PERCENT);
  expect("GA SOFT is below the go-around N1", soft < RATED_CORRECTED_N1, soft);
}

/// The sim recording of the first test: the flag was set at idle with the flaps out and during the takeoff climb at the FLX/MCT
/// detent (limit type FLX, flight phase takeoff/climb); neither is the soft go-around.
static void softGoAroundOnlyWithTheMctLimitInApproach() {
  GaSoft_A32NX::Inputs in = approach();
  in.mctLimitActive       = false;
  expect("not at idle / CL (limit type CLB)", !gaSoftActive(in), 0.0);
  in                = approach();
  in.mctLimitActive = false;
  in.flightPhase    = 2;
  expect("not in the takeoff climb with the FLX limit", !gaSoftActive(in), 0.0);
  in             = approach();
  in.flightPhase = 2;
  expect("not in the climb with the MCT limit", !gaSoftActive(in), 0.0);
}

int main() {
  eachLevelReducesTheThrustByItsPercentage();
  noReductionKeepsTheRating();
  derateClimbFollowsTheTakeoffDerateAndWashesOut();
  noTakeoffDerateNoClimbDerate();
  softGoAroundNeedsTheApproachConfigurationAndBothEngines();
  softGoAroundOnlyWithTheMctLimitInApproach();
  if (failures > 0) {
    std::printf("thrust_derate_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("thrust_derate_test: all checks passed\n");
  return 0;
}
