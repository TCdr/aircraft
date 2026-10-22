// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_IDLESETTING_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_IDLESETTING_A380X_HPP

#include <algorithm>

/**
 * @class IdleSetting_A380X
 * @brief The forward idle setting of the FADEC, as a corrected N3 increase over the basic idle schedule of
 * Table1502_A380X (which already follows the altitude, the Mach number and the SAT). No MSFS SDK dependency: tested
 * natively (test/run_tests.sh).
 *
 * - Approach idle, for a rapid acceleration from idle to go-around thrust: in flight, with the FLAPS lever at 2, 3 or
 *   FULL, or with the landing gear extended.
 * - Normal idle in the other cases (in flight with FLAPS 0 or 1 and the gear retracted, or on the ground): it is raised
 *   for the bleed demand and a high oil temperature. With both pack controllers failed the FADEC no longer knows the
 *   bleed demand and takes the highest one (ENG IDLE HI), on the ground and in flight.
 * Reverse idle is the reverser's own (thrust lever in the reverse range).
 *
 * Design choice: the FADEC data gives no values, so the increases are chosen to be small and visible on the N1: approach
 * idle +4 % CN3 (about +3 % N1 at low altitude); packs +0.5 %, nacelle anti-ice +1 % and wing anti-ice +1.5 % CN3 for
 * the bleed pressure; up to +3 % CN3 for the oil temperature between the high advisory (163 C) and the amber limit
 * (177 C), as more fuel flows through the fuel-cooled oil cooler. Approach idle covers the normal idle increases up
 * to its own: the highest of the two applies. The four engines share one idle (one idle thrust limit feeds the four
 * FADEC thrust loops), set by the highest demand.
 */
class IdleSetting_A380X {
 public:
  struct Inputs {
    bool   onGround;
    int    flapsLeverPosition;  // L:A32NX_FLAPS_HANDLE_INDEX: 0, 1, 2, 3, 4 (FULL)
    bool   landingGearDown;     // a main landing gear downlocked
    bool   packs;               // a pack operating
    bool   nacelleAntiIce;      // an engine anti-ice valve open
    bool   wingAntiIce;         // the wing anti-ice valves open
    bool   packControllersLost;  // both channels of both pack controllers (FDAC 1 and 2) failed
    double highestOilTemperature;  // Celsius, the hottest oil of the four engines
  };

  static constexpr int    FLAPS_LEVER_2                 = 2;
  static constexpr double APPROACH_IDLE_CN3_INCREASE    = 4.0;
  static constexpr double PACKS_CN3_INCREASE            = 0.5;
  static constexpr double NACELLE_ANTI_ICE_CN3_INCREASE = 1.0;
  static constexpr double WING_ANTI_ICE_CN3_INCREASE    = 1.5;
  static constexpr double OIL_TEMPERATURE_RAISE_START   = 163.0;  // Celsius
  static constexpr double OIL_TEMPERATURE_RAISE_FULL    = 177.0;  // Celsius
  static constexpr double OIL_TEMPERATURE_CN3_INCREASE  = 3.0;

  static bool isApproachIdle(const Inputs& in) {
    return !in.onGround && (in.flapsLeverPosition >= FLAPS_LEVER_2 || in.landingGearDown);
  }

  /// The increase of the normal idle, in percent of corrected N3
  static double normalIdleCN3Increase(const Inputs& in) {
    const double bleedDemand = (in.packs || in.packControllersLost ? PACKS_CN3_INCREASE : 0.0) +
                               (in.nacelleAntiIce || in.packControllersLost ? NACELLE_ANTI_ICE_CN3_INCREASE : 0.0) +
                               (in.wingAntiIce || in.packControllersLost ? WING_ANTI_ICE_CN3_INCREASE : 0.0);
    const double oilFraction = std::clamp((in.highestOilTemperature - OIL_TEMPERATURE_RAISE_START) /
                                              (OIL_TEMPERATURE_RAISE_FULL - OIL_TEMPERATURE_RAISE_START),
                                          0.0, 1.0);
    return bleedDemand + oilFraction * OIL_TEMPERATURE_CN3_INCREASE;
  }

  /// The increase of the selected idle over the basic idle schedule, in percent of corrected N3
  static double correctedN3Increase(const Inputs& in) {
    const double normalIncrease = normalIdleCN3Increase(in);
    return isApproachIdle(in) ? std::max(APPROACH_IDLE_CN3_INCREASE, normalIncrease) : normalIncrease;
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_IDLESETTING_A380X_HPP
