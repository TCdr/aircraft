// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the FAC alpha floor signal (src/fac/AlphaFloorConditions.h): run test/run_tests.sh.
//
// A320 FCOM DSC-22_40-30 ALPHA-FLOOR (a320_fcom.txt l.34135-34141): the floor is also activated when the "Sidestick
// deflection is greater than 14 deg nose up, with either the pitch attitude or the angle-of-attack protection active",
// "available from lift-off to 100 ft RA before landing", "inhibited above M 0.6"; l.34163-34164: "Alpha-floor is lost
// in engine-out, when slats/flaps are extended".
// Built with -DWITHOUT_THE_FIX, the FAC sends the FacComputer signal unchanged (as before the fix): the sidestick and
// engine-out checks then fail.

#include <cstdio>

#include "../src/fac/AlphaFloorConditions.h"

class Signal {
 public:
  bool update(const AlphaFloorConditions::Inputs& in) {
#ifdef WITHOUT_THE_FIX
    return in.facAlphaFloor;
#else
    return conditions.update(in);
#endif
  }

#ifndef WITHOUT_THE_FIX
 private:
  AlphaFloorConditions conditions;
#endif
};

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

/// A FAC that has seen the takeoff (lift-off, then above 100 ft RA): in flight, clean, both engines running, M 0.3
struct InFlight {
  Signal signal;
  AlphaFloorConditions::Inputs in;

  InFlight() {
    in.onGround = true;
    in.radioHeightValid = true;
    in.radioHeightFt = 0;
    signal.update(in);
    in.onGround = false;
    in.radioHeightFt = 50;
    signal.update(in);
    in.radioHeightFt = 1500;
    in.mach = 0.3;
    signal.update(in);
  }

  bool update() { return signal.update(in); }

  void fullBackStickWithProtection() {
    in.sidestickNoseUpDeg = 16;
    in.angleOfAttackProtectionActive = true;
  }
};

static void facAlphaFloorPassesThrough() {
  InFlight fac;
  fac.in.facAlphaFloor = true;
  expect(fac.update(), "the FacComputer alpha floor is sent");
  fac.in.facAlphaFloor = false;
  expect(!fac.update(), "no FacComputer alpha floor, no stick: no alpha floor");
}

static void sidestickNoseUpWithProtectionGivesAlphaFloor() {
  InFlight fac;
  fac.in.sidestickNoseUpDeg = 15;
  fac.in.angleOfAttackProtectionActive = true;
  expect(fac.update(), "15 deg nose up with the AoA protection active: alpha floor (l.34137)");
}

static void sidestickAt13DegHasNoAlphaFloor() {
  InFlight fac;
  fac.in.sidestickNoseUpDeg = 13;
  fac.in.angleOfAttackProtectionActive = true;
  expect(!fac.update(), "13 deg nose up: no alpha floor");
}

static void sidestickWithoutProtectionHasNoAlphaFloor() {
  InFlight fac;
  fac.in.sidestickNoseUpDeg = 16;
  expect(!fac.update(), "full back stick without protection: no alpha floor");
}

static void sidestickCaseInhibitedAboveMach06() {
  InFlight fac;
  fac.fullBackStickWithProtection();
  fac.in.mach = 0.65;
  expect(!fac.update(), "full back stick with protection at M 0.65: no alpha floor (l.34141)");
}

static void sidestickCaseInhibitedBelow100FtInApproach() {
  InFlight fac;
  fac.in.radioHeightFt = 90;
  fac.update();
  fac.fullBackStickWithProtection();
  expect(!fac.update(), "full back stick with protection at 90 ft in approach: no alpha floor (l.34139)");
}

static void sidestickCaseAvailableAfterLiftOff() {
  Signal signal;
  AlphaFloorConditions::Inputs in;
  in.radioHeightValid = true;
  in.onGround = true;
  in.sidestickNoseUpDeg = 16;
  in.angleOfAttackProtectionActive = true;
  in.mach = 0.2;
  expect(!signal.update(in), "on the ground: no alpha floor");
  in.onGround = false;
  in.radioHeightFt = 40;
  expect(signal.update(in), "after lift-off, below 100 ft: alpha floor available (l.34139)");
}

static void sidestickCaseStaysAvailableWithoutRadioHeightInCruise() {
  InFlight fac;
  fac.in.radioHeightValid = false;
  fac.in.radioHeightFt = 0;
  fac.update();
  fac.fullBackStickWithProtection();
  expect(fac.update(), "no radio height above 2500 ft: alpha floor still available");
}

static void alphaFloorLostInEngineOutWithSlatsOrFlapsExtended() {
  InFlight fac;
  fac.in.facAlphaFloor = true;
  fac.in.engineOut = true;
  fac.in.slatsOrFlapsExtended = true;
  expect(!fac.update(), "engine out with slats/flaps extended: alpha floor lost (l.34164)");
}

static void alphaFloorKeptInEngineOutClean() {
  InFlight fac;
  fac.in.facAlphaFloor = true;
  fac.in.engineOut = true;
  expect(fac.update(), "engine out, clean: alpha floor kept");
}

int main() {
  facAlphaFloorPassesThrough();
  sidestickNoseUpWithProtectionGivesAlphaFloor();
  sidestickAt13DegHasNoAlphaFloor();
  sidestickWithoutProtectionHasNoAlphaFloor();
  sidestickCaseInhibitedAboveMach06();
  sidestickCaseInhibitedBelow100FtInApproach();
  sidestickCaseAvailableAfterLiftOff();
  sidestickCaseStaysAvailableWithoutRadioHeightInCruise();
  alphaFloorLostInEngineOutWithSlatsOrFlapsExtended();
  alphaFloorKeptInEngineOutClean();

  if (failures > 0) {
    std::printf("alpha_floor_conditions_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("alpha_floor_conditions_test: all checks passed\n");
  return 0;
}
