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

/// The thrust lever bands of the THRUST LOCK of the generated FADEC models (A380FadecComputer, FadecComputer): CL detent
/// 24-26 deg, MCT detent 34-36 deg.
constexpr double THRUST_LOCK_CL_BAND_LOW_DEG = 24.0;
constexpr double THRUST_LOCK_CL_BAND_HIGH_DEG = 26.0;
constexpr double THRUST_LOCK_MCT_BAND_LOW_DEG = 34.0;
constexpr double THRUST_LOCK_MCT_BAND_HIGH_DEG = 36.0;
/// How far below a band the angle of the frame without lock is (degrees): the thrust of that one frame stays about the same.
constexpr double THRUST_LOCK_FREE_MARGIN_DEG = 0.01;

/// The thrust lever angle the FADEC model uses on the frame its A/THR orders are cut by a lost link (A380 ENG FADEC FAULT).
///
/// The FADEC model has the THRUST LOCK function. On the frame its A/THR control goes from active to inactive with the lever
/// in a band above, it freezes the N1 target at the N1 of that moment, until the lever leaves the band. Its reset wins: on a
/// frame with the lever outside the bands it never latches.
///
/// The A380 ENG FADEC FAULT does not disconnect the A/THR. The A/THR only loses that engine ("ENG 1(2)(3)(4) A/THR" INOP SYS)
/// and the engine follows its lever: FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) FADEC FAULT, "THR LEVER .... MAN ADJUST". The
/// THRUST LOCK follows an A/THR involuntary disconnection (FCOM DSC-22-FG-50-40), so it does not apply here. Without this,
/// the engine stayed at the N1 of the failure (sim test 2026-10-06, levers in CL).
///
/// So on that one frame (the link is lost and the A/THR still controlled the engine on the previous frame), the model gets an
/// angle just below the band. The latch does not set. From the next frame on, the model gets the lever again and sets the
/// lever thrust: CLB in the CL detent, MCT in the MCT detent. The angle is below the band, not above it, so that the thrust
/// limit type of that frame stays the same (CLB in the CL band, MCT or FLX in the MCT band).
///
/// Not for the A32NX: there the loss of a FADEC disconnects the whole A/THR (A320 FCOM DSC-22_30-90 A/THR arming condition
/// "Two FADECs operative"), and the THRUST LOCK is the A320 FCOM behaviour ("The A/THR disconnects due to a failure").
inline double thrustLeverAngleWithoutThrustLock(double tlaDeg, bool autothrustOrdersLost, bool athrControlActiveLastFrame) {
  if (!autothrustOrdersLost || !athrControlActiveLastFrame) {
    return tlaDeg;
  }
  if (tlaDeg >= THRUST_LOCK_CL_BAND_LOW_DEG && tlaDeg <= THRUST_LOCK_CL_BAND_HIGH_DEG) {
    return THRUST_LOCK_CL_BAND_LOW_DEG - THRUST_LOCK_FREE_MARGIN_DEG;
  }
  if (tlaDeg >= THRUST_LOCK_MCT_BAND_LOW_DEG && tlaDeg <= THRUST_LOCK_MCT_BAND_HIGH_DEG) {
    return THRUST_LOCK_MCT_BAND_LOW_DEG - THRUST_LOCK_FREE_MARGIN_DEG;
  }
  return tlaDeg;
}

}  // namespace FadecFailureInputs
