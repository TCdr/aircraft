// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

#include <algorithm>

/**
 * @class EngineStartThrottleHold
 *
 * The MSFS throttle of an engine that is out or (re)starting in flight, and its acceleration from idle once it runs. Shared by the
 * fbw modules of the A32NX (fbw_a320) and the A380X (fbw_a380): one instance per engine. No MSFS SDK dependency: tested natively
 * (fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh, fbw-a380x/src/wasm/fbw_a380/test/run_tests.sh).
 *
 * Why: the thrust loop of each engine (the generated FadecComputer / A380FadecComputer model) integrates the MSFS throttle until the
 * MSFS commanded N1 (TURB ENG COMMANDED N1) meets the N1 target of the thrust lever or the A/THR. While an engine is out or starting,
 * MSFS does not govern it to the throttle and its commanded N1 stays low, and for a few seconds after its start it still lags: the
 * loop wound the throttle up to 100 %. When the MSFS start ended, MSFS governed the engine to that full throttle until the commanded
 * N1 had caught up:
 * - A32NX (sim test 2026-10-05, leap_relight.log): N2 113 % at FL150 (lever CL) and 111 % at FL265 with the lever at IDLE, 3-7 s.
 * - A380X (sim test 2026-10-05, b1_inflight.log): N3 61 -> 97.5 % (the MSFS N2 limit) for 5.5-7 s on all three in-flight relights
 *   (FL200/300 kt windmill, FL150/240 kt quick relight, FL150/210 kt crossbleed relight), levers in CL with the A/THR.
 *
 * The FADEC brings the engine to idle at the end of a start, whatever the thrust lever:
 * - A320 FCOM DSC-70-80-40 (a320_fcom.txt l.63588) "This sequence is under the full authority of the FADEC"; QRH ENG RELIGHT IN
 *   FLIGHT: "THR LEVER (affected engine) IDLE", then "When idle reached (ENG AVAIL)".
 * - A380 FCOM DSC-70-30 automatic start, IN FLIGHT (a380_fcom.txt l.113579) "FADEC stabilizes the engine at idle speed."; ENG
 *   RELIGHT IN FLIGHT (l.174905) "THR LEVER (AFFECTED) ... IDLE", then (l.174948) "WHEN IDLE REACHED (ENG AVAIL)".
 * Therefore, in flight only (ground starts are unchanged):
 * 1. HOLD: while the engine is out or starting (FBW engine state SHUTTING, STARTING or RESTARTING), and after the start (state ON)
 *    until the MSFS commanded N1 has reached the idle N1 limit (MSFS governs the engine again), the MSFS throttle is at idle and the
 *    loop is told that the engine delivers more than any N1 target, so that its throttle integrator rests at its idle stop instead
 *    of winding up. Should the commanded N1 settle below the idle limit, the hold ends idleStabilisationMaxSeconds after the start.
 *    The commanded N1 only counts once the state is ON: during a quick relight MSFS already commands its idle N1 at throttle 0.
 *    Fallback, the start ended below the FBW idle: MSFS idles at throttle 0 at its own idle core speed, which can be a little below
 *    the FBW idle N2/N3 (A380X: 61.9 % recorded at FL150 against the FBW 62.0 %); the FBW FADEC then never sees the start end (it
 *    goes ON at the FBW idle - 0.1) and, with the commanded N1 also below the idle limit, the hold would never end. So while the
 *    engine is STARTING/RESTARTING with its MSFS core speed near the FBW idle (within releaseBandBelowIdlePercent) and no longer
 *    rising (less than plateauMinRisePercent in plateauSeconds), the MSFS throttle is raised slowly from idle
 *    (releaseThrottlePercentPerSecond, at most releaseThrottleMaxPercent) until the FADEC sees the engine ON; that throttle is kept
 *    until the hold ends, then handed over to the loop: it falls back at the same rate, and the loop throttle takes over as soon as
 *    it is higher.
 * 2. ACCELERATING: the loop then drives the throttle again, towards an N1 target that rises from the idle reached to the lever or
 *    A/THR target at accelerationN1PercentPerSecond (the loop is fed the commanded N1 shifted by the part of the target not yet
 *    released), so that the lagging MSFS commanded N1 can follow without winding the loop up again.
 * 3. NORMAL: once the target is reached, the loop works as usual.
 */
