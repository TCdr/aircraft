// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_ENGINEIGNITION_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_ENGINEIGNITION_A380X_HPP

/**
 * @class EngineIgnition_A380X
 *
 * Whether the FADEC of one engine selects both igniters (A + B) whatever the ENG START selector position, i.e. sets the MSFS
 * ignition switch of that engine (TURB ENG IGNITION SWITCH EX1) to IGN. One instance per engine, updated every frame.
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 *
 * MSFS only burns again after losing its combustion with its ignition switch at IGN, above min_n2_for_combustion = 20 % N2
 * (engines.cfg). At NORM the MSFS automatic ignition (ignition_auto_type = "AntiIce,Flaps") stays off in a clean climb: in the
 * flight of 2026-10-06 MSFS dropped the combustion of all four engines by itself at 7 900 ft, the engines windmilled at
 * 24.7 % N2 for 150 s and lit up in the 0.5 s sample in which the crew selected IGN START.
 *
 * Two FADEC functions select the igniters:
 *
 * 1. IN-FLIGHT RELIGHT (unchanged): while the systems WASM reports a relight lighting up (A32NX_ENGINE_n_RELIGHT_IGNITION),
 *    in flight, during the start sequence (STARTING, RESTARTING) or the shutdown that precedes it (SHUTTING).
 *    A380 FCOM DSC-70-30 IN FLIGHT (a380_fcom.txt l.113572): "Ignition starts (igniters A + B)".
 *
 * 2. AUTO RELIGHT. A380 FCOM DSC-70-80-30-20 QUICK AND AUTO RELIGHT (l.112533-112537): "If the FADEC detects an engine flame
 *    out, on ground or in flight, continuous ignition with both igniters is automatically selected. The ignition is
 *    maintained for 60 s after engine relight." Also DSC-70-80-20 FLAMEOUT PREVENTION (l.112374-112378): "the FADEC
 *    automatically selects both igniters to quickly recover the engine. When the engine relights, the FADEC maintains both
 *    igniters for 60 s", and the ENG START selector NORM (DSC-70-90, l.112720-112723): "continuous ignition A + B is
 *    automatically selected when: - The FADEC detects that the engine has a risk of flameout".
 *
 *    Flameout detection: the engine must run - FBW engine state ON, ENG MASTER ON, FADEC supplied, fuel not cut - but MSFS has
 *    lost its combustion (GENERAL ENG COMBUSTION) for FLAMEOUT_CONFIRMATION_SECONDS.
 *    Design choice: the FCOM detection "is based on the N2 and on the pressure in the combustion chamber" (l.112379); MSFS has
 *    no combustion chamber pressure, and its combustion flag is its flame itself, so the flag is the detection. The core speed
 *    is not used: the FBW idle N3 and the MSFS idle differ by a few tenths of a percent, so "below idle" would fire on a normal
 *    running engine. The confirmation time ignores a combustion flag that drops for a frame or two (start-end transitions);
 *    0.5 s keeps the ignition within about 1 s of a real flameout.
 *
 *    Release: the ignition stays on until the combustion is back, then for IGNITION_HOLD_AFTER_RELIGHT_SECONDS of continuous
 *    combustion (a new loss of combustion during that time restarts the 60 s at the next relight).
 *
 *    Inhibitions (the auto relight ends at once and gives the ignition switch back to the ENG START selector):
 *    - ENG MASTER OFF. DSC-70-80-30-20 MANUAL ABORT OF AUTOMATIC START (l.112518-112524): setting the ENG MASTER lever to OFF
 *      "Closes the fuel HP valve and the engine start valve - Stops the ignition - Resets the FADEC".
 *    - ENG FIRE pb released. DSC-26 ENGINE ISOLATION (l.52996-53004): the ENG FIRE pb, when pressed, "Closes the low-pressure
 *      fuel valve" and "Shuts off the FADEC power supply": an unsupplied FADEC selects no igniter.
 *    - Fuel cut by the systems WASM (LP valve starvation, flyPad flameout or seizure failure, in-flight relight not lit up yet)
 *      and seizure. Design choice: no auto relight while the fuel is cut. The systems WASM owns the relight of a failed engine
 *      (relight envelope, crew ENG RELIGHT procedure) and selects the igniters itself (function 1) once it lets the engine
 *      light up; igniters on a cut engine would light nothing (the MSFS fuel valve is closed) and would only show an IGN that
 *      the crew procedure has to select. An engine whose fuel is cut is not ON anyway (the FADEC handles it as starter off).
 *    - Crew start or shutdown: any FBW engine state but ON (OFF, STARTING, RESTARTING, SHUTTING) keeps the existing logic.
 *
 *    The ignition alone relights only a core that turns at least at 20 % N2 (MSFS min_n2_for_combustion): a windmilling
 *    engine above about 215 kt (24.7 % N2 in the 2026-10-06 flight) relights at once; a slower core needs the crew relight
 *    procedure (starter air). The auto relight does not run a starter.
 */
