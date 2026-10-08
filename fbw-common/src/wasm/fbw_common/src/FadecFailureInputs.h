#pragma once

// The inputs of the FADEC model of the flight computers (FadecComputer) under the FADEC, thrust lever and thrust
// reverser failures (engine failures stages A5 and B5). Pure functions, no MSFS SDK: tested natively by
// fbw-common/src/wasm/fbw_common/test/run_tests.sh.
//
// systems.wasm (Rust, a320_systems / a380_systems engine_control_failure.rs) computes the thrust lever angle each
// FADEC uses: the lever, or the angle of a FADEC protection (reverse idle until the reverser is deployed, idle with an
// unlocked reverser) or of a thrust lever failure (CLB or idle selected by the FADEC). It writes
// L:A32NX_ENGINE_n_FADEC_TLA_OVERRIDE_ACTIVE and L:A32NX_ENGINE_n_FADEC_TLA_OVERRIDE.

namespace FadecFailureInputs {

/// The thrust lever angle the FADEC model uses. While no override is active (or systems.wasm has not written the
/// variables yet: they read 0), the FADEC uses the lever as before.
inline double fadecModelThrustLeverAngle(double leverTlaDeg, double overrideActive, double overrideTlaDeg) {
  return overrideActive > 0.5 ? overrideTlaDeg : leverTlaDeg;
}

/// The A/THR orders a FADEC receives: the bus of the A/THR computer (FCU on the A320, PRIMs on the A380), or a dead bus
/// (every word zero: Failure Warning, no data) when the FADEC is lost (A320 ENG FADEC FAULT, both channels) or cannot
/// communicate via the avionics networks (A380 ENG FADEC FAULT). The FADEC then controls its engine from the thrust
/// lever only: the A/THR loses that engine.
template <typename Bus>
inline Bus autothrustOrdersReceived(const Bus& autothrustBus, bool fadecLinkLost) {
  return fadecLinkLost ? Bus{} : autothrustBus;
}

}  // namespace FadecFailureInputs
