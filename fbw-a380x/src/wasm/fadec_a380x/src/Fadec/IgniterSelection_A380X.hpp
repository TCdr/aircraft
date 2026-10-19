// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_IGNITERSELECTION_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_IGNITERSELECTION_A380X_HPP

/**
 * @class IgniterSelection_A380X
 *
 * Which igniters (A, B) the FADEC of one engine energizes, for the ignition indication of the SD ENGINE page
 * (L:A32NX_FADEC_IGNITER_A_ACTIVE_ENGn / L:A32NX_FADEC_IGNITER_B_ACTIVE_ENGn, the names of the A32NX).
 * One instance per engine, updated every frame. No MSFS SDK dependency: tested natively (test/run_tests.sh).
 * The MSFS ignition switch that makes MSFS burn is driven separately (EngineIgnition_A380X); this class only tells which
 * igniters are on.
 *
 * Each engine has two independent igniters A and B; the SD ENGINE page shows the energized ones (A, B or A B).
 *
 * The documented core speed "N2" is the HP spool of the GP7270: on the A380X (Trent 900) it is the FBW N3, as for the start
 * valve (closes above 58.4 % N3, a380_systems pneumatic.rs) and the windmilling core speed.
 *
 * Selection, in priority order:
 * 1. NO IGNITER when the FADEC is not supplied (the ENG FIRE pb released cuts its power supply) or the ENG MASTER lever is OFF
 *    (which stops the ignition).
 * 2. A + B when the FADEC selects both igniters by itself (EngineIgnition_A380X): the auto relight after a flameout
 *    (continuous ignition with both igniters, kept 60 s after the relight) or an in-flight relight that lights up.
 * 2b. A + B in ADVERSE WEATHER: when the FADEC detects a flameout risk from excessive rain or hail at low engine power (idle),
 *    it switches on both igniters of a running engine. Design choices (no published number): excessive rain is a
 *    precipitation rate (AMBIENT PRECIP RATE, MSFS has no hail) of HEAVY_PRECIPITATION_MM_PER_HOUR or more, the red level of
 *    the weather radar (ARINC 708, fbw-common ndwxr constants.h kRedFromMmH); low power is an N1 within IDLE_POWER_N1_MARGIN
 *    of the idle N1 of the FADEC.
 * 3. A + B for the QUICK RELIGHT: the ENG MASTER lever set back to ON within QUICK_RELIGHT_MAX_MASTER_OFF_SECONDS of being set
 *    to OFF with the engine running, with N2 above QUICK_RELIGHT_MIN_N3, kept QUICK_RELIGHT_HOLD_SECONDS after the lever is
 *    set back to ON.
 * 4. START SEQUENCE (FBW engine state STARTING or RESTARTING):
 *    - in flight A + B from the ENG MASTER ON until the engine runs (AVAIL);
 *    - on the ground, the igniters of the start sequence of the systems WASM (L:A32NX_ENGINE_n_IGNITERS, written by
 *      systems::engine::engine_start with the A380 schedule of a380_systems engine_failure.rs). The start sequence is the
 *      one source of truth of the ground start: it also decides with them whether a failed igniter lights the engine up.
 *      It energizes one igniter for a first automatic start, alternated at each start, from 20 % to 58 % N2, both igniters
 *      for the new automatic attempts and none during the automatic dry crank. It is shown while that start sequence runs
 *      (A32NX_ENGINE_n_START_PHASE not 0) or while the FBW engine state is STARTING on the ground.
 * 5. CONTINUOUS IGNITION (ENG START selector at IGN START, engine running), A + B:
 *    - in flight at once;
 *    - on the ground the FADEC stops the igniters after the start sequence: the selector must be set to NORM then back to
 *      IGN START, and the engine must not be at low power (N1 below 53 % for more than 30 s).
 *    Not modelled: the inhibition when the combustion chamber pressure is too high: MSFS has no combustion chamber pressure.
 */
class IgniterSelection_A380X {
 public:
  /// The engine is at low power when N1 is below 53 % for more than 30 s.
  static constexpr double LOW_POWER_N1      = 53.0;
  static constexpr double LOW_POWER_SECONDS = 30.0;
  /// Quick relight: the ENG MASTER lever set to OFF then back to ON within 30 s, with N2 above 45 %; both igniters are kept
  /// 60 s after the lever is back ON.
  static constexpr double QUICK_RELIGHT_MAX_MASTER_OFF_SECONDS = 30.0;
  static constexpr double QUICK_RELIGHT_MIN_N3                 = 45.0;
  static constexpr double QUICK_RELIGHT_HOLD_SECONDS           = 60.0;
  /// Design choices of the adverse weather protection (see the class comment, 2b).
  static constexpr double HEAVY_PRECIPITATION_MM_PER_HOUR = 12.0;
  static constexpr double IDLE_POWER_N1_MARGIN            = 3.0;

  struct Igniters {
    bool a;
    bool b;
  };

