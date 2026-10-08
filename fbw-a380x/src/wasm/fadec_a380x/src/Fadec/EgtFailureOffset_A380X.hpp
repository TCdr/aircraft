// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_EGTFAILUREOFFSET_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_EGTFAILUREOFFSET_A380X_HPP

#include <cmath>

/**
 * @class EgtFailureOffset_A380X
 *
 * The EGT that the FADEC writes for a running engine with the EGT offset of the engine failures (stall, EGT overtemperature;
 * systems WASM, a380_systems engine_malfunction.rs). No MSFS SDK dependency: tested natively (test/run_tests.sh).
 *
 * The FADEC EGT follows its target (the EGT polynomial) through a slow lag (time constant 10 s). The failure offset has its own
 * dynamics in the systems WASM: it is added after the lag, so that a stall gives the rapid EGT rise of the FCOM (ENG STALL,
 * a380_fcom.txt l.172818: "high EGT, and/or a rapid EGT rise"), and the lag goes on with the EGT of the healthy engine.
 */
class EgtFailureOffset_A380X {
 public:
  /// The time constant of the EGT lag (EngineControl_A380X::updateEGT), in seconds.
  static constexpr double EGT_LAG_TIME_CONSTANT_SECONDS = 10.0;

  /**
   * @param writtenEgt the EGT written at the previous update, offset included
   * @param offsetApplied the failure offset included in writtenEgt
   * @param targetEgt the EGT of the healthy engine at its current parameters (EGT polynomial)
   * @param offset the failure offset now
   * @param deltaTime the time since the previous update, in seconds
   * @return the EGT to write, offset included
   */
  static double nextEgt(double writtenEgt, double offsetApplied, double targetEgt, double offset, double deltaTime) {
    const double previousHealthyEgt = writtenEgt - offsetApplied;
    const double healthyEgt =
        targetEgt + (previousHealthyEgt - targetEgt) * std::exp(-deltaTime / EGT_LAG_TIME_CONSTANT_SECONDS);
    return healthyEgt + offset;
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_EGTFAILUREOFFSET_A380X_HPP
