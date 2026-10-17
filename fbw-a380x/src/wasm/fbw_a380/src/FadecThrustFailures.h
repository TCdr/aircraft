#pragma once

// The A380X FADEC failures that make ENG 1(2)(3)(4) THRUST LOSS and ENG T.O THRUST DISAGREE possible. Pure functions, no MSFS
// SDK: tested natively with the generated A380FadecComputer model by test/fadec_thrust_failures_test.cpp (test/run_tests.sh).
//
// The four FADECs of the A380X are the four A380FadecComputer models that FlyByWireInterface::updateFadec steps. Each one
// turns its thrust lever angle into the N1 command of its engine with the thrust rating limits (shared L:vars of the FADEC
// module fadec_a380x) and the FLEX TEMP of the PRIMs. The two flyPad failures below act on the inputs of one FADEC model.

namespace FadecThrustFailures {

// ------------------------------------------------------------------------------------------------------------------------
// ENG 1(2)(3)(4) THRUST LOSS, flyPad ATA 73 "Engine 1(2)(3)(4) max thrust miscalculated (thrust loss)"
//
// ENG THRUST LOSS: the FADEC detects a loss of thrust when the maximum THR of its engine is 10 % lower than that of at least two
// other engines, after an erroneous but valid calculation of the THR parameter; the procedure sets the thrust lever to IDLE
// and the ENG MASTER OFF. 100 % THR is the engine thrust at the TOGA detent.
//
// The failure: the FADEC of the engine computes a maximum thrust lower than the real one. Its rating limits (CLB, MCT, FLEX,
// TOGA) are scaled down above idle, so the engine gives that much less thrust in every detent.
// ------------------------------------------------------------------------------------------------------------------------

/// Design choice: the faulty FADEC computes a maximum thrust 15 % lower than the real one (between idle and TOGA), above the
/// 10 % that the FADEC detects.
constexpr double MISCALCULATED_MAX_THRUST_RATIO = 0.85;

/// A thrust rating limit (percent N1) of the FADEC: scaled down above idle by the max thrust miscalculation. A limit at or below
/// idle (a FLEX limit of 0 without FLEX TEMP) stays as it is.
inline double ratingLimit(double limitN1, double idleN1, bool maxThrustMiscalculated) {
  if (!maxThrustMiscalculated || limitN1 <= idleN1) {
    return limitN1;
  }
  return idleN1 + MISCALCULATED_MAX_THRUST_RATIO * (limitN1 - idleN1);
}

/// The maximum THR of the engine (percent), as the E/WD THR gauge scales the N1 (EWD ThrustGauge: linear from the idle N1 to the
/// TOGA N1 of the healthy FADECs): 100 for a healthy FADEC. Without valid limits (TOGA at or below idle, FADEC module not
/// started yet) the FADEC sends 100: nothing to compare.
inline double maxThrPercent(double fadecTogaN1, double healthyTogaN1, double idleN1) {
  if (healthyTogaN1 <= idleN1) {
    return 100.0;
  }
  return 100.0 * (fadecTogaN1 - idleN1) / (healthyTogaN1 - idleN1);
}

// ------------------------------------------------------------------------------------------------------------------------
// ENG T.O THRUST DISAGREE, flyPad ATA 73 "FADEC 1(2)(3)(4) FLEX TEMP not received"
//
// ENG T.O THRUST DISAGREE (crew awareness): the FADECs do not all have the same takeoff mode, derate, flex or TOGA. The
// takeoff thrust selected on the T.O panel of the FMS PERF page (TOGA, FLEX or DERATED) gives the thrust rating mode T.O, FLEX
// or DOx.
//
// The failure: the FLEX TEMP of the PRIMs (label flx_to_temp_deg_c of the PRIM FG bus) does not reach one FADEC. That FADEC has
// no valid FLEX TEMP and its take-off mode is TOGA, while the others are in FLEX: its engine gives the thrust of its own mode
// (the MCT thrust in the FLX/MCT detent, TOGA in the TOGA detent), as the FADEC model computes it. FBW has no derated
// take-off: the modes are TOGA and FLEX.
// ------------------------------------------------------------------------------------------------------------------------

/// The ARINC 429 sign status matrix of a word without computed data (SignStatusMatrix::NoComputedData)
constexpr unsigned int SSM_NO_COMPUTED_DATA = 1U;

/// The FLEX TEMP word a FADEC receives from a PRIM: the PRIM word, or a word without computed data when the FADEC does not
/// receive the take-off data.
template <typename Arinc429Word>
inline Arinc429Word flexTemperatureReceived(const Arinc429Word& primWord, bool flexTemperatureNotReceived) {
  if (!flexTemperatureNotReceived) {
    return primWord;
  }
  Arinc429Word noData = primWord;
  noData.SSM = SSM_NO_COMPUTED_DATA;
  noData.Data = 0;
  return noData;
}

/// L:A32NX_ENGINE_n_FADEC_TAKEOFF_MODE: the take-off mode of the FADEC
enum TakeoffMode { TOGA = 0, FLEX = 1 };

/// The take-off mode of a FADEC: FLEX when its model uses the FLEX limit (data_computed.is_FLX_active: a valid FLEX TEMP above
/// the TAT on the ground), TOGA otherwise.
inline TakeoffMode takeoffMode(bool isFlexActive) {
  return isFlexActive ? FLEX : TOGA;
}

}  // namespace FadecThrustFailures