class EngineIgnition_A380X {
 public:
  /// Design choice: how long MSFS must have lost its combustion before the FADEC calls it a flameout (filters a flicker).
  static constexpr double FLAMEOUT_CONFIRMATION_SECONDS = 0.5;
  /// FCOM DSC-70-80-30-20 (l.112537): "The ignition is maintained for 60 s after engine relight."
  static constexpr double IGNITION_HOLD_AFTER_RELIGHT_SECONDS = 60.0;

  enum class AutoRelightPhase {
    MONITORING,  // the engine runs (or must not run): no auto relight ignition
    FLAMED_OUT,  // flameout detected: both igniters on until MSFS burns again
    RELIT,       // the engine burns again: both igniters kept on for 60 s
  };

  struct Inputs {
    bool   simOnGround;               // SIM ON GROUND
    bool   engineRunning;             // FBW engine state ON (A32NX_ENGINE_STATE)
    bool   engineStartingOrShutting;  // FBW engine state STARTING, RESTARTING or SHUTTING
    bool   masterOn;                  // ENG MASTER ON (GENERAL ENG STARTER, driven by the lever)
    bool   fuelCut;                   // the systems WASM cuts the engine fuel (A32NX_ENGINE_n_FUEL_CUT)
    bool   seized;                    // seizure failure (A32NX_ENGINE_n_SEIZED)
    bool   firePbReleased;            // ENG FIRE pb released (A32NX_FIRE_BUTTON_ENGn): the FADEC is no longer supplied
    bool   simCombustion;             // GENERAL ENG COMBUSTION
    bool   systemsRelightIgnition;    // an in-flight relight is lighting up (A32NX_ENGINE_n_RELIGHT_IGNITION)
    double deltaTime;                 // seconds since the previous update
  };

  /**
   * @brief Updates the igniter selection of the engine for this frame.
   *
   * @param inputs The engine and aircraft conditions of this frame.
   * @return true when the FADEC selects both igniters (MSFS ignition switch at IGN), false to leave the ignition switch to
   *         the ENG START selector.
   */
  bool update(const Inputs& inputs) {
    const bool relightIgnition = inputs.systemsRelightIgnition && !inputs.simOnGround && inputs.engineStartingOrShutting;
    updateAutoRelight(inputs);
    return relightIgnition || autoRelightIgnition();
  }

  /// The auto relight selects the igniters (flameout detected, or relit less than 60 s ago).
  bool autoRelightIgnition() const { return phase != AutoRelightPhase::MONITORING; }

  AutoRelightPhase autoRelightPhase() const { return phase; }

 private:
  AutoRelightPhase phase                 = AutoRelightPhase::MONITORING;
  double           combustionLostSeconds = 0.0;  // how long MSFS has been without combustion while the engine must run
  double           relitSeconds          = 0.0;  // how long MSFS has been burning again since the relight

  void updateAutoRelight(const Inputs& inputs) {
    const bool engineMustRun =
        inputs.engineRunning && inputs.masterOn && !inputs.fuelCut && !inputs.seized && !inputs.firePbReleased;
    if (!engineMustRun) {
      phase                 = AutoRelightPhase::MONITORING;
      combustionLostSeconds = 0.0;
      relitSeconds          = 0.0;
      return;
    }

    if (inputs.simCombustion) {
      combustionLostSeconds = 0.0;
      if (phase == AutoRelightPhase::FLAMED_OUT) {
        // the engine relights: the 60 s start now
        phase        = AutoRelightPhase::RELIT;
        relitSeconds = 0.0;
      } else if (phase == AutoRelightPhase::RELIT) {
        relitSeconds += inputs.deltaTime;
        if (relitSeconds >= IGNITION_HOLD_AFTER_RELIGHT_SECONDS) {
          phase = AutoRelightPhase::MONITORING;
        }
      }
      return;
    }

    combustionLostSeconds += inputs.deltaTime;
    if (phase == AutoRelightPhase::RELIT) {
      // the flame goes out again within the 60 s: the igniters stay on, the 60 s restart at the next relight
      phase = AutoRelightPhase::FLAMED_OUT;
    } else if (phase == AutoRelightPhase::MONITORING && combustionLostSeconds >= FLAMEOUT_CONFIRMATION_SECONDS) {
      phase = AutoRelightPhase::FLAMED_OUT;
    }
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_ENGINEIGNITION_A380X_HPP
