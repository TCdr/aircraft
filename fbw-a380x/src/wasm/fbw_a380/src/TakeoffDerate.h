#pragma once

// The DOx derated takeoff on the FADEC models of the flight computers. Pure function, no MSFS SDK: tested natively with the
// generated A380FadecComputer model by test/takeoff_derate_test.cpp (test/run_tests.sh).
//
// A380 FCOM (a380_fcom.txt):
// - DSC-70-20-40 THRUST RATING LIMIT (l.111561-111568): "DOx : Derated takeoff mode. The DOx mode reduces the maximum thrust at
//   takeoff. 6 derated takeoff levels are defined: DO4 , DO8 , D12 , D16 , D20 , D24 . Each level reduces the maximum thrust
//   from 4 % up to 24 %."
// - DSC-22-FG-50-30 (l.11406-11408, l.11443-11446): a derated takeoff is made at the FLX-MCT detent, as a FLEX takeoff ("MAN
//   DTO ... DERATED has been selected on the T.O panel of the FMS PERF page - The most forward thrust lever is on the FLX-MCT
//   detent").
// - PER-TOF-THR-DRT REQUIREMENTS (l.200751-200754): "It is not permitted to combine a Derated Takeoff and a FLEX Takeoff ...
//   This prevents the simultaneous selection of both a derate level and a TFLEX".
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
