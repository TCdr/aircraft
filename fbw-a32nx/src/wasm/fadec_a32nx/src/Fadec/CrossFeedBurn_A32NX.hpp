// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_CROSSFEEDBURN_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_CROSSFEEDBURN_A32NX_HPP

/**
 * @brief Which wing tank each engine (and the APU) burns from, with the fuel X FEED valve and the wing tank pumps.
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 *
 * The FADEC (EngineControlA32NX.cpp) computes the fuel each engine burns in a frame and takes it out of the inner wing tanks
 * itself. With the X FEED valve closed each engine burns its own side. With the X FEED valve open, the pumps of one side
 * push the fuel of both engines when the pumps of the other side are off.
 *
 * Gravity feeding: with the X FEED valve open and all four wing pumps off (or failed), no pump pushes the fuel, and each
 * engine is fed by gravity from its wing tank; with one engine running, the fuel of the wing tank on the running engine
 * side is used. Design choice: in gravity feeding each engine burns its own wing tank whatever the X FEED valve; the use
 * of the opposite wing tank by a larger bank angle is not modelled. The APU burns from both sides, as with the X FEED
 * valve open and pumps on both sides.
 */
namespace CrossFeedBurn_A32NX {

enum class WingSupply {
  OWN_SIDE,          // X FEED closed: each engine burns its own wing tank, the APU the left one
  RIGHT_FEEDS_BOTH,  // X FEED open, left pumps off: the right tank feeds both engines and the APU
  LEFT_FEEDS_BOTH,   // X FEED open, right pumps off: the left tank feeds both engines, the APU burns from the left
  GRAVITY_FEED,      // X FEED open, all four wing pumps off: gravity feeding, each engine burns its own wing tank
  BOTH_FEED_BOTH,    // X FEED open, pumps on both sides: each engine its own side, the APU from both sides
};

/// The fuel taken out of the left and right inner wing tanks in a frame for the engine and APU burns.
struct Burns {
  double engine1;  // kg, out of the left tank
  double engine2;  // kg, out of the right tank
  double apuLeft;  // lb, out of the left tank
  double apuRight; // lb, out of the right tank
};

/**
 * @param xFeedOpen     the fuel X FEED valve is open (not fully closed)
 * @param leftPumpsOff  both left wing tank pumps are off
 * @param rightPumpsOff both right wing tank pumps are off
 */
inline WingSupply wingSupply(bool xFeedOpen, bool leftPumpsOff, bool rightPumpsOff) {
  if (!xFeedOpen) {
    return WingSupply::OWN_SIDE;
  }
  if (leftPumpsOff && rightPumpsOff) {
    return WingSupply::GRAVITY_FEED;
  }
  if (leftPumpsOff) {
    return WingSupply::RIGHT_FEEDS_BOTH;
  }
  if (rightPumpsOff) {
    return WingSupply::LEFT_FEEDS_BOTH;
  }
  return WingSupply::BOTH_FEED_BOTH;
}

/**
 * @param supply      the wing supply of this frame
 * @param engine1Burn the fuel engine 1 burns in this frame, kg
 * @param engine2Burn the fuel engine 2 burns in this frame, kg
 * @param apuBurn     the fuel the APU burns in this frame, lb
 * @return which tank the burns are taken out of
 */
inline Burns routeBurns(WingSupply supply, double engine1Burn, double engine2Burn, double apuBurn) {
  switch (supply) {
    case WingSupply::RIGHT_FEEDS_BOTH:
      return {0.0, engine1Burn + engine2Burn, 0.0, apuBurn};
    case WingSupply::LEFT_FEEDS_BOTH:
      return {engine1Burn + engine2Burn, 0.0, apuBurn, 0.0};
    case WingSupply::GRAVITY_FEED:
    case WingSupply::BOTH_FEED_BOTH:
      return {engine1Burn, engine2Burn, apuBurn * 0.5, apuBurn * 0.5};
    case WingSupply::OWN_SIDE:
    default:
      return {engine1Burn, engine2Burn, apuBurn, 0.0};
  }
}

}  // namespace CrossFeedBurn_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_CROSSFEEDBURN_A32NX_HPP
