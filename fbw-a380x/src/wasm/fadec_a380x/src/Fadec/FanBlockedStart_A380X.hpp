// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A380X_HPP

/**
 * @brief The N1 the FADEC shows with the N1 rotor jammed (flyPad ATA 72 "Engine n N1 rotor jammed", systems WASM a380_systems
 * engine_failure.rs: L:A32NX_ENGINE_n_FAN_BLOCKED).
 *
 * The fan does not turn while the starter turns the core, so the N1 of a start on the ground stays at 0. The start sequence of the
 * systems WASM detects the missing N1 rotation and aborts the start (ENG n START FAULT LOW N1). A running engine is not affected
 * (a turning fan does not jam; that would be a seizure) and in flight the fan windmills with the airspeed: the failure acts on
 * the next start on the ground.
 *
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 */
namespace FanBlockedStart_A380X {

/// The N1 rotor jam acts on this engine: the failure is active and the aircraft is on the ground.
inline bool isFanBlocked(bool fanBlockedFailure, bool onGround) {
  return fanBlockedFailure && onGround;
}

/// The N1 the FADEC shows during a start or a shutdown on the ground: 0 with the N1 rotor jammed.
inline double fanN1(double n1, bool fanBlocked) {
  return fanBlocked ? 0.0 : n1;
}

}  // namespace FanBlockedStart_A380X

#endif  // FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A380X_HPP
