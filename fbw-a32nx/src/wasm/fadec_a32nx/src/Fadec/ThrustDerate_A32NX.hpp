// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_THRUSTDERATE_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_THRUSTDERATE_A32NX_HPP

#include <algorithm>
#include <cmath>
#include <cstddef>

/**
 * @class ThrustDerate_A32NX
 * @brief The derated thrust ratings of the FADEC: the derated takeoff (D04 to D32), the derated climb (DCLB) and the soft
 * go-around (GA SOFT). Each is a reduction of a rated thrust, converted into the corrected N1 limit the FADEC writes. No MSFS
 * SDK dependency: tested natively (test/run_tests.sh).
 *
 * The reduction is a thrust, the FADEC limits are N1. The thrust of a corrected N1 is the one MSFS applies: the Mach 0 column
 * of n1_and_mach_on_thrust_table of the engines.cfg, the static thrust the ratings are defined at. The derated N1 is the
 * corrected N1 at which that table gives the rated thrust reduced by the reduction. Keep THRUST_TABLE in step with engines.cfg.
 */
class ThrustDerate_A32NX {
 public:
  /// Derated takeoff: eight levels, D04, D08 ... D32, each reducing the maximum takeoff thrust by 4 % more
  static constexpr double TAKEOFF_THRUST_REDUCTION_PER_LEVEL = 4.0;
  static constexpr int    TAKEOFF_LEVELS                     = 8;
  static constexpr double MAX_THRUST_REDUCTION_PERCENT       = TAKEOFF_THRUST_REDUCTION_PER_LEVEL * TAKEOFF_LEVELS;

  /// Design choice: the reduction of GA SOFT, the go-around thrust is not given in the FCOM
  static constexpr double GA_SOFT_THRUST_REDUCTION_PERCENT = 10.0;

  /**
   * @brief The corrected N1 of the derated rating.
   * @param ratedCorrectedN1 the corrected N1 of the rating without reduction
   * @param thrustReductionPercent the reduction, 0 to MAX_THRUST_REDUCTION_PERCENT of the rated thrust (0: none)
   * @return the corrected N1 that gives the rated thrust reduced by the reduction
   */
  static double deratedCorrectedN1(double ratedCorrectedN1, double thrustReductionPercent) {
    const double reduction = std::clamp(thrustReductionPercent, 0.0, MAX_THRUST_REDUCTION_PERCENT);
    if (reduction <= 0.0) {
      return ratedCorrectedN1;
    }
    return correctedN1OfThrust(thrustOfCorrectedN1(ratedCorrectedN1) * (1.0 - reduction / 100.0));
  }

  /// The static thrust (fraction of the engines.cfg static_thrust) MSFS gives at this corrected N1.
  static double thrustOfCorrectedN1(double correctedN1) {
    if (correctedN1 <= THRUST_TABLE[0][0]) {
      return THRUST_TABLE[0][1];
    }
    for (std::size_t i = 1; i < ROWS; ++i) {
      if (correctedN1 <= THRUST_TABLE[i][0]) {
        return interpolate(correctedN1, THRUST_TABLE[i - 1][0], THRUST_TABLE[i][0], THRUST_TABLE[i - 1][1], THRUST_TABLE[i][1]);
      }
    }
    return THRUST_TABLE[ROWS - 1][1];
  }

  /// The corrected N1 at which MSFS gives this static thrust (the table rises with the N1).
  static double correctedN1OfThrust(double thrust) {
    if (thrust <= THRUST_TABLE[0][1]) {
      return THRUST_TABLE[0][0];
    }
    for (std::size_t i = 1; i < ROWS; ++i) {
      if (thrust <= THRUST_TABLE[i][1]) {
        return interpolate(thrust, THRUST_TABLE[i - 1][1], THRUST_TABLE[i][1], THRUST_TABLE[i - 1][0], THRUST_TABLE[i][0]);
      }
    }
    return THRUST_TABLE[ROWS - 1][0];
  }

 private:
  static constexpr std::size_t ROWS = 20;
  /// engines.cfg n1_and_mach_on_thrust_table, corrected N1 (%) and its Mach 0 thrust
  static constexpr double THRUST_TABLE[ROWS][2] = {
      {0.0, 0.000000},
      {20.0, 0.091741},
      {25.0, 0.142810},
      {30.0, 0.189837},
      {35.0, 0.262207},
      {40.0, 0.330230},
      {45.0, 0.393293},
      {50.0, 0.452337},
      {55.0, 0.509468},
      {60.0, 0.594614},
      {65.0, 0.660035},
      {70.0, 0.733601},
      {75.0, 0.818693},
      {80.0, 0.910344},
      {85.0, 1.025165},
      {90.0, 1.157049},
      {95.0, 1.281333},
      {100.0, 1.357935},
      {105.0, 1.378826},
      {110.0, 1.392754},
  };

