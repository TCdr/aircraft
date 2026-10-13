// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_WINGTANKLEAK_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_WINGTANKLEAK_A32NX_HPP

#include <algorithm>

/**
 * @brief The wing tank leak failures (flyPad failures 28016/28017 "L (R) wing tank leak", L:A32NX_FUEL_L(R)_WING_TK_LEAK
 * from the systems host Fuel/FuelLevelSensing). No MSFS SDK dependency: tested natively (test/run_tests.sh).
 *
 * The FADEC (EngineControlA32NX.cpp) computes the inner wing tank quantities itself, so it takes the leaked fuel out of
 * the inner tank of the leaking wing. The leaked fuel is not counted in the fuel used: FOB + fuel used drops below the
 * initial FOB, which gives FUEL F. USED/FOB DISAGREE (A320 FCOM PRO-ABN-FUEL, a320_fcom.txt l.85866-85874: "This alert
 * triggers when the difference between the initial FOB and the actual FOB + fuel used is significant", "FUEL LEAK PROC
 * ... APPLY"), and a fuel imbalance develops ([QRH] FUEL LEAK, l.84858-84866).
 */
namespace WingTankLeak_A32NX {

/// Design choice (the FCOM gives no leak rate): a leaking wing tank loses 3 000 kg/h, so that the 1 500 kg of
/// F. USED/FOB DISAGREE (systems-host FWC/Logic/FuelSystemFaultAlerts) are reached after 30 min.
constexpr double LEAK_RATE_KG_PER_HOUR = 3000.0;

constexpr double POUNDS_PER_KG = 2.2046226218;

/**
 * @param leaking        the wing tank leaks
 * @param deltaTimeHours the time of the frame, hours
 * @param tankPounds     the fuel in the inner tank, lb
 * @return the fuel the leak takes out of the inner tank in this frame, lb, never more than the tank holds
 */
inline double leakedPounds(bool leaking, double deltaTimeHours, double tankPounds) {
  if (!leaking || deltaTimeHours <= 0.0) {
    return 0.0;
  }
  return std::clamp(LEAK_RATE_KG_PER_HOUR * POUNDS_PER_KG * deltaTimeHours, 0.0, std::max(tankPounds, 0.0));
}

}  // namespace WingTankLeak_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_WINGTANKLEAK_A32NX_HPP
