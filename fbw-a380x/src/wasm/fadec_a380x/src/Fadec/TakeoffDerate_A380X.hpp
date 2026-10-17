// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_TAKEOFFDERATE_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_TAKEOFFDERATE_A380X_HPP

#include <algorithm>
#include <cstddef>

/**
 * @class TakeoffDerate_A380X
 * @brief The derated takeoff thrust rating of the FADEC (DOx), as a corrected N1 limit. No MSFS SDK dependency: tested
 * natively (test/run_tests.sh).
 *
 * DOx derated takeoff: six levels, D04, D08, D12, D16, D20 and D24, reduce the maximum takeoff thrust by 4 % up to 24 %. The
 * flight crew selects the level on the T.O panel of the MFD PERF page (L:A32NX_AIRLINER_TO_DERATE, the thrust reduction in
 * percent, 0 for no derate).
 *
 * The reduction is a thrust, the FADEC limits are N1. The thrust of a corrected N1 is the one MSFS applies: the Mach 0 column
 * of n1_and_mach_on_thrust_table of the A380X engines.cfg (common/config/engines.cfg), the static thrust the takeoff rating is
 * defined at. The derated N1 is the corrected N1 at which that table gives the rated thrust reduced by the derate. Keep
 * THRUST_TABLE in step with engines.cfg.
 */
class TakeoffDerate_A380X {
 public:
  /// The six derate levels: the thrust reduction of D04 to D24, in percent
  static constexpr double MAX_THRUST_REDUCTION_PERCENT = 24.0;

  /**
   * @brief The corrected N1 of the derated rating.
   * @param ratedCorrectedN1 the corrected N1 of the takeoff (or go-around) rating, without derate
   * @param thrustReductionPercent the derate, 0 to 24 % of the rated thrust (0: no derate)
   * @return the corrected N1 that gives the rated thrust reduced by the derate
   */
  static double deratedCorrectedN1(double ratedCorrectedN1, double thrustReductionPercent) {
    const double reduction = std::clamp(thrustReductionPercent, 0.0, MAX_THRUST_REDUCTION_PERCENT);
    if (reduction <= 0.0) {
      return ratedCorrectedN1;
    }
    const double ratedThrust = thrustOfCorrectedN1(ratedCorrectedN1);
    return correctedN1OfThrust(ratedThrust * (1.0 - reduction / 100.0));
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
      {0.0, 0.015},  {20.0, 0.1286}, {25.0, 0.155}, {30.0, 0.16},   {35.0, 0.315},  {40.0, 0.396},  {45.0, 0.472},
      {50.0, 0.543}, {55.0, 0.611},  {60.0, 0.714}, {65.0, 0.792},  {70.0, 0.880},  {75.0, 0.982},  {80.0, 1.092},
      {85.0, 1.230}, {90.0, 1.388},  {95.0, 1.538}, {100.0, 1.603}, {105.0, 1.655}, {110.0, 1.671},
  };

  static double interpolate(double x, double x0, double x1, double y0, double y1) {
    return x1 == x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_TAKEOFFDERATE_A380X_HPP
