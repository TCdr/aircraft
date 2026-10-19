// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_IGNITERSUPPLY_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_IGNITERSUPPLY_A380X_HPP

#include "IgniterSelection_A380X.hpp"

/**
 * @class IgniterSupply_A380X
 *
 * An igniter without electrical supply is not energized, whatever igniters the FADEC selects (IgniterSelection_A380X):
 * igniter A is on AC ESS, igniter B on AC 3 (engines 1 and 3) or AC 2 (engines 2 and 4). The systems WASM writes the
 * supplied igniters (L:A32NX_ENGINE_n_IGNITERS_SUPPLIED: bit 0 A, bit 1 B, a380_systems fadec_power.rs); it also keeps
 * an unsupplied igniter from lighting the engine. No MSFS SDK dependency: tested natively (test/run_tests.sh).
 */
class IgniterSupply_A380X {
 public:
  static constexpr int IGNITER_A_BIT = 1;
  static constexpr int IGNITER_B_BIT = 2;

  static IgniterSelection_A380X::Igniters energized(IgniterSelection_A380X::Igniters selected, int suppliedBits) {
    return {selected.a && (suppliedBits & IGNITER_A_BIT) != 0, selected.b && (suppliedBits & IGNITER_B_BIT) != 0};
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_IGNITERSUPPLY_A380X_HPP
