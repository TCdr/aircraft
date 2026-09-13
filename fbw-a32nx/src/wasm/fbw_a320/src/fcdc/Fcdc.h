#pragma once

#include "FcdcIO.h"

const double LIGHT_FLASHING_PERIOD = 0.25;

class Fcdc {
 public:
  Fcdc(bool isUnit1);

  void update(double deltaTime, bool faultActive, bool isPowered);

  FcdcBus getBusOutputs();

  FcdcDiscreteOutputs getDiscreteOutputs();

  FcdcDiscreteInputs discreteInputs;

  FcdcBusInputs busInputs;

 private:
  void startup();

  void monitorPowerSupply(double deltaTime, bool isPowered);

  void monitorSelf(bool faultActive);

  void updateSelfTest(double deltaTime);

  void computeActiveSystemLaws();

  void consolidatePositionData();

  PitchLaw getPitchLawStatusFromBits(bool bit1, bool bit2, bool bit3);

  LateralLaw getLateralLawStatusFromBits(bool bit1, bool bit2, bool bit3);

  void computeComputerEngagements();

  void computeSidestickPriorityLights(double deltaTime);

  // Computer axis engagement vars
  bool elac1EngagedInRoll = false;

  bool elac2EngagedInRoll = false;

  bool sec1EngagedInRoll = false;

  bool sec2EngagedInRoll = false;

  bool sec3EngagedInRoll = false;

  bool elac1EngagedInPitch = false;

  bool elac2EngagedInPitch = false;

  bool sec1EngagedInPitch = false;

  bool sec2EngagedInPitch = false;

  // Data concentration and computation vars

  PitchLaw systemPitchLaw = PitchLaw::None;

  LateralLaw systemLateralLaw = LateralLaw::None;

  double leftAileronPos = 0;

  bool leftAileronPosValid = false;

  double rightAileronPos = 0;

  bool rightAileronPosValid = false;

  double leftElevatorPos = 0;

  bool leftElevatorPosValid = false;

  double rightElevatorPos = 0;

  bool rightElevatorPosValid = false;

  double thsPos = 0;

  bool thsPosValid = false;

  double rollSidestickPosCapt = 0;

  bool rollSidestickPosCaptValid = false;

  double rollSidestickPosFo = 0;

  bool rollSidestickPosFoValid = false;

  double pitchSidestickPosCapt = 0;

  bool pitchSidestickPosCaptValid = false;

  double pitchSidestickPosFo = 0;

  bool pitchSidestickPosFoValid = false;

  double rudderPedalPos = 0;

  bool rudderPedalPosValid = false;

  // Sidestick priority vars
  bool leftSidestickDisabled = false;

  bool rightSidestickDisabled = false;

  bool leftSidestickPriorityLocked = false;

  bool rightSidestickPriorityLocked = false;

  bool leftRedPriorityLightOn = false;

  bool rightRedPriorityLightOn = false;

  bool leftGreenPriorityLightOn = false;

  bool rightGreenPriorityLightOn = false;

  double priorityLightFlashingClock = 0;

  // Computer monitoring and self-test vars

  bool monitoringHealthy = false;

  double powerSupplyOutageTime = 0;

  bool powerSupplyFault = false;

  double selfTestTimer = 0;

  bool selfTestComplete = false;

  const bool isUnit1;

  const double minimumPowerOutageTimeForFailure = 0.01;
};
