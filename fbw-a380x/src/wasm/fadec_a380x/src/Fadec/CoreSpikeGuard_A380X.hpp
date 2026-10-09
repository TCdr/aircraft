// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_CORESPIKEGUARD_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_CORESPIKEGUARD_A380X_HPP

#include <algorithm>
#include <limits>

/**
 * @class CoreSpikeGuard_A380X
 *
 * Filters the jump of the MSFS core speed at the end of an MSFS engine start (in-flight relight), so that the FADEC indications
 * (N3, N1, fuel flow, EGT) and its logic (state machine, igniters, oil) do not see it. One instance per engine. No MSFS SDK
 * dependency: tested natively (test/run_tests.sh, test/core_spike_guard_test.cpp).
 *
 * What MSFS does (sim tests of 2026-10-06, s1.log T2/T3, s3_tank1.log, s6_main1.log): after a relight MSFS accelerates the core
 * at about 1 %/s in its start mode. When the core reaches the low idle of engines.cfg (low_idle_n2 = 60 % corrected, 58.1-59.5 %
 * at the recorded temperatures), MSFS ends its start and takes the core speed from its fuel flow controller
 * (corrected_n2_from_ff_table). That controller has saturated meanwhile (fuel_flow_controller_p = 3.7 on the A380X against 1 on
 * the A32NX, with a much steeper table), so the core jumps within 0.3-0.5 s to the top of the table, 100 % corrected (96.9-99.2 %
 * recorded, exactly 100 / 60 times the start end value), stays there 1.7-6 s until the lagging MSFS N1 catches up with its
 * commanded N1, then runs down to the speed of its throttle in 3-8 s. It happens with the MSFS throttle at idle (relight ended
 * in STARTING/RESTARTING, the throttle held by EngineStartThrottleHold) as with the throttle in CL (auto relight, engine ON).
 * The A32NX shows no such jump (sim test 2026-10-06 S1 T1: max 15 %/s with the throttle rising, 0.2 % above engine 2).
 * A real engine does not do this: the FADEC "stabilizes the engine at idle speed" at the end of an in-flight start (A380 FCOM
 * DSC-70-30, a380_fcom.txt l.113578), and accelerates from there.
 *
 * Design (the engines.cfg values are left alone: they shape the whole MSFS engine response and the A/THR tuning):
 * - Detection: the MSFS core rises faster than SNAP_DETECTION_RATE from a speed in the low idle band. A normal acceleration
 *   is never filtered (at most 11 %/s recorded on the A380X, 15 %/s on the A32NX; the jump is 94-157 %/s).
 * - While the jump lasts, the guarded N3 and N1 leave their value of the frame before and rise at most at a normal acceleration
 *   rate, never above the MSFS value, and follow it at once when it falls:
 *   - a start that ends (FBW state STARTING or RESTARTING): up to the FBW idle, where the FADEC stabilizes the engine; the FBW
 *     start then ends at idle as it did before (the FBW state goes ON);
 *   - a running engine (auto relight): towards the MSFS value while MSFS is saturated, then held while MSFS runs down from its
 *     saturation (its value is not the engine speed yet), so that it does not overshoot the speed MSFS settles at.
 *   Once MSFS has settled (falls less than SETTLED_MAX_FALL in SETTLED_WINDOW), or after MAX_FILTER_SECONDS, the guarded value
 *   rises towards the MSFS value at the acceleration rate.
 * - The jump ends for each value when MSFS has come down from its peak (or after MAX_FILTER_SECONDS) and is back at or below
 *   the guarded value: from then on the MSFS value is used unchanged. The MSFS fan lags the core (sim test 2026-10-08, blip2.log:
 *   in the sample where the core jumps 57.7 to 60.9 % the fan only goes 22.2 to 22.4 %, and creeps up to 59.7 % in 2.6 s), so
 *   while MSFS still rises the guarded value uses the MSFS value whenever it is not above the allowed one. If the fan never rises
 *   above the guarded value, the N1 jump ends with the N3 jump.
 * The MSFS thrust itself follows the MSFS N1 and is not changed by this guard.
 */
