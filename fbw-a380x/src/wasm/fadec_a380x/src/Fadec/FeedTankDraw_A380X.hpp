// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_FEEDTANKDRAW_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_FEEDTANKDRAW_A380X_HPP

#include <algorithm>
#include <cmath>

/**
 * @class FeedTankDraw_A380X
 *
 * How much fuel the FADEC takes from the Extra tank of an engine in one update. No MSFS SDK dependency: tested natively
 * (test/run_tests.sh).
 *
 * Each engine is fed by MSFS through a 1 gallon "Extra" tank (flight_model.cfg Tank.12-15, between the engine LP valve and the
 * engine). MSFS burns no fuel itself (engines.cfg fuel_flow_scalar = 0): the FADEC takes the burned fuel out of the Extra tank and
 * the MSFS fuel system refills it from the feed tanks (crossfeed and gravity feed included). The Extra tank is also the only
 * fuel MSFS sees at the engine, and it gives the engine line its pressure through Curve.1 (0 psi empty, 30 psi from 2 % full).
 *
 * The FADEC took the whole burn of an update at once, down to an empty tank: one long frame (the burn grows with the frame time,
 * about 2.1 kg/s per engine in a climb) emptied the four Extra tanks in the same update, identical engines burning the same.
 * Design choice: while MSFS can refill the Extra tank (its feed tank holds fuel), the FADEC leaves at least
 * MIN_EXTRA_TANK_GALLONS in it and carries the burn it could not take over to the next updates, so that the fuel burned is still
 * taken in full once MSFS has refilled the tank. A feed tank that runs dry stops the floor: the engine then empties its Extra
 * tank as before and flames out (fuel exhaustion). The starvation of an engine whose LP valve is closed does not depend on the
 * Extra tank: the systems WASM closes the MSFS feed valve 60-63 of that engine (a380_systems fuel/engine_lp_valves.rs).
 */
class FeedTankDraw_A380X {
 public:
  /// Pounds per kilogram (the same factor as Fadec::KGS_TO_LBS).
  static constexpr double LBS_PER_KG = 1 / 0.4535934;

  /// Design choice: the fuel left in an Extra tank while MSFS can refill it, in gallons. 0.2 % of the 1 gallon tank, a tenth of
  /// the 2 % knee of the tank pressure curve (flight_model.cfg Curve.1 = 0:0,0.02:30,1.0:30, so about 3 psi).
  static constexpr double MIN_EXTRA_TANK_GALLONS = 0.002;

  /// Design choice: the most burn carried over to the next updates, in gallons: one full Extra tank (Tank.12-15 Capacity:1).
  /// Beyond it the burn is dropped, as the FADEC did before for the burn it could not take.
  static constexpr double MAX_CARRIED_BURN_GALLONS = 1.0;

  struct Input {
    double extraTankGallons;    ///< the Extra tank quantity read from MSFS (FUELSYSTEM TANK QUANTITY:12-15)
    double weightLbsPerGallon;  ///< FUEL WEIGHT PER GALLON
    double burnKg;              ///< the fuel the engine burned during this update
    double carriedBurnLbs;      ///< the burn carried over from the previous updates (output of the previous update)
    bool   refillAvailable;     ///< whether MSFS can refill the Extra tank: the feed tank of the engine holds fuel
  };

  struct Output {
    double extraTankGallons;  ///< the Extra tank quantity to write to MSFS
    double drawnKg;           ///< the fuel taken out of the Extra tank during this update (the engine fuel used)
    double carriedBurnLbs;    ///< the burn still to take, carried over to the next update
  };

  static Output draw(const Input& input) {
    const double burnLbs = std::max(input.burnKg, 0.0) * LBS_PER_KG;

    // No valid fuel weight or quantity (no MSFS data yet): nothing can be converted, the tank is left as it is and the burn of this
    // update is dropped, as the FADEC did for an Extra tank it read empty. The quantity was divided by this weight before, so a 0
    // wrote NaN into the four Extra tanks.
    if (!(input.weightLbsPerGallon > 0) || !std::isfinite(input.weightLbsPerGallon) || !std::isfinite(input.extraTankGallons)) {
      return {input.extraTankGallons, 0.0, std::max(input.carriedBurnLbs, 0.0)};
    }

    const double extraLbs  = std::max(input.extraTankGallons, 0.0) * input.weightLbsPerGallon;
    const double demandLbs = std::max(input.carriedBurnLbs, 0.0) + burnLbs;
    // A tank already below the floor is not taken from while MSFS refills it.
    const double floorLbs = input.refillAvailable ? std::min(MIN_EXTRA_TANK_GALLONS * input.weightLbsPerGallon, extraLbs) : 0.0;
    const double drawnLbs = std::min(demandLbs, extraLbs - floorLbs);

    return {(extraLbs - drawnLbs) / input.weightLbsPerGallon, drawnLbs / LBS_PER_KG,
            carriedLimited(demandLbs - drawnLbs, input.weightLbsPerGallon)};
  }

 private:
  static double carriedLimited(double carriedLbs, double weightLbsPerGallon) {
    return std::clamp(carriedLbs, 0.0, MAX_CARRIED_BURN_GALLONS * weightLbsPerGallon);
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_FEEDTANKDRAW_A380X_HPP
