#include "Fmgc.h"
#include "../Arinc429.h"
#include "../Arinc429Utils.h"

Fmgc::Fmgc(bool isUnit1) : isUnit1(isUnit1) {
  fmgcComputer.initialize();
}

Fmgc::Fmgc(const Fmgc& obj) : isUnit1(obj.isUnit1) {
  fmgcComputer.initialize();
}

// If the power supply is valid and we are on the ground, perform the self-test-sequence.
// Else, skip the self-test.
void Fmgc::initSelfTests() {
  if (powerSupplyMonitor.hasFault())
    return;

  clearMemory();
  if (modelInputs.in.discrete_inputs.nose_gear_pressed_opp && modelInputs.in.discrete_inputs.nose_gear_pressed_own) {
    selfTestTimer = selfTestDuration;
  }
}

// After the self-test is complete, erase all data in RAM.
void Fmgc::clearMemory() {}

// Main update cycle. Surface position through parameters here is temporary.
void Fmgc::update(double deltaTime, double simulationTime, bool faultActive, bool isPowered) {
  monitorPowerSupply(deltaTime, isPowered);

  updateSelfTest(deltaTime);
  monitorSelf(faultActive);

  modelInputs.in.sim_data.computer_running = monitoringHealthy;
  if (monitorLandingSystemSignal(deltaTime).disengage) {
    // The signal loss acts on a copy, so that the FCU and ELAC words the interface wrote stay as they were
    auto inputsToModel = modelInputs;
    disengageAutopilotAndFlightDirectors(inputsToModel);
    fmgcComputer.setExternalInputs(&inputsToModel);
  } else {
    fmgcComputer.setExternalInputs(&modelInputs);
  }
  fmgcComputer.step();
  modelOutputs = fmgcComputer.getExternalOutputs().out;
}

// The mode flags are those of the previous frame, as the model's own delays are
LandingSystemSignalLoss::Output Fmgc::monitorLandingSystemSignal(double deltaTime) {
  const auto& logic = fmgcComputer.getExternalOutputs().out.ap_fd_logic;
  const auto& buses = modelInputs.in.bus_inputs;

  LandingSystemSignalLoss::Inputs inputs;
  inputs.localizerModeEngaged = logic.lateral_modes.loc_cpt_active || logic.lateral_modes.loc_trk_active || logic.lateral_modes.land_active;
  inputs.localizerModeArmedOrEngaged = inputs.localizerModeEngaged || logic.armed_modes.loc_armed;
  inputs.glideSlopeModeEngaged = logic.longitudinal_modes.gs_capt_active || logic.longitudinal_modes.gs_trk_active;
  const auto isNormal = [](const base_arinc_429& word) { return word.SSM == LandingSystemSignalLoss::SSM_NORMAL_OPERATION; };
  const auto& radioHeight = isNormal(buses.ra_own_bus.radio_height_ft) ? buses.ra_own_bus.radio_height_ft : buses.ra_opp_bus.radio_height_ft;
  inputs.radioHeightValid = isNormal(radioHeight);
  inputs.radioHeightFt = radioHeight.Data;
  inputs.signal = LandingSystemSignalLoss::flownSignal(buses.ils_own_bus, buses.ils_opp_bus);

  // Design choice: no A320 rule disengages at once when both receivers are lost, so that is a lost signal like any other. The FLS
  // is covered as well, the model would otherwise fly a deviation of zero there too. A radio height without computed data counts as
  // invalid here, so the rule waits for the model's own radio altimeter handling.
  LandingSystemSignalLoss::Rules rules;
  rules.glideSlopeLossDisengages = true;
  return landingSystemSignalLoss.update(deltaTime, inputs, rules);
}

// Both ELAC autopilot disconnect inputs end the autopilot, and the FD off bits of the FCU word end the flight directors. When the
// pulse is over the FDs engage again by themselves, in the basic modes, as when the crew presses the FD pushbuttons twice.
void Fmgc::disengageAutopilotAndFlightDirectors(FmgcComputer::ExternalInputs_FmgcComputer_T& inputs) {
  constexpr int FD_1_OFF_BIT = 26;
  constexpr int FD_2_OFF_BIT = 27;
  inputs.in.discrete_inputs.elac_own_ap_disc = true;
  inputs.in.discrete_inputs.elac_opp_ap_disc = true;
  Arinc429Utils::setBit(inputs.in.bus_inputs.fcu_bus.fcu_discrete_word_2, FD_1_OFF_BIT, true);
  Arinc429Utils::setBit(inputs.in.bus_inputs.fcu_bus.fcu_discrete_word_2, FD_2_OFF_BIT, true);
}

