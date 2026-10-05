// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_RELIGHTSTART_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_RELIGHTSTART_A380X_HPP

#include <cmath>
#include <optional>

/**
 * @class RelightStart_A380X
 *
 * The MSFS core speed (TURB ENG CORRECTED N2, the Trent N3) that the FADEC sets during a start (STARTING or RESTARTING).
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 *
 * The systems WASM decides whether an in-flight relight lights up (relight envelope, starter air of the FBW pneumatics, quick
 * relight; a380_systems engine_failure.rs) and then releases the engine fuel cut. MSFS itself only burns above
 * min_n2_for_combustion = 20 % N2 (engines.cfg), and its bleed air starter (starter_type = 2) only turns the engine with the MSFS
 * APU bleed (n2_from_bleed_air_psi_table, set from the FBW APU bleed valve: systems_wasm electrical.rs). The crossbleed air of
 * the other engines and the windmilling airflow never reach it, so without the APU bleed a windmilling engine stayed below
 * 20 % and never burned (sim test 2026-10-05: every in-flight relight failed but the one with APU bleed). Therefore:
 * - on the ground, MSFS N2 is held at 0 during the start delay (FBW start behaviour, unchanged);
 * - in flight the core already turns (windmilling, or a quick relight still fast): the start delay does not stop it;
 * - in flight, once the systems WASM lets the relight light up, MSFS is brought to the light-up speed until it burns, as the
 *   MSFS starter does with the APU bleed. MSFS then accelerates the engine to idle by itself.
 */
class RelightStart_A380X {
 public:
  /// The delay between the ENG MASTER ON and the start sequence (EngineControl_A380X::engineStartProcedure).
  static constexpr double START_DELAY_SECONDS = 1.7;
  /// Design choice: the N2 the MSFS starter gives with the APU bleed (engines.cfg n2_from_bleed_air_psi_table, 18 psi -> 25 %),
  /// above min_n2_for_combustion (20 %) and min_n2_for_fuel_flow (22 %). A380 FCOM DSC-70-30 IN FLIGHT (a380_fcom.txt
  /// l.113572-113573): "Ignition starts (igniters A + B)", "When N2 is above 20 %: FMV and HP fuel valve open".
  static constexpr double LIGHT_UP_SIM_N2_PERCENT = 25.0;

  struct StartConditions {
    bool   simOnGround;
    double engineTimer;         // seconds since the FADEC began the start (A32NX_ENGINE_TIMER)
    bool   engineFuelCut;       // the systems WASM keeps the engine fuel cut (A32NX_ENGINE_n_FUEL_CUT)
    bool   simCombustion;       // GENERAL ENG COMBUSTION
    double simN2;               // TURB ENG N2 in percent (the Trent N3)
    double ambientTemperature;  // Celsius
  };

  /**
   * @brief The corrected N2 the FADEC writes to MSFS this frame, if any.
   *
   * @param conditions The engine and flight conditions of the start.
   * @return The TURB ENG CORRECTED N2 to write in percent, or nothing to leave MSFS alone.
   */
  static std::optional<double> correctedN2Command(const StartConditions& conditions) {
    if (conditions.simOnGround) {
      if (conditions.engineTimer < START_DELAY_SECONDS) {
        return 0.0;
      }
      return std::nullopt;
    }

    const bool relightLitUp = !conditions.engineFuelCut;
    if (relightLitUp && !conditions.simCombustion && conditions.simN2 < LIGHT_UP_SIM_N2_PERCENT) {
      return correctedN2(LIGHT_UP_SIM_N2_PERCENT, conditions.ambientTemperature);
    }
    return std::nullopt;
  }

 private:
  static constexpr double ISA_SEA_LEVEL_TEMPERATURE_KELVIN = 288.15;

  /// The corrected speed of a spool: N / sqrt(theta), theta = T / 288.15 K.
  static double correctedN2(double n2, double ambientTemperature) {
    const double theta = (ambientTemperature + 273.15) / ISA_SEA_LEVEL_TEMPERATURE_KELVIN;
    return n2 / std::sqrt(theta);
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_RELIGHTSTART_A380X_HPP
