#pragma once

// The DOx derated takeoff on the FADEC models of the flight computers. Pure function, no MSFS SDK: tested natively with the
// generated A380FadecComputer model by test/takeoff_derate_test.cpp (test/run_tests.sh).
//
// - DOx derated takeoff: six levels, D04 to D24, reduce the maximum takeoff thrust by 4 % up to 24 %.
// - A derated takeoff is made at the FLX-MCT detent, as a FLEX takeoff.
// - A derated takeoff and a FLEX takeoff cannot be combined: a derate level and a FLEX temperature are never selected
//   together.
//
// The FADEC model (A380FadecComputer) has one reduced takeoff rating: its FLX limit at the FLX-MCT detent, used on the ground
// when it has a valid FLEX TEMP above the TAT (data_computed.is_FLX_active), latched for the flight until the levers leave the
// detent. The FADEC module (fadec_a380x TakeoffDerate_A380X.hpp) writes the derated rating as that FLX limit when the MFD
// selects a derate (L:A32NX_AIRLINER_TO_DERATE) without FLEX TEMP. For the derate the model is given a valid takeoff
// temperature word above any TAT, so that it uses that FLX limit.

namespace TakeoffDerate {

/// The ARINC 429 sign status matrix of a valid word (SignStatusMatrix::NormalOperation)
constexpr unsigned int SSM_NORMAL_OPERATION = 3U;

/// Design choice: the takeoff temperature word of a derated takeoff, above any TAT on the ground. It only selects the FLX path
/// of the FADEC model: the derated N1 comes from the FLX limit of the FADEC module.
constexpr float DERATED_TAKEOFF_TEMPERATURE_DEG_C = 99.0f;

/// The FLEX TEMP word the FADEC model gets from a PRIM: the PRIM word, or for a derated takeoff (thrust reduction above 0,
/// without valid FLEX TEMP) a valid word above any TAT.
template <typename Arinc429Word>
inline Arinc429Word takeoffTemperatureWord(const Arinc429Word& primFlexWord, double derateThrustReductionPercent) {
  const bool flexTemperatureEntered = primFlexWord.SSM == SSM_NORMAL_OPERATION && primFlexWord.Data != 0;
  if (derateThrustReductionPercent <= 0.0 || flexTemperatureEntered) {
    return primFlexWord;
  }
  Arinc429Word derated = primFlexWord;
  derated.SSM = SSM_NORMAL_OPERATION;
  derated.Data = DERATED_TAKEOFF_TEMPERATURE_DEG_C;
  return derated;
}

}  // namespace TakeoffDerate