// Perform self monitoring
void Fmgc::monitorSelf(bool faultActive) {
  if (faultActive || powerSupplyMonitor.hasFault() || !selfTestComplete) {
    monitoringHealthy = false;
  } else {
    monitoringHealthy = true;
  }
}

// Monitor the power supply and record the outage time (used for self test and healthy logic).
// If an outage lasts more than 10ms, stop the program execution.
// If the power has been restored after an outage that lasted longer than 10ms, reset the RAM and
// perform the startup sequence.
void Fmgc::monitorPowerSupply(double deltaTime, bool isPowered) {
  if (powerSupplyMonitor.update(deltaTime, isPowered)) {
    initSelfTests();
    powerSupplyMonitor.acknowledgeRecovery();
  }
}

// Update the Self-test-Sequence
void Fmgc::updateSelfTest(double deltaTime) {
  if (selfTestTimer > 0) {
    selfTestTimer -= deltaTime;
  }
  if (selfTestTimer <= 0) {
    selfTestComplete = true;
    selfTestApEngagedDiscreteOn = false;
  } else {
    selfTestComplete = false;

    // Hardcoded test light sequence. Between the times (in seconds) in each array, the light is on.
    selfTestApEngagedDiscreteOn = false;
    // FIXME no references available, best guess
    double constexpr testApDiscreteOnTimes[][2] = {{24.7, 25.18}, {25.23, 25.35}, {25.46, 25.55}, {25.62, 25.75}, {25.8, 25.95}};
    for (auto& timeRange : testApDiscreteOnTimes) {
      double selfTestTimerFromStart = selfTestDuration - selfTestTimer;
      if (selfTestTimerFromStart >= timeRange[0] && selfTestTimerFromStart <= timeRange[1]) {
        selfTestApEngagedDiscreteOn = true;
        break;
      }
    }
    selfTestAthrEngagedDiscreteOn = false;
    // FIXME no references available, best guess
    double constexpr testAthrDiscreteOnTimes[][2] = {{26.16, 26.6}, {26.7, 26.85}, {26.96, 27.05}, {27.11, 27.22}, {27.32, 27.72}};
    for (auto& timeRange : testAthrDiscreteOnTimes) {
      double selfTestTimerFromStart = selfTestDuration - selfTestTimer;
      if (selfTestTimerFromStart >= timeRange[0] && selfTestTimerFromStart <= timeRange[1]) {
        selfTestAthrEngagedDiscreteOn = true;
        break;
      }
    }
    selfTestDigitalOutValid = false;
    // FIXME no references available, best guess
    double constexpr testDigitalOutValidTimes[][2] = {{25.23, 28.2}, {29.35, 29.75}};
    for (auto& timeRange : testDigitalOutValidTimes) {
      double selfTestTimerFromStart = selfTestDuration - selfTestTimer;
      if (selfTestTimerFromStart >= timeRange[0] && selfTestTimerFromStart <= timeRange[1]) {
        selfTestDigitalOutValid = true;
        break;
      }
    }
  }
}

// Write the discrete output data and return it.
base_fmgc_discrete_outputs Fmgc::getDiscreteOutputs() {
  base_fmgc_discrete_outputs output = {};

  output.fmgc_healthy = monitoringHealthy;

  if (!monitoringHealthy) {
    output.athr_own_engaged = !selfTestComplete && selfTestAthrEngagedDiscreteOn;
    output.fd_own_engaged = false;
    output.ap_own_engaged = !selfTestComplete && selfTestApEngagedDiscreteOn;
    output.fcu_own_fail = false;
    output.ils_test_inhibit = false;
    output.stick_rudder_lock = false;
  } else {
    output = modelOutputs.discrete_outputs;
  }

  return output;
}

base_fmgc_bus_outputs Fmgc::getBusOutputs() {
  base_fmgc_bus_outputs output = {};

  if (!monitoringHealthy) {
    output.fmgc_a_bus.discrete_word_5.SSM = selfTestDigitalOutValid ? Arinc429SignStatus::FunctionalTest : FailureWarning;
    return output;
  }

  output = modelOutputs.bus_outputs;

  return output;
}

const fmgc_outputs& Fmgc::getDebugOutputs() const {
  return fmgcComputer.getExternalOutputs().out;
}
