// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_MSFSCORELIMITER_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_MSFSCORELIMITER_A380X_HPP

#include <algorithm>
#include <optional>

#include "CoreSpikeGuard_A380X.hpp"

/**
 * @class MsfsCoreLimiter_A380X
 *
 * Limits the MSFS core speed itself (TURB ENG N2, the Trent N3) during the jump of the MSFS core at the end of an in-flight start,
 * so that MSFS does not give the real thrust pulse that CoreSpikeGuard_A380X only hides from the FADEC indications. One instance per
 * engine. No MSFS SDK dependency: tested natively (test/run_tests.sh, test/msfs_core_limiter_test.cpp).
 *
 * What MSFS does (measured in the sim, engine 4 quick relight at FL150/240 kt, and in several other in-flight relights): the
 * in-flight MSFS start accelerates the core at 1 %/s. When the core reaches low_idle_n2 = 60.0 % corrected (engines.cfg) MSFS
 * ends its start: within 0.5 s the core goes 57.7 -> 96.2 % (100 % corrected, the top of corrected_n2_from_ff_table), stays
 * there 2.3 s, then runs down to 58.4 % about 10 s later. Nothing of FBW changes in that instant: MSFS throttle 0
 * (EngineStartThrottleHold), commanded N1 23.9 %, starter, combustion and fuel valve unchanged, FBW state STARTING. The MSFS
 * fan follows (22 -> 59.7 % in 2.7 s) and the thrust of engine 4 goes -2 100 -> +11 800 lb and back within 10 s. The MSFS idle
 * target at throttle 0 is about 61 % corrected (the core settles at 60.7-61.2 % corrected), so the start ends at idle: the
 * jump comes from the state of the MSFS fuel flow controller (fuel_flow_controller_p 3.7 / i 0.01 / iboundary 1 on the
 * A380X), wound up while the start held the core below its target. It unwinds only while the core is above the target (the
 * 2.3 s at 100 %). Ground starts (APU bleed) end without it (60.1 -> 66.4 -> 63.1 %), and so do the A32NX in-flight starts
 * (68.7 -> 71.2 %, fuel_flow_controller_p 1).
 *
 * What a real engine does: above 58.4 % N2 the start valve closes and the FADEC stabilizes the engine at idle.
 *
 * Design (the engines.cfg values are left alone: they shape the whole MSFS engine response and the A/THR tuning):
 * - Detection: the same as CoreSpikeGuard_A380X (the MSFS core rises faster than 40 %/s from 45-70 %), in flight only. A normal
 *   acceleration is never limited (at most 11 %/s recorded on the A380X).
 * - While active, the FADEC writes the MSFS core back to a ceiling whenever MSFS is above it (TURB ENG CORRECTED N2, as the FADEC
 *   already does in RelightStart_A380X and StartSequence_A380X::RestingCore). The ceiling starts at the core speed of the frame
 *   before the jump and only rises:
 *   - HOLD, MSFS asked for idle (its fan at or above its commanded N1): it rises at ACCELERATION_PERCENT_PER_SECOND up to the FBW
 *     idle N3 + HOLD_MARGIN_PERCENT. The core is then held above the MSFS idle target, so that the fuel flow controller unwinds
 *     (it does not while the core sits at its target), at a much lower thrust than the 100 % corrected of the jump. The ceiling is
 *     never pulled down: a core governed back to the MSFS target would stop the unwinding (tried in the engine model of the test:
 *     the controller stayed wound until MAX_HOLD_SECONDS and the jump came at the end);
 *   - ACCELERATING, MSFS asked for more than the speed reached (its fan below its commanded N1 by ACCELERATION_DEMAND_MARGIN:
 *     thrust lever / A/THR above idle, EngineStartThrottleHold released, or an auto relight with the lever in CL): it rises at
 *     ACCELERATION_PERCENT_PER_SECOND, a normal acceleration, until the fan has reached its command.
 *   After MAX_HOLD_SECONDS the ceiling rises at the acceleration rate whatever MSFS asks, so that the limiter always ends.
 * - The limiter ends once MSFS stays at or below the ceiling (it has unwound) for RELEASE_CONFIRM_SECONDS: from then on MSFS runs
 *   the core alone. It ends at once (no write) on the ground, or when the engine is no longer running or starting (shut down,
 *   fuel cut, seizure), or when the core falls below the detection band (engine lost).
 */
