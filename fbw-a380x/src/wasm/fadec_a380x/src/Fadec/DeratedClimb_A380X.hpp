// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_DERATEDCLIMB_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_DERATEDCLIMB_A380X_HPP

#include <algorithm>
#include <cmath>

/**
 * @class DeratedClimb_A380X
 * @brief The derated climb thrust rating of the FADEC (DCLB1 to DCLB3). No MSFS SDK dependency: tested natively
 * (test/run_tests.sh).
 *
 * The engine has three derated climb levels: DCL1, DCL2 and DCL3 reduce the maximum climb thrust by 8, 16 and 24 %. The
 * flight crew selects the level on the CLB panel of the MFD PERF page (L:A32NX_AIRLINER_CLIMB_DERATE, 0 for NONE). The
 * FADEC applies it at the CL detent. The derated thrust washes out progressively to the maximum climb thrust, from
 * 29 000 ft (DCL1), 25 000 ft (DCL2) or 21 000 ft (DCL3) in ISA conditions, so that the climb ceiling and the climb rate
 * at the end of the climb do not change.
 *
 * The crew clears the derated climb with NONE on the MFD, or by setting the thrust levers out of the CL detent and back:
 * once the derate has been applied in flight at the CL detent, leaving the detent cancels it for the rest of the flight,
 * until the crew selects a derated level again on the MFD.
 */
class DeratedClimb_A380X {
 public:
  static constexpr int    MAX_LEVEL                    = 3;
  static constexpr double THRUST_REDUCTION_PER_LEVEL   = 8.0;  // percent of the maximum climb thrust
  static constexpr double CLIMB_DETENT_TLA             = 25.0;
  static constexpr double DETENT_TOLERANCE_DEGREES     = 0.5;
  // Design choice: the derated climb power management tables reach the maximum climb thrust at 35 000 ft, so the washout
  // ends there for every level. The washout is linear in altitude and does not follow the temperature (the ISA altitudes).
  static constexpr double WASHOUT_END_ALTITUDE = 35000.0;  // feet

  /**
   * @param level the derated climb level, 1 to 3 (anything else: no derate)
   * @param pressureAltitude feet
   * @return the thrust reduction of the level at this altitude, in percent of the maximum climb thrust
   */
  static double thrustReductionPercent(int level, double pressureAltitude) {
    if (level < 1 || level > MAX_LEVEL) {
      return 0.0;
    }
    const double washoutStart = WASHOUT_START_ALTITUDE[level - 1];
    const double remaining    = std::clamp((WASHOUT_END_ALTITUDE - pressureAltitude) / (WASHOUT_END_ALTITUDE - washoutStart), 0.0, 1.0);
    return level * THRUST_REDUCTION_PER_LEVEL * remaining;
  }

  /**
   * @param highestThrustLeverAngle the highest TLA of the four thrust levers, degrees
   * @return whether at least one thrust lever is on the CL detent and the others on or below it
   */
  static bool leversInClimbDetent(double highestThrustLeverAngle) {
    return std::abs(highestThrustLeverAngle - CLIMB_DETENT_TLA) <= DETENT_TOLERANCE_DEGREES;
  }

  struct Inputs {
    int  selectedLevel;  // the MFD selection, 0 for NONE
    bool onGround;
    bool leversInClimbDetent;
  };

  /**
   * @return the derated climb level the FADEC applies (0: none, the maximum climb thrust)
   */
  int update(const Inputs& in) {
    const int selectedLevel = (in.selectedLevel >= 1 && in.selectedLevel <= MAX_LEVEL) ? in.selectedLevel : 0;
    if (in.onGround || selectedLevel != previousSelectedLevel) {
      engagedInFlight = false;
      cancelled       = false;
    }
    previousSelectedLevel = selectedLevel;

    if (selectedLevel == 0 || cancelled) {
      return 0;
    }
    if (!in.onGround && in.leversInClimbDetent) {
      engagedInFlight = true;
    } else if (engagedInFlight && !in.leversInClimbDetent) {
      cancelled = true;
      return 0;
    }
    return selectedLevel;
  }

 private:
  static constexpr double WASHOUT_START_ALTITUDE[MAX_LEVEL] = {29000.0, 25000.0, 21000.0};  // feet, DCL1 to DCL3

  int  previousSelectedLevel = 0;
  bool engagedInFlight       = false;
  bool cancelled             = false;
};

#endif  // FLYBYWIRE_AIRCRAFT_DERATEDCLIMB_A380X_HPP