  static double interpolate(double x, double x0, double x1, double y0, double y1) {
    return x1 == x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
};

/**
 * @class DeratedClimb_A32NX
 * @brief The derated climb thrust rating (DCLB) of the FADEC.
 *
 * Design choices (the FCOM describes the DCLB rating mode, not its level or its washout): the climb is derated by the level of
 * the derated takeoff of the flight, the reduction stays until FULL_REDUCTION_END_ALTITUDE and washes out linearly to the
 * maximum climb thrust at WASHOUT_END_ALTITUDE, so that the climb ceiling and the climb rate at the end of the climb do not
 * change. The derated climb applies at the CL detent; once it has been applied in flight, leaving the detent cancels it for
 * the rest of the flight (the crew has taken the thrust back).
 */
class DeratedClimb_A32NX {
 public:
  static constexpr double CLIMB_DETENT_TLA                = 25.0;
  static constexpr double DETENT_TOLERANCE_DEGREES        = 0.5;
  static constexpr double FULL_REDUCTION_END_ALTITUDE     = 15000.0;  // feet
  static constexpr double WASHOUT_END_ALTITUDE            = 30000.0;  // feet

  /**
   * @param reductionPercent the derated takeoff level of the flight, in percent
   * @param pressureAltitude feet
   * @return the thrust reduction of the CLB rating at this altitude, in percent of the maximum climb thrust
   */
  static double thrustReductionPercent(double reductionPercent, double pressureAltitude) {
    if (reductionPercent <= 0.0) {
      return 0.0;
    }
    const double remaining =
        std::clamp((WASHOUT_END_ALTITUDE - pressureAltitude) / (WASHOUT_END_ALTITUDE - FULL_REDUCTION_END_ALTITUDE), 0.0, 1.0);
    return reductionPercent * remaining;
  }

  static bool leversInClimbDetent(double highestThrustLeverAngle) {
    return std::abs(highestThrustLeverAngle - CLIMB_DETENT_TLA) <= DETENT_TOLERANCE_DEGREES;
  }

  struct Inputs {
    double takeoffReductionPercent;  // the derated takeoff of the flight plan, 0 for none
    bool   onGround;
    bool   leversInClimbDetent;
  };

  /**
   * @return the derated takeoff level in percent the climb rating is derated by (0: the maximum climb thrust)
   */
  double update(const Inputs& in) {
    if (in.onGround) {
      derateOfFlight  = std::max(in.takeoffReductionPercent, 0.0);
      engagedInFlight = false;
      cancelled       = false;
      return 0.0;
    }
    if (cancelled || derateOfFlight <= 0.0) {
      return 0.0;
    }
    if (in.leversInClimbDetent) {
      engagedInFlight = true;
    } else if (engagedInFlight) {
      cancelled = true;
      return 0.0;
    }
    return derateOfFlight;
  }

 private:
  double derateOfFlight  = 0.0;
  bool   engagedInFlight = false;
  bool   cancelled       = false;
};

/**
 * @brief The soft go-around (GA SOFT): at the FLX/MCT detent in the approach or go-around with both engines running, the FADEC
 * gives the go-around thrust reduced by GA_SOFT_THRUST_REDUCTION_PERCENT in place of the MCT. The FCOM prohibits it with one
 * engine inoperative.
 *
 * Design choices: the approach configuration is the FLAPS lever out of 0 in flight; it applies only while the active thrust
 * limit is the MCT one (a takeoff limit, FLX or TOGA, or the CLB limit is never replaced) and the FMGC flight phase is
 * approach or go-around, so the takeoff climb with the levers at the detent keeps its rating.
 */
namespace GaSoft_A32NX {
constexpr int FLIGHT_PHASE_APPROACH   = 5;
constexpr int FLIGHT_PHASE_GO_AROUND  = 6;

struct Inputs {
  bool   onGround;
  double flapsHandleIndex;
  bool   bothEnginesRunning;
  int    flightPhase;
  bool   mctLimitActive;
};

inline bool isActive(const Inputs& in) {
  const bool approachOrGoAround = in.flightPhase == FLIGHT_PHASE_APPROACH || in.flightPhase == FLIGHT_PHASE_GO_AROUND;
  return !in.onGround && in.flapsHandleIndex >= 0.5 && in.bothEnginesRunning && approachOrGoAround && in.mctLimitActive;
}
}  // namespace GaSoft_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_THRUSTDERATE_A32NX_HPP
