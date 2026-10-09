// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A32NX_HPP

/**
 * @brief What the FADEC engine model does with the fan blocked failure (flyPad ATA 72 "Engine 1(2) fan blocked (no N1 rotation
 * at start)", systems WASM a320_systems engine_failure.rs: L:A32NX_ENGINE_n_FAN_BLOCKED).
 *
 * A320 FCOM PRO-ABN-ENG ENG 1(2) LOW N1 (ON GROUND), a320_fcom.txt l.80343-80363 (2019 FCOM PDF page 2277): "This alert
 * triggers when N1 rotation is failed during start." / "No N1 rotation during start." / "IF CONFIRMED: THR LEVER (AFFECTED)
 * ... IDLE, ENG MASTER (AFFECTED) ... OFF".
 *
 * - The N1 of a start on the ground stays at 0: the fan does not turn while the starter turns the core (N2).
 * - Design choice, no FCOM value: the core hangs below idle like a hung start. On the CFM56 / LEAP the booster (LP
 *   compressor) is on the fan shaft: with the fan blocked, the booster does not feed the HP compressor and the core cannot
 *   accelerate to idle. The start therefore never ends with the fan blocked. The FADEC protections (DSC-70-80-40,
 *   a320_fcom.txt l.63596-63606: hot start, hung start, stall, no light up) do not include the missing N1 rotation, so the
 *   FADEC does not react to the N1 itself; the systems WASM may later detect the hung core (start fault) and abort an
 *   automatic start, as for a hung start.
 * - Only on the ground: in flight the fan windmills with the airspeed (the FCOM alert is "ON GROUND"). A running engine is
 *   not affected (a turning fan does not block; that would be a seizure): the failure acts on the next start.
 *
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 */
namespace FanBlockedStart_A32NX {

/// The fan blocked failure acts on this engine: the failure is active and the aircraft is on the ground.
inline bool isFanBlocked(bool fanBlockedFailure, bool onGround) {
  return fanBlockedFailure && onGround;
}

/// The N1 the FADEC shows during a start or a shutdown on the ground: 0 with the fan blocked.
inline double fanN1(double n1, bool fanBlocked) {
  return fanBlocked ? 0.0 : n1;
}

/// The core hangs below idle (StartSequence_A32NX::hungStartN2 and startReachesIdle): a hung start or a stall of the start
/// sequence, or the fan blocked.
inline bool coreHangsBelowIdle(bool startN2Hang, bool fanBlocked) {
  return startN2Hang || fanBlocked;
}

}  // namespace FanBlockedStart_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_FANBLOCKEDSTART_A32NX_HPP