class EngineStartThrottleHold {
 public:
  /// FBW engine states (L:A32NX_ENGINE_STATE:n), the same on both aircraft: fadec_a32nx EngineControlA32NX.h and fadec_a380x
  /// EngineControl_A380X.h (OFF 0, ON 1, STARTING 2, RESTARTING 3, SHUTTING 4).
  static constexpr double ENGINE_STATE_ON         = 1;
  static constexpr double ENGINE_STATE_STARTING   = 2;
  static constexpr double ENGINE_STATE_RESTARTING = 3;
  static constexpr double ENGINE_STATE_SHUTTING   = 4;

  /// The MSFS throttle at idle, percent.
  static constexpr double IDLE_THROTTLE_PERCENT = 0.0;

  /// The commanded N1 given to the thrust loop during the hold: above any N1 target (TOGA ~100 %), so that the throttle integrator
  /// (5 % throttle per second per % of N1 error on both aircraft) runs to its idle stop within a fraction of a second and rests there.
  static constexpr double HOLD_LOOP_COMMANDED_N1_PERCENT = 200.0;

  /// Design choice: the engine counts as at idle once the MSFS commanded N1 is within this margin of the idle N1 limit.
  static constexpr double IDLE_REACHED_MARGIN_PERCENT = 1.0;

  /// Design choice (no FCOM value): the longest hold at idle after the start ends, should the MSFS commanded N1 settle below the
  /// FBW idle N1 limit. The recordings show the commanded N1 lagging the engine for up to 6.5 s (A32NX) and 7 s (A380X) after an
  /// in-flight start.
  static constexpr double IDLE_STABILISATION_MAX_SECONDS = 10.0;

  /// Design choice: the rise of the N1 target from idle after the start: idle (~30-40 % in flight) to the climb N1 in about 5 s,
  /// the order of the certified engine acceleration (14 CFR 33.73(b) / CS-E 745: flight idle to 95 % takeoff thrust in 5 s or
  /// less), and slower than the MSFS commanded N1 recovers after a start (about 14 %/s in the A32NX recordings, 11-12 %/s in the
  /// A380X ones).
  static constexpr double ACCELERATION_N1_PERCENT_PER_SECOND = 10.0;

  /// Design choice (fallback): the band below the FBW idle core speed in which a start that stops rising counts as ended. The MSFS
  /// start ends 0.8 % (A32NX: 66.0 against 66.8 %) to 4 % (A380X: 58.3 against 61-62 %) below the FBW idle; a windmilling or
  /// starting engine turns well below the band (A380X FADEC floor 25 %, quick relight from 33 %).
  static constexpr double RELEASE_BAND_BELOW_IDLE_PERCENT = 10.0;

  /// Design choice (fallback): the core speed counts as no longer rising when it gained less than this in PLATEAU_SECONDS. An MSFS
  /// start gains about 1 %/s (both aircraft), 3 % in 3 s.
  static constexpr double PLATEAU_MIN_RISE_PERCENT = 0.5;
  static constexpr double PLATEAU_SECONDS          = 3.0;

  /// Design choice (fallback): the MSFS throttle rise and its limit while the start ended below the FBW idle. 1 % of core speed
  /// takes about 2.4 % throttle on the A32NX and about 1 % on the A380X (MSFS N2 tables), so 15 % covers a gap of several % in
  /// about 7 s; the limit also bounds what an MSFS start that ends while the throttle is raised could overshoot.
  static constexpr double RELEASE_THROTTLE_PERCENT_PER_SECOND = 2.0;
  static constexpr double RELEASE_THROTTLE_MAX_PERCENT        = 15.0;

