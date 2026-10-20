#pragma once

enum class Failures {
  Fac1 = 22000,
  Fac2 = 22001,
  Fmgc1 = 22002,
  Fmgc2 = 22003,
  Fcu1 = 22004,
  Fcu2 = 22005,
  YawDamperActuator1 = 22006,
  YawDamperActuator2 = 22007,
  RudderTrimActuator1 = 22008,
  RudderTrimActuator2 = 22009,
  RudderTravelLimiterActuator1 = 22010,
  RudderTravelLimiterActuator2 = 22011,
  // The FG TCAS mode of both FMGCs (AUTO FLT TCAS MODE FAULT), see fmgc/FmgcTcasBusInput.h
  TcasMode = 22012,
  Elac1 = 27000,
  Elac2 = 27001,
  Sec1 = 27002,
  Sec2 = 27003,
  Sec3 = 27004,
  Fcdc1 = 27005,
  Fcdc2 = 27006,
  // The flight control failures of the ELAC and SEC inputs, see failures/FlightControlFailureInputs.h
  CaptSidestick = 27019,
  FoSidestick = 27020,
  SidestickPriorityLogic = 27021,
  // The electrical control of the THS (its electric motors): the ELACs and SECs see a THS motor fault
  StabilizerElecControl = 27022,
};
