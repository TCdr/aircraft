// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_FUELRECIRCULATION_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_FUELRECIRCULATION_A32NX_HPP

#include <algorithm>

/**
 * @brief The IDG cooling fuel that the fuel return valve sends back to the outer cell of the wing tank. The flow is commanded by
 * the systems WASM (fuel/fuel_recirculation.rs, L:A32NX_FUEL_ENG_n_RECIRCULATION_FLOW, in kg/h). No MSFS SDK dependency: tested
 * natively (test/run_tests.sh).
 *
 * The FADEC (EngineControlA32NX.cpp) computes the inner wing tank quantity itself, so it takes the returned fuel out of the inner
 * tank and puts it into the outer tank, which MSFS holds. A full outer tank overflows into the inner tank through a spill pipe,
 * so no fuel moves then.
 */
namespace FuelRecirculation_A32NX {

constexpr double POUNDS_PER_KG = 2.2046226218;

/// The capacity of an outer wing tank (the A320 fuel system of the systems WASM, fuel/mod.rs A320_FUEL)
constexpr double OUTER_TANK_CAPACITY_GALLONS = 228.0;

/**
 * @param flowKgPerHour       the commanded flow of the fuel return valve, kg/h
 * @param deltaTimeHours      the time of the frame, hours
 * @param innerPounds         the fuel in the inner tank, lb
 * @param outerPounds         the fuel in the outer tank, lb
 * @param outerCapacityPounds the capacity of the outer tank, lb
 * @return the fuel that moves from the inner to the outer tank in this frame, lb
 */
inline double returnedPounds(double flowKgPerHour, double deltaTimeHours, double innerPounds, double outerPounds,
                             double outerCapacityPounds) {
  if (flowKgPerHour <= 0.0 || deltaTimeHours <= 0.0) {
    return 0.0;
  }
  const double room = std::max(outerCapacityPounds - outerPounds, 0.0);
  return std::min({flowKgPerHour * POUNDS_PER_KG * deltaTimeHours, room, std::max(innerPounds, 0.0)});
}

}  // namespace FuelRecirculation_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_FUELRECIRCULATION_A32NX_HPP