class MsfsCoreLimiter_A380X {
 public:
  /// Design choice: the hold level above the FBW idle N3 (L:A32NX_ENGINE_IDLE_N3, 61.2 % at FL150 in the sim, where MSFS idles
  /// at 58.4-58.9 %): about 10 % of core above the MSFS idle target. The fuel flow controller unwinds the faster the higher the
  /// core is held, and it must have unwound before EngineStartThrottleHold releases the throttle (10 s after the start end):
  /// otherwise the rest of the jump comes with the acceleration to the climb. In the engine model of the test
  /// (msfs_core_limiter_test.cpp) 3 % unwinds in 26 s and gives a climb overshoot to 95 % (core) with the throttle released after
  /// 11 s, 8 % unwinds in 14 s and gives none. Held there the engine gives about +2 600 to +3 300 lb (measured in the sim: core
  /// 70.9 to 73.7 % corrected) instead of the +11 800 lb of the jump, over the -2 100 lb of an idling engine.
  static constexpr double HOLD_MARGIN_PERCENT = 8.0;
  /// Design choice: the core acceleration the ceiling allows, about the fastest normal MSFS acceleration of the A380X (11 %/s
  /// measured in the sim) and of the order of the certification acceleration of an engine (flight idle
  /// to 95 % takeoff thrust in 5 s or less: about 7 %/s of N3).
  static constexpr double ACCELERATION_PERCENT_PER_SECOND = 10.0;
  /// Design choice: MSFS asks for more than the speed reached once its fan is this far below its commanded N1 (both corrected). At
  /// idle the fan settles within 0.5 % of the command (measured: 24.3-25.1 % against 23.9 %).
  static constexpr double ACCELERATION_DEMAND_MARGIN_PERCENT = 2.0;
  /// Design choice: MSFS counts as no longer pushing the core up once it stays within this margin of the ceiling.
  static constexpr double RELEASE_MARGIN_PERCENT = 0.3;
  /// Design choice: how long MSFS must stay at or below the ceiling before the limiter ends.
  static constexpr double RELEASE_CONFIRM_SECONDS = 1.0;
  /// Design choice (no recorded value: the unwinding under the limiter is only known from the engine model): the longest hold,
  /// about twice the 14 s the engine model of the test needs at HOLD_MARGIN_PERCENT. After it the ceiling rises at the
  /// acceleration rate: the rest of the jump, if any, comes at a normal acceleration rate instead of 100 %/s.
  static constexpr double MAX_HOLD_SECONDS = 30.0;

  struct Inputs {
    bool   inFlight;                 // the aircraft is in flight (ground starts end without the jump)
    bool   engineRunningOrStarting;  // FBW state ON, STARTING or RESTARTING, fuel not cut, engine not seized
    double simN3;                    // the MSFS core speed TURB ENG N2:n read this frame, percent
    double simCorrectedN1;           // the MSFS fan speed TURB ENG CORRECTED N1:n, percent
    double simCommandedN1;           // the MSFS commanded N1 TURB ENG COMMANDED N1:n (corrected), percent
    double idleN3;                   // the FBW idle N3 (L:A32NX_ENGINE_IDLE_N3), percent
    double deltaTime;                // seconds
  };

  /**
   * @brief Updates the limiter for this frame.
   * @param inputs The MSFS speeds and the FADEC conditions of this frame.
   * @return The MSFS core speed (TURB ENG N2, uncorrected, percent) to write this frame, or nothing to leave MSFS alone.
   */
  std::optional<double> update(const Inputs& inputs) {
    if (!initialized) {
      previousSimN3 = inputs.simN3;
      initialized   = true;
    }
    const double coreBefore = previousSimN3;
    previousSimN3           = inputs.simN3;

    const bool engineLost = inputs.simN3 < CoreSpikeGuard_A380X::SNAP_START_MIN_N3_PERCENT;
    if (!inputs.inFlight || !inputs.engineRunningOrStarting || engineLost) {
      active = false;
      return std::nullopt;
    }

    if (!active) {
      const double riseThisFrame = inputs.simN3 - coreBefore;
      const bool   risesTooFast  = inputs.deltaTime > 0.0 && riseThisFrame > CoreSpikeGuard_A380X::SNAP_MIN_STEP_PERCENT &&
                                riseThisFrame / inputs.deltaTime > CoreSpikeGuard_A380X::SNAP_DETECTION_RATE_PERCENT_PER_SECOND;
      const bool fromLowIdle = coreBefore >= CoreSpikeGuard_A380X::SNAP_START_MIN_N3_PERCENT &&
                               coreBefore <= CoreSpikeGuard_A380X::SNAP_START_MAX_N3_PERCENT;
      if (!(risesTooFast && fromLowIdle)) {
        return std::nullopt;
      }
      active         = true;
      ceiling        = coreBefore;
      activeSeconds  = 0.0;
      releaseSeconds = 0.0;
    }

    activeSeconds += inputs.deltaTime;
    const double rise = ACCELERATION_PERCENT_PER_SECOND * inputs.deltaTime;
    const bool msfsAsksForMore = inputs.simCorrectedN1 < inputs.simCommandedN1 - ACCELERATION_DEMAND_MARGIN_PERCENT;
    if (msfsAsksForMore || activeSeconds >= MAX_HOLD_SECONDS) {
      ceiling += rise;
    } else {
      // held at the FBW idle + margin; a ceiling already above it (after an acceleration) is kept, never pulled down
      ceiling = (std::max)(ceiling, (std::min)(ceiling + rise, inputs.idleN3 + HOLD_MARGIN_PERCENT));
    }

    if (inputs.simN3 <= ceiling + RELEASE_MARGIN_PERCENT) {
      releaseSeconds += inputs.deltaTime;
      if (releaseSeconds >= RELEASE_CONFIRM_SECONDS) {
        active = false;  // MSFS has unwound: it runs the core alone again
      }
    } else {
      releaseSeconds = 0.0;
    }

    if (active && inputs.simN3 > ceiling) {
      return ceiling;
    }
    return std::nullopt;
  }

  /// True while the limiter watches the MSFS core (from the jump until MSFS has unwound).
  bool isActive() const { return active; }

  /// The current ceiling of the MSFS core speed, percent (meaningful while active).
  double currentCeiling() const { return ceiling; }

 private:
  bool   initialized    = false;
  bool   active         = false;
  double previousSimN3  = 0.0;  // the MSFS core speed of the frame before, percent
  double ceiling        = 0.0;  // the highest MSFS core speed allowed this frame, percent
  double activeSeconds  = 0.0;  // seconds since the jump
  double releaseSeconds = 0.0;  // seconds MSFS has stayed at or below the ceiling
};

#endif  // FLYBYWIRE_AIRCRAFT_MSFSCORELIMITER_A380X_HPP
