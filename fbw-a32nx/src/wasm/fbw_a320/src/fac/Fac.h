#pragma once

#include "../Arinc429.h"
#include "../model/FacComputer.h"
#include "../utils/PulseNode.h"
#include "../utils/SRFlipFlop.h"
#include "FacIO.h"

class Fac {
 public:
  Fac(bool isUnit1);

  Fac(const Fac&);

  void update(double deltaTime, double simulationTime, bool faultActive, bool isPowered);

  base_fac_bus getBusOutputs();

  base_fac_discrete_outputs getDiscreteOutputs();

  base_fac_analog_outputs getAnalogOutputs();

  FacComputer::ExternalInputs_FacComputer_T modelInputs = {};

 private:
  void initSelfTests();

  void clearMemory();

  void monitorPowerSupply(double deltaTime, bool isPowered);

  void monitorSelf(bool faultActive);

  void updateSelfTest(double deltaTime);

  // Model
  FacComputer facComputer;
  fac_outputs modelOutputs;

  // Computer Self-monitoring vars
  bool facHealthy = false;

  bool selfTestFaultLightVisible = false;

  SRFlipFlop facHealthyFlipFlop = SRFlipFlop(false);

  PulseNode pushbuttonPulse = PulseNode(true);

  // Power Supply monitoring
  double powerSupplyOutageTime = 0;

  bool longPowerFailure = false;

  bool shortPowerFailure = false;

  // Selftest vars
  double selfTestTimer = 0;

  bool selfTestComplete = false;

  // Constants
  const bool isUnit1;

  const double longPowerFailureTime = 0.2;
  const double shortPowerFailureTime = 0.01;
  const double selfTestDuration = 20;
};
