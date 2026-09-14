// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_PUSHBACK_A380X_H
#define FLYBYWIRE_AIRCRAFT_PUSHBACK_A380X_H

#include "Pushback/Pushback.h"

/**
 * @brief Aircraft specific pushback implementation for the A380X
 */
class Pushback_A380X : public Pushback {
  static constexpr FLOAT64 PARKING_BRAKE_FACTOR = 100.0;  // slow down when parking brake is engaged by this factor
  // Scaled down from the previous 15.0 by the same factor the A32NX's cap was reduced by, to
  // preserve the A380X's deliberately slower-than-A32NX pushback (larger, heavier aircraft).
  static constexpr FLOAT64 SPEED_FACTOR      = 7.6;   // ft/sec for "VELOCITY BODY Z" (also max speed)
  static constexpr FLOAT64 TURN_SPEED_FACTOR = 0.25;  // ft/sec for "ROTATION VELOCITY BODY Y"

 public:
  /**
   * Creates a new Pushback_A32NX instance and takes a reference to the MsfsHandler instance.
   * @param msfsHandler The MsfsHandler instance that is used to communicate with the simulator.
   */
  explicit Pushback_A380X(MsfsHandler& msfsHandler) : Pushback(msfsHandler) {}

 private:
  constexpr int     getParkBrakeFactor() const override final { return PARKING_BRAKE_FACTOR; }
  constexpr FLOAT64 getSpeedFactor() const override final { return SPEED_FACTOR; }
  constexpr FLOAT64 getTurnSpeedFactor() const override final { return TURN_SPEED_FACTOR; }
};

#endif  // FLYBYWIRE_AIRCRAFT_PUSHBACK_A380X_H
