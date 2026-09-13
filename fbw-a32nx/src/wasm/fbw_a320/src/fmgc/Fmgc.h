#pragma once
#include "../model/FmgcComputer.h"
#include "../utils/PowerSupplyMonitor.h"

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

  // Model
  FmgcComputer fmgcComputer;
  fmgc_outputs modelOutputs;

  // Computer Self-monitoring vars
  bool monitoringHealthy = false;

  bool selfTestApEngagedDiscreteOn = false;

  bool selfTestAthrEngagedDiscreteOn = false;

  bool selfTestDigitalOutValid = false;

  bool cpuStopped = false;

  // Selftest vars
  double selfTestTimer = 0;

  bool selfTestComplete = false;

  // Constants
  const bool isUnit1;

  const double minimumPowerOutageTimeForFailure = 0.02;
  const double selfTestDuration = 30;

  // Power Supply monitoring
  PowerSupplyMonitor powerSupplyMonitor{minimumPowerOutageTimeForFailure};
};