  struct Inputs {
    bool   simOnGround;        // SIM ON GROUND
    bool   engineRunning;      // FBW engine state ON (A32NX_ENGINE_STATE)
    bool   engineStarting;     // FBW engine state STARTING or RESTARTING: the start sequence
    bool   masterOn;           // ENG MASTER ON (GENERAL ENG STARTER, driven by the lever)
    bool   firePbReleased;     // ENG FIRE pb released (A32NX_FIRE_BUTTON_ENGn): the FADEC is no longer supplied
    bool   ignStartSelected;   // ENG START selector at IGN START (XMLVAR_ENG_MODE_SEL = 2)
    bool   fadecBothIgniters;  // the FADEC selects both igniters by itself: auto relight or in-flight relight
    bool   startSequenceActive;    // the ground start sequence of the systems WASM runs (A32NX_ENGINE_n_START_PHASE not 0)
    int    startSequenceIgniters;  // the igniters that start sequence energizes (A32NX_ENGINE_n_IGNITERS): bit 0 A, bit 1 B
    double n3Percent;          // FBW N3 (A32NX_ENGINE_N3): the HP spool, the documented "N2"
    double n1Percent;          // FBW N1 (A32NX_ENGINE_N1)
    double deltaTime;          // seconds since the previous update
    double precipitationRateMmPerHour;  // AMBIENT PRECIP RATE (rain; MSFS has no hail)
    double idleN1Percent;               // the idle N1 the engine runs at (A32NX_AUTOTHRUST_THRUST_LIMIT_IDLE)
  };

  /**
   * @brief Updates the igniter selection of the engine for this frame.
   * @param inputs The engine and aircraft conditions of this frame.
   * @return Which igniters are energized.
   */
  Igniters update(const Inputs& inputs) {
    updateQuickRelight(inputs);
    updateContinuousIgnitionConditions(inputs);

    return select(inputs);
  }

 private:
  static constexpr Igniters NONE = {false, false};
  static constexpr Igniters BOTH = {true, true};

  bool   previousMasterOn             = false;
  bool   previousEngineRunning        = false;
  bool   masterOffWhileRunning        = false;  // the ENG MASTER lever went OFF while the engine was running
  double masterOffSeconds             = 0.0;    // how long the ENG MASTER lever has been OFF
  double quickRelightRemainingSeconds = 0.0;    // both igniters of the quick relight, counting down from 60 s

  bool   continuousIgnitionArmed = false;  // on ground: the selector left IGN START after the start sequence
  double lowPowerSeconds         = 0.0;    // how long N1 has been below 53 %

  Igniters select(const Inputs& inputs) const {
    if (inputs.firePbReleased || !inputs.masterOn) {
      return NONE;
    }
    if (inputs.fadecBothIgniters || quickRelightRemainingSeconds > 0.0) {
      return BOTH;
    }
    if (inputs.engineRunning && heavyPrecipitationAtLowPower(inputs)) {
      return BOTH;
    }
    if (inputs.simOnGround && (inputs.engineStarting || inputs.startSequenceActive)) {
      // the ground start shows the igniters of the start sequence of the systems WASM (see the class comment)
      return {(inputs.startSequenceIgniters & 1) != 0, (inputs.startSequenceIgniters & 2) != 0};
    }
    if (inputs.engineStarting) {
      // in flight
      return BOTH;
    }
    if (inputs.engineRunning && inputs.ignStartSelected) {
      if (!inputs.simOnGround) {
        return BOTH;
      }
      const bool lowPower = lowPowerSeconds > LOW_POWER_SECONDS;
      return continuousIgnitionArmed && !lowPower ? BOTH : NONE;
    }
    return NONE;
  }

  /// The adverse weather protection: excessive rain at low engine power (see the class comment, 2b).
  static bool heavyPrecipitationAtLowPower(const Inputs& inputs) {
    return inputs.precipitationRateMmPerHour >= HEAVY_PRECIPITATION_MM_PER_HOUR &&
           inputs.n1Percent <= inputs.idleN1Percent + IDLE_POWER_N1_MARGIN;
  }

  void updateQuickRelight(const Inputs& inputs) {
    quickRelightRemainingSeconds = quickRelightRemainingSeconds > inputs.deltaTime ? quickRelightRemainingSeconds - inputs.deltaTime
                                                                                   : 0.0;
    if (!inputs.masterOn) {
      if (previousMasterOn) {
        // the lever goes to OFF: a quick relight follows only if the engine was running. The FBW engine state is already
        // SHUTTING in this frame (the state machine runs first), so the previous frame tells whether it was running.
        masterOffWhileRunning = previousEngineRunning;
        masterOffSeconds      = 0.0;
      } else {
        masterOffSeconds += inputs.deltaTime;
      }
      quickRelightRemainingSeconds = 0.0;
    } else if (!previousMasterOn && masterOffWhileRunning) {
      // the lever goes back to ON
      if (masterOffSeconds <= QUICK_RELIGHT_MAX_MASTER_OFF_SECONDS && inputs.n3Percent > QUICK_RELIGHT_MIN_N3) {
        quickRelightRemainingSeconds = QUICK_RELIGHT_HOLD_SECONDS;
      }
      masterOffWhileRunning = false;
    }
    previousMasterOn      = inputs.masterOn;
    previousEngineRunning = inputs.engineRunning;
  }

  void updateContinuousIgnitionConditions(const Inputs& inputs) {
    if (!inputs.engineRunning) {
      // a new start sequence (or no engine): the selector has to be cycled again on the ground
      continuousIgnitionArmed = false;
    } else if (!inputs.ignStartSelected || !inputs.simOnGround) {
      // the selector left IGN START with the engine running, or the aircraft flies (no cycling needed in flight)
      continuousIgnitionArmed = true;
    }

    lowPowerSeconds = inputs.n1Percent < LOW_POWER_N1 ? lowPowerSeconds + inputs.deltaTime : 0.0;
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_IGNITERSELECTION_A380X_HPP