  /// The aircraft parameters. Both aircraft use the defaults above today; an aircraft with other values passes its own.
  struct Parameters {
    double idleReachedMarginPercent        = IDLE_REACHED_MARGIN_PERCENT;
    double idleStabilisationMaxSeconds     = IDLE_STABILISATION_MAX_SECONDS;
    double accelerationN1PercentPerSecond  = ACCELERATION_N1_PERCENT_PER_SECOND;
    double releaseBandBelowIdlePercent     = RELEASE_BAND_BELOW_IDLE_PERCENT;
    double plateauMinRisePercent           = PLATEAU_MIN_RISE_PERCENT;
    double plateauSeconds                  = PLATEAU_SECONDS;
    double releaseThrottlePercentPerSecond = RELEASE_THROTTLE_PERCENT_PER_SECOND;
    double releaseThrottleMaxPercent       = RELEASE_THROTTLE_MAX_PERCENT;
  };

  enum class Phase { NORMAL, HOLD, ACCELERATING };

  struct Inputs {
    bool   onGround;        // the aircraft is on the ground (ground starts are left to the thrust loop)
    double engineState;     // L:A32NX_ENGINE_STATE:n
    double simCommandedN1;  // the MSFS commanded N1 as the thrust loop sees it, percent
    double idleN1Limit;     // L:A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE, percent
    double loopTargetN1;    // the N1 target of the thrust loop (its N1_c output of the previous frame), percent
    double deltaTime;       // seconds
    double coreSpeed;       // the MSFS core speed TURB ENG N2:n (the A380X Trent N3), percent
    double idleCoreSpeed;   // the FBW idle core speed, L:A32NX_ENGINE_IDLE_N2 (A32NX) or L:A32NX_ENGINE_IDLE_N3 (A380X), percent
  };

  struct Output {
    bool   throttleAtIdle;   // the MSFS throttle is held (at idle, or at minimumThrottle during the fallback)
    double loopCommandedN1;  // the commanded N1 to give to the thrust loop, percent
    double minimumThrottle;  // the fallback throttle: the MSFS throttle is not below it, percent
  };

  EngineStartThrottleHold() = default;
  explicit EngineStartThrottleHold(const Parameters& aircraftParameters) : parameters(aircraftParameters) {}

  /**
   * @brief Updates the hold for this frame.
   * @param inputs The engine and flight conditions of this frame.
   * @return What the thrust loop gets and the MSFS throttle limits.
   */
  Output update(const Inputs& inputs) {
    const bool engineStarting = inputs.engineState == ENGINE_STATE_STARTING || inputs.engineState == ENGINE_STATE_RESTARTING;
    const bool engineOutOrStarting = inputs.engineState == ENGINE_STATE_SHUTTING || engineStarting;

    if (inputs.onGround) {
      phase           = Phase::NORMAL;
      releaseThrottle = 0.0;
    } else if (inputs.engineState == ENGINE_STATE_SHUTTING || (phase == Phase::NORMAL && engineOutOrStarting)) {
      phase                = Phase::HOLD;
      secondsSinceStartEnd = 0.0;
      releaseThrottle      = 0.0;
      resetPlateau(inputs.coreSpeed);
    }

    if (phase == Phase::HOLD && inputs.engineState != ENGINE_STATE_SHUTTING) {
      // starting or started: MSFS governs the engine again once its commanded N1 reaches idle (this also ends the hold if MSFS
      // idles below the FBW idle N2/N3 and the FADEC never sees the start end)
      if (inputs.engineState == ENGINE_STATE_ON) {
        secondsSinceStartEnd += inputs.deltaTime;
      }
      if (engineStarting) {
        updateStartEndedBelowIdleFallback(inputs);
      }
      // Idle counts as reached only once the FADEC sees the start end (state ON): while the engine still starts, the MSFS commanded
      // N1 can already sit at the idle limit, as MSFS commands its idle N1 at throttle 0 to an engine that still turns fast (A32NX
      // quick relight, sim test 2026-10-05 T2: released at the RESTARTING, throttle 59 % at the start end, N2 96.8 % against 90 %).
      // A start that never reaches ON is covered by the fallback above.
      const bool idleReached = inputs.engineState == ENGINE_STATE_ON &&
                               inputs.simCommandedN1 >= inputs.idleN1Limit - parameters.idleReachedMarginPercent;
      if (idleReached || secondsSinceStartEnd >= parameters.idleStabilisationMaxSeconds) {
        phase          = Phase::ACCELERATING;
        releasedTarget = inputs.simCommandedN1;
      }
    } else if (phase != Phase::HOLD) {
      // the fallback throttle is handed over to the loop: it falls back at its rise rate, the loop throttle takes over when higher
      releaseThrottle = (std::max)(0.0, releaseThrottle - parameters.releaseThrottlePercentPerSecond * inputs.deltaTime);
    }

    switch (phase) {
      case Phase::HOLD:
        return {true, HOLD_LOOP_COMMANDED_N1_PERCENT, releaseThrottle};
      case Phase::ACCELERATING: {
        releasedTarget = (std::min)(releasedTarget + parameters.accelerationN1PercentPerSecond * inputs.deltaTime, inputs.loopTargetN1);
        const double targetNotYetReleased = inputs.loopTargetN1 - releasedTarget;
        if (targetNotYetReleased <= 0.0 && inputs.engineState == ENGINE_STATE_ON) {
          phase = Phase::NORMAL;
        }
        return {false, inputs.simCommandedN1 + targetNotYetReleased, releaseThrottle};
      }
      case Phase::NORMAL:
      default:
        return {false, inputs.simCommandedN1, releaseThrottle};
    }
  }

