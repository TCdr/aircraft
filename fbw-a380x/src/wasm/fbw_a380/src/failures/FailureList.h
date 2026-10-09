#pragma once

enum class Failures {
  Rollout = 22001,
  Fcu1 = 22002,
  Fcu2 = 22003,
  Prim1 = 27000,
  Prim2 = 27001,
  Prim3 = 27002,
  Sec1 = 27003,
  Sec2 = 27004,
  Sec3 = 27005,
  Fcdc1 = 27006,
  Fcdc2 = 27007,
  // ATA 73: the FADEC of engine n computes a maximum thrust too low (ENG n THRUST LOSS, see FadecThrustFailures.h)
  Eng1MaxThrustMiscalculated = 73050,
  Eng2MaxThrustMiscalculated = 73051,
  Eng3MaxThrustMiscalculated = 73052,
  Eng4MaxThrustMiscalculated = 73053,
  // ATA 73: FADEC n does not receive the FLEX TEMP of the PRIMs (ENG T.O THRUST DISAGREE, see FadecThrustFailures.h)
  Fadec1FlexTempNotReceived = 73060,
  Fadec2FlexTempNotReceived = 73061,
  Fadec3FlexTempNotReceived = 73062,
  Fadec4FlexTempNotReceived = 73063,
};
