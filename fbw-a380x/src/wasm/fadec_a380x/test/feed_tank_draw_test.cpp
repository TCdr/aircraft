// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the fuel the FADEC takes from the Extra (engine feed) tanks (src/Fadec/FeedTankDraw_A380X.hpp):
// run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/FeedTankDraw_A380X.hpp"

static int failures = 0;

static void expectNear(const char* what, double actual, double expected, double tolerance = 1e-9) {
  if (!(std::fabs(actual - expected) <= tolerance)) {
    std::printf("FAIL %s: %.9f, expected %.9f\n", what, actual, expected);
    ++failures;
  }
}

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double WEIGHT_LBS_PER_GALLON = 6.7;
static constexpr double LBS_PER_KG            = 1 / 0.4535934;

/// The trapezoidal burn of EngineControl_A380X::updateFuel for a steady fuel flow (kg/h) during deltaTime (s).
static double burnKg(double fuelFlowKgPerHour, double deltaTimeSeconds) {
  return fuelFlowKgPerHour * deltaTimeSeconds / 3600;
}

int main() {
  // The 2026-10-06 flameout case: climb at about 7.6 t/h per engine, a 0.3 s sim stall, an Extra tank that MSFS has not refilled
  // to the top (0.15 gal = 1.0 lb, the burn of the stall is 0.63 kg = 1.4 lb). Every engine burns the same, so the four tanks
  // emptied in the same update. The tank must not be emptied while its feed tank can refill it, and no fuel is lost.
  {
    const double burn = burnKg(7600, 0.3);
    const auto   out  = FeedTankDraw_A380X::draw({0.15, WEIGHT_LBS_PER_GALLON, burn, 0.0, true});
    expectTrue("long frame: the Extra tank is not emptied", out.extraTankGallons > 0);
    expectNear("long frame: the floor is left", out.extraTankGallons, FeedTankDraw_A380X::MIN_EXTRA_TANK_GALLONS);
    expectNear("long frame: drawn + carried = burn (lb)", out.drawnKg * LBS_PER_KG + out.carriedBurnLbs, burn * LBS_PER_KG);

    // MSFS refills the tank to the top: the carried burn is taken in full at the next update.
    const double nextBurn = burnKg(7600, 1.0 / 30);
    const auto   next     = FeedTankDraw_A380X::draw({1.0, WEIGHT_LBS_PER_GALLON, nextBurn, out.carriedBurnLbs, true});
    expectNear("after refill: nothing carried any more", next.carriedBurnLbs, 0.0);
    expectNear("after refill: the tank gives the carried burn too", (1.0 - next.extraTankGallons) * WEIGHT_LBS_PER_GALLON,
               out.carriedBurnLbs + nextBurn * LBS_PER_KG, 1e-9);
    expectNear("both updates together used the whole burn (kg)", out.drawnKg + next.drawnKg, burn + nextBurn, 1e-9);
  }

  // A normal frame with fuel in the tank: unchanged, the whole burn is taken.
  {
    const double burn = burnKg(7600, 1.0 / 30);
    const auto   out  = FeedTankDraw_A380X::draw({0.8, WEIGHT_LBS_PER_GALLON, burn, 0.0, true});
    expectNear("normal frame: whole burn taken (kg)", out.drawnKg, burn);
    expectNear("normal frame: tank quantity", out.extraTankGallons, 0.8 - burn * LBS_PER_KG / WEIGHT_LBS_PER_GALLON);
    expectNear("normal frame: nothing carried", out.carriedBurnLbs, 0.0);
  }

  // Fuel exhaustion: the feed tank is dry, MSFS cannot refill: the Extra tank empties as before and the engine flames out.
  {
    const auto out = FeedTankDraw_A380X::draw({0.1, WEIGHT_LBS_PER_GALLON, burnKg(7600, 0.5), 0.0, false});
    expectNear("feed tank dry: the Extra tank empties", out.extraTankGallons, 0.0);
    // The fuel used is the fuel the tank held, in kilograms (it was capped in pounds and counted as kilograms).
    expectNear("feed tank dry: fuel used = the tank content (kg)", out.drawnKg, 0.1 * WEIGHT_LBS_PER_GALLON / LBS_PER_KG);
  }

  // A dry engine keeps no endless debt: the carried burn is limited to one Extra tank.
  {
    double carried = 0;
    for (int frame = 0; frame < 3000; ++frame) {
      carried = FeedTankDraw_A380X::draw({0.0, WEIGHT_LBS_PER_GALLON, burnKg(7600, 1.0 / 30), carried, false}).carriedBurnLbs;
    }
    expectNear("carried burn limited to one tank", carried,
               FeedTankDraw_A380X::MAX_CARRIED_BURN_GALLONS * WEIGHT_LBS_PER_GALLON);
  }

  // A tank already below the floor while MSFS refills it: not taken from, the burn waits for the refill.
  {
    const double burn = burnKg(7600, 1.0 / 30);
    const auto   out  = FeedTankDraw_A380X::draw({0.001, WEIGHT_LBS_PER_GALLON, burn, 0.0, true});
    expectNear("below the floor: quantity kept", out.extraTankGallons, 0.001);
    expectNear("below the floor: burn carried", out.carriedBurnLbs, burn * LBS_PER_KG);
  }

  // No fuel weight from MSFS yet: no division by 0 (the four Extra tanks were written NaN).
  {
    const auto out = FeedTankDraw_A380X::draw({0.0, 0.0, burnKg(7600, 1.0 / 30), 0.0, true});
    expectTrue("no fuel weight: quantity is a number", std::isfinite(out.extraTankGallons));
    expectNear("no fuel weight: quantity kept", out.extraTankGallons, 0.0);
    expectNear("no fuel weight: nothing used", out.drawnKg, 0.0);
  }

  // An engine that does not burn (shut down, FF 0) leaves its tank alone.
  {
    const auto out = FeedTankDraw_A380X::draw({1.0, WEIGHT_LBS_PER_GALLON, 0.0, 0.0, true});
    expectNear("no burn: quantity kept", out.extraTankGallons, 1.0);
    expectNear("no burn: nothing used", out.drawnKg, 0.0);
  }

  if (failures == 0) {
    std::printf("feed_tank_draw_test: all tests passed\n");
    return 0;
  }
  std::printf("feed_tank_draw_test: %d failure(s)\n", failures);
  return 1;
}
