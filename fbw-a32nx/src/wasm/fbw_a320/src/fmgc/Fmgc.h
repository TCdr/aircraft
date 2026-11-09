#pragma once
#include "../model/FmgcComputer.h"
#include "LandingSystemSignalLoss.h"

class Fmgc {
 public:
  Fmgc(bool isUnit1);

  Fmgc(const Fmgc&);

  void update(double deltaTime, double simulationTime, bool faultActive, bool isPowered);

  base_fmgc_bus_outputs getBusOutputs();

  base_fmgc_discrete_outputs getDiscreteOutputs();

  const fmgc_outputs& getDebugOutputs() const;

  FmgcComputer::ExternalInputs_FmgcComputer_T modelInputs = {};

 private:
  void initSelfTests();

  void clearMemory();

  void monitorPowerSupply(double deltaTime, bool isPowered);

  void monitorSelf(bool faultActive);

  void updateSelfTest(double deltaTime);

  LandingSystemSignalLoss::Output monitorLandingSystemSignal(double deltaTime);

  static void disengageAutopilotAndFlightDirectors(FmgcComputer::ExternalInputs_FmgcComputer_T& inputs);

  // Model
  FmgcComputer fmgcComputer;
  fmgc_outputs modelOutputs;
  LandingSystemSignalLoss::Monitor landingSystemSignalLoss;

  // Computer Self-monitoring vars
  bool monitoringHealthy;

  bool selfTestApEngagedDiscreteOn;

  bool selfTestAthrEngagedDiscreteOn;

  bool selfTestDigitalOutValid;

  bool cpuStopped;

  // Power Supply monitoring
  double powerSupplyOutageTime;

  bool powerSupplyFault;

  // Selftest vars
  double selfTestTimer;

  bool selfTestComplete;

  // Constants
  const bool isUnit1;

  const double minimumPowerOutageTimeForFailure = 0.02;
  const double selfTestDuration = 30;
};