  /// The MSFS throttle to write this frame.
  static double simThrottle(const Output& output, double loopThrottle) {
    if (output.throttleAtIdle) {
      return (std::max)(IDLE_THROTTLE_PERCENT, output.minimumThrottle);
    }
    // Only a fallback throttle (> 0) is a floor. A negative loop throttle is the reverse thrust of the thrust loop (its reverse
    // integrator runs from 0 down to -100 %, MSFS full reverse at min_throttle_limit -1 %) and must reach MSFS: a floor at 0 kept
    // both engines at idle with the levers in full reverse (sim test 2026-10-06, s8_main1.log).
    if (output.minimumThrottle <= 0.0) {
      return loopThrottle;
    }
    return (std::max)(loopThrottle, output.minimumThrottle);
  }

  Phase currentPhase() const { return phase; }

  /// The fallback throttle (start ended below the FBW idle), percent.
  double fallbackThrottle() const { return releaseThrottle; }

 private:
  /// Fallback: raises the throttle slowly while a start has stopped rising just below the FBW idle (see the class description).
  void updateStartEndedBelowIdleFallback(const Inputs& inputs) {
    const bool nearIdle = inputs.coreSpeed >= inputs.idleCoreSpeed - parameters.releaseBandBelowIdlePercent;
    if (!nearIdle || inputs.coreSpeed > plateauReferenceCoreSpeed + parameters.plateauMinRisePercent) {
      resetPlateau(inputs.coreSpeed);
    } else {
      plateauTime += inputs.deltaTime;
    }
    if (plateauTime >= parameters.plateauSeconds || releaseThrottle > 0.0) {
      releaseThrottle = (std::min)(releaseThrottle + parameters.releaseThrottlePercentPerSecond * inputs.deltaTime,
                                   parameters.releaseThrottleMaxPercent);
    }
  }

  void resetPlateau(double coreSpeed) {
    plateauReferenceCoreSpeed = coreSpeed;
    plateauTime               = 0.0;
  }

  Parameters parameters{};
  Phase      phase                     = Phase::NORMAL;
  double     secondsSinceStartEnd      = 0.0;
  double     releasedTarget            = 0.0;  // the part of the loop target released so far during the acceleration, percent
  double     plateauReferenceCoreSpeed = 0.0;  // the core speed at the start of the current plateau, percent
  double     plateauTime               = 0.0;  // seconds without the core speed rising by plateauMinRisePercent
  double     releaseThrottle           = 0.0;  // the fallback throttle, percent
};
