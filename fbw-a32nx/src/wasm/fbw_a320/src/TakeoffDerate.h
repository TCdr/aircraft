#pragma once

// The derated takeoff (D04 to D32) on the FADEC model of the flight computers. Pure function, no MSFS SDK: tested natively with
// the generated FadecComputer model by test/takeoff_derate_test.cpp (test/run_tests.sh).
//
// - A derated takeoff is made at the FLX-MCT detent, as a FLEX takeoff.
// - A derated takeoff and a FLEX takeoff cannot be combined: a derate level and a FLEX temperature are never selected
//   together (FCOM LIM-ENG: FLEX takeoff is not permitted in association with derated takeoff).
//
// The FADEC model (FadecComputer) has one reduced takeoff rating: its FLX limit at the FLX-MCT detent, used on the ground when
// it has a valid FLEX TEMP above the TAT (data_computed.is_FLX_active), latched for the flight until the levers leave the
// detent. The FADEC module (fadec_a32nx ThrustDerate_A32NX.hpp) writes the derated rating as that FLX limit when the MCDU
// selects a derate (L:A32NX_AIRLINER_TO_DERATE) without FLEX TEMP. For the derate the model is given a valid takeoff
// temperature word above any TAT, so that it uses that FLX limit.

namespace TakeoffDerate {

/// The ARINC 429 sign status matrix of a valid word (SignStatusMatrix::NormalOperation)
constexpr unsigned int SSM_NORMAL_OPERATION = 3U;

/// Design choice: the takeoff temperature word of a derated takeoff, above any TAT on the ground. It only selects the FLX path
/// of the FADEC model: the derated N1 comes from the FLX limit of the FADEC module.
constexpr float DERATED_TAKEOFF_TEMPERATURE_DEG_C = 99.0f;

/// The FLEX TEMP word the FADEC model gets from the FCU: the FCU word, or for a derated takeoff (thrust reduction above 0, without
/// valid FLEX TEMP) a valid word above any TAT.
template <typename Arinc429Word>
inline Arinc429Word takeoffTemperatureWord(const Arinc429Word& fcuFlexWord, double derateThrustReductionPercent) {
  const bool flexTemperatureEntered = fcuFlexWord.SSM == SSM_NORMAL_OPERATION && fcuFlexWord.Data != 0;
  if (derateThrustReductionPercent <= 0.0 || flexTemperatureEntered) {
    return fcuFlexWord;
  }
  Arinc429Word derated = fcuFlexWord;
  derated.SSM = SSM_NORMAL_OPERATION;
  derated.Data = DERATED_TAKEOFF_TEMPERATURE_DEG_C;
  return derated;
}

}  // namespace TakeoffDerate