class CoreSpikeGuard_A380X {
 public:
  /// Design choice: the MSFS core rise that counts as the end-of-start jump: well above any normal acceleration (11 %/s A380X,
  /// 15 %/s A32NX, sim tests 2026-10-06) and well below the jump (94-157 %/s in the 0.1 s samples of s3_tank1.log).
  static constexpr double SNAP_DETECTION_RATE_PERCENT_PER_SECOND = 40.0;
  /// Design choice: the smallest rise in one frame that counts, so that the rate of a very short frame cannot trigger it.
  static constexpr double SNAP_MIN_STEP_PERCENT = 0.5;
  /// Design choice: the band of the core speed the jump starts from: low_idle_n2 = 60 % corrected (engines.cfg) is 52-63 % from
  /// -60 to +45 Celsius. A flight load or a slew that sets the core from 0 to a running speed is not a jump to filter.
  static constexpr double SNAP_START_MIN_N3_PERCENT = 45.0;
  static constexpr double SNAP_START_MAX_N3_PERCENT = 70.0;
  /// Design choice: the N3 acceleration while the jump is filtered: from idle to the climb N3 (about 62 to 85 %) in about 6 s, a
  /// little below the MSFS acceleration with the throttle rising after a start (about 6 %/s on average, 61 to 85 % in 4.1 s,
  /// s1.log T2) so that the guarded N3 does not run ahead of the speed MSFS settles at (T3: the MSFS jump lasted 6.3 s).
  static constexpr double N3_ACCELERATION_PERCENT_PER_SECOND = 4.0;
  /// Design choice: the N1 acceleration while the jump is filtered, the same as the N1 target rise after an in-flight start
  /// (fbw_common EngineStartThrottleHold::ACCELERATION_N1_PERCENT_PER_SECOND).
  static constexpr double N1_ACCELERATION_PERCENT_PER_SECOND = 10.0;
  /// Design choice: MSFS has left its saturation once its value is this much below the highest value of the jump.
  static constexpr double SATURATION_EXIT_DROP_PERCENT = 2.0;
  /// Design choice: MSFS has settled once its value fell less than SETTLED_MAX_FALL_PERCENT in SETTLED_WINDOW_SECONDS (it runs
  /// down at 2-5 %/s after the saturation, 1-3 %/s near the end).
  static constexpr double SETTLED_WINDOW_SECONDS   = 1.0;
  static constexpr double SETTLED_MAX_FALL_PERCENT = 1.0;
  /// Design choice: the longest time the guarded value is held below MSFS (the recorded jumps last 7-10 s from the start of the
  /// jump to the settled MSFS value); after it the guarded value only rises at the acceleration rate.
  static constexpr double MAX_FILTER_SECONDS = 20.0;

  struct Inputs {
    double simN3;           // the MSFS core speed TURB ENG N2:n (the Trent N3), percent
    double simN1;           // the MSFS fan speed TURB ENG N1:n, percent
    bool   engineStarting;  // the FBW engine state is STARTING or RESTARTING this frame
    double idleN3;          // the FBW idle N3 (L:A32NX_ENGINE_IDLE_N3), percent
    double idleN1;          // the FBW idle N1 (L:A32NX_ENGINE_IDLE_N1), percent
    double deltaTime;       // seconds
  };

  struct Output {
    double n3;  // the core speed the FADEC uses and shows, percent
    double n1;  // the fan speed the FADEC uses and shows, percent
  };

  /**
   * @brief Updates the guard for this frame.
   * @param inputs The MSFS speeds and the FADEC conditions of this frame.
   * @return The N3 and N1 the FADEC uses this frame: the MSFS values, or the guarded values during a jump.
   */
  Output update(const Inputs& inputs) {
    if (!initialized) {
      previousSimN3 = inputs.simN3;
      n3.follow(inputs.simN3);
      n1.follow(inputs.simN1);
      initialized = true;
    }

    const double riseThisFrame  = inputs.simN3 - previousSimN3;
    const bool   risesTooFast   = inputs.deltaTime > 0.0 && riseThisFrame > SNAP_MIN_STEP_PERCENT &&
                              riseThisFrame / inputs.deltaTime > SNAP_DETECTION_RATE_PERCENT_PER_SECOND;
    const bool   fromLowIdle    = previousSimN3 >= SNAP_START_MIN_N3_PERCENT && previousSimN3 <= SNAP_START_MAX_N3_PERCENT;
    const bool   jumpStarts     = !n3.isFiltering() && risesTooFast && fromLowIdle;
    previousSimN3               = inputs.simN3;

    if (jumpStarts) {
      // a start that ends stabilizes at idle; a running engine has no ceiling but the MSFS value
      const double noCeiling = std::numeric_limits<double>::infinity();
      n3.startFiltering(inputs.engineStarting ? inputs.idleN3 : noCeiling, inputs.engineStarting);
      n1.startFiltering(inputs.engineStarting ? inputs.idleN1 : noCeiling, inputs.engineStarting);
    }

    const double guardedN3 = n3.update(inputs.simN3, inputs.deltaTime, N3_ACCELERATION_PERCENT_PER_SECOND);
    const double guardedN1 = n1.update(inputs.simN1, inputs.deltaTime, N1_ACCELERATION_PERCENT_PER_SECOND);
    if (!n3.isFiltering()) {
      // the core is back at the MSFS value: a fan that never rose above its guarded value has no jump left to filter
      n1.endIfNotRisen(inputs.simN1);
    }
    return {guardedN3, n1.isFiltering() ? guardedN1 : inputs.simN1};
  }

  /// True while the guarded N3 differs from the MSFS N3 (a jump is being filtered).
  bool isFilteringN3() const { return n3.isFiltering(); }

 private:
  /// One guarded speed (N3 or N1): the MSFS value, or during a jump the rate limited value described in the class comment.
  class GuardedSpeed {
   public:
    void follow(double simValue) {
      output    = simValue;
      filtering = false;
    }

    /// Starts filtering from the value of the frame before (kept in output).
    void startFiltering(double ceiling, bool ceilingUntilSettled) {
      filtering            = true;
      phase                = Phase::SATURATED;
      elapsed              = 0.0;
      peak                 = output;
      startCeiling         = ceiling;
      holdAtStartCeiling   = ceilingUntilSettled;
      settleWindowStart    = output;
      settleWindowDuration = 0.0;
      simWentAbove         = false;
    }

    /// Ends the filtering if the MSFS value has not risen above the guarded value since the jump started.
    void endIfNotRisen(double simValue) {
      if (filtering && !simWentAbove) {
        follow(simValue);
      }
    }

    double update(double simValue, double deltaTime, double accelerationPerSecond) {
      if (!filtering) {
        output = simValue;
        return output;
      }
      elapsed += deltaTime;
      trackMsfsPhase(simValue, deltaTime);

      // the highest value the guarded speed may rise to this frame (it is never pulled down by this limit)
      double limit = std::numeric_limits<double>::infinity();
      if (phase != Phase::SETTLED && elapsed < MAX_FILTER_SECONDS) {
        if (holdAtStartCeiling) {
          limit = startCeiling;  // a start that ends: up to idle
        } else if (phase == Phase::SETTLING) {
          limit = output;  // a running engine: held while MSFS runs down from its saturation
        }
      }
      const double raised = (std::min)(output + accelerationPerSecond * deltaTime, (std::max)(output, limit));

      if (simValue > raised) {
        simWentAbove = true;
        output       = raised;
      } else if (phase != Phase::SATURATED || elapsed >= MAX_FILTER_SECONDS) {
        // MSFS has come down from its peak and is back at or below the guarded value: the jump is over for this speed
        follow(simValue);
      } else {
        // MSFS has not risen yet, or still rises within the allowed rate (the fan lags the core): its value is used, the jump is
        // still watched
        output = simValue;
      }
      return output;
    }

    bool isFiltering() const { return filtering; }

   private:
    enum class Phase { SATURATED, SETTLING, SETTLED };

    /// MSFS saturated (at the top of its table), then running down from it, then settled at the speed of its throttle.
    void trackMsfsPhase(double simValue, double deltaTime) {
      if (phase == Phase::SATURATED) {
        peak = (std::max)(peak, simValue);
        if (simValue < peak - SATURATION_EXIT_DROP_PERCENT) {
          phase                = Phase::SETTLING;
          settleWindowStart    = simValue;
          settleWindowDuration = 0.0;
        }
      } else if (phase == Phase::SETTLING) {
        settleWindowDuration += deltaTime;
        if (settleWindowDuration >= SETTLED_WINDOW_SECONDS) {
          if (settleWindowStart - simValue < SETTLED_MAX_FALL_PERCENT) {
            phase = Phase::SETTLED;
          } else {
            settleWindowStart    = simValue;
            settleWindowDuration = 0.0;
          }
        }
      }
    }

    double output               = 0.0;
    bool   filtering            = false;
    Phase  phase                = Phase::SATURATED;
    double elapsed              = 0.0;  // seconds since the jump started
    double peak                 = 0.0;  // the highest MSFS value of the jump, percent
    double startCeiling         = 0.0;  // the FBW idle of a start that ends, percent
    bool   holdAtStartCeiling   = false;
    double settleWindowStart    = 0.0;  // the MSFS value at the start of the current settle window, percent
    double settleWindowDuration = 0.0;  // seconds
    bool   simWentAbove         = false;  // the MSFS value has risen above the guarded value since the jump started
  };

  bool         initialized   = false;
  double       previousSimN3 = 0.0;  // the MSFS N3 of the frame before, percent
  GuardedSpeed n3{};
  GuardedSpeed n1{};
};

#endif  // FLYBYWIRE_AIRCRAFT_CORESPIKEGUARD_A380X_HPP
