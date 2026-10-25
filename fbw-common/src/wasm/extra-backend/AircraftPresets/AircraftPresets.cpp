// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <fstream>
#include <iostream>
#include <string>

#include <MSFS/MSFS_CommBus.h>

#include <fmt/core.h>

#include "AircraftPresets.h"
#include "SimUnits.h"
#include "UpdateMode.h"
#include "logging.h"
#include "math_utils.hpp"

///
// DataManager Howto Note:
// =======================
//
// The AircraftPresets module uses the DataManager to get and set variables.
// Looking at the make_xxx_var functions, you can see that they are updated
// with different update cycles.
//
// Some variables are read from the sim at every tick:
// - A32NX_LOAD_AIRCRAFT_PRESET
// - SIM ON GROUND
//
// The rest are read on demand after the state of the above variables have been checked.
// No variable is written automatically.
//
// This makes sure variables are only read or written to when really needed. And as
// AircraftPresets will be dormant most of the time, this is saving a lot of
// unnecessary reads/writes.
//
// In addition, the AircraftPresets module is a very specific use case and uses
// SimConnect execute_calculator_code extensively for the procedures to work.
// This is a good demonstration that the Cpp WASM framework does not limit
// applications to a specific pattern.
///

bool AircraftPresets::initialize() {
  dataManager = &msfsHandler.getDataManager();

  // LVARs
  loadAircraftPresetRequest = dataManager->make_named_var("AIRCRAFT_PRESET_LOAD", UNITS.Number, UpdateMode::AUTO_READ_WRITE);
  progressAircraftPreset    = dataManager->make_named_var("AIRCRAFT_PRESET_LOAD_PROGRESS");
  loadAircraftPresetRequest->setAndWriteToSim(0);  // reset to 0 on startup

  aircraftPresetVerbose  = dataManager->make_named_var("AIRCRAFT_PRESET_VERBOSE", UNITS.Bool, UpdateMode::AUTO_READ, 0.250);
  aircraftPresetExpedite = dataManager->make_named_var("AIRCRAFT_PRESET_LOAD_EXPEDITE", UNITS.Bool, UpdateMode::AUTO_READ, 0.250);
  aircraftPresetExpediteDelay =
      dataManager->make_named_var("AIRCRAFT_PRESET_LOAD_EXPEDITE_DELAY", UNITS.Number, UpdateMode::AUTO_READ, 0.250);
  aircraftPresetQuickMode = dataManager->make_named_var("AIRCRAFT_PRESET_QUICK_MODE", UNITS.Bool, UpdateMode::NO_AUTO_UPDATE);
  aircraftPresetQuickMode->setAndWriteToSim(0);  // reset to 0 on startup

  _isInitialized = true;
  LOG_INFO("AircraftPresets initialized");
  return true;
}

bool AircraftPresets::update(sGaugeDrawData* pData) {
  if (!_isInitialized) {
    LOG_ERROR("AircraftPresets::update() - not initialized");
    return false;
  }

  // A flight reload or a systems restart while a preset runs must not leave the quick mode LVAR on: the APU, ADIRS and FADEC would
  // keep starting and stopping instantly
  if (!msfsHandler.getAircraftIsReadyVar()) {
    if (runner.isRunning()) {
      LOG_WARN("AircraftPresets: Aircraft not ready, the running preset is cancelled");
      runner.cancel();
      finishLoading();
    }
    return true;
  }

  const bool loadRequested = loadAircraftPresetRequest->getAsInt64() > 0;

  if (!loadRequested) {
    runner.cancel();
    if (runner.getState() != aircraft_presets::RunnerState::IDLE) {
      finishLoading();
    }
    return true;
  }

  // we do not allow loading of presets in the air to prevent users from
  // accidentally changing the aircraft configuration
  if (!msfsHandler.getSimOnGround()) {
    LOG_WARN("AircraftPresets: Aircraft must be on the ground to load a preset!");
    finishLoading();
    return true;
  }

  if (!runner.isRunning()) {
    const Preset* requestedProcedure = presetProcedures.getProcedure(static_cast<int>(loadAircraftPresetRequest->getAsInt64()));
    if (!requestedProcedure) {
      LOG_WARN(fmt::format("AircraftPresets: Preset {} not found!", loadAircraftPresetRequest->getAsInt64()));
      finishLoading();
      return true;
    }
    startLoading(requestedProcedure);
    return true;
  }

  // Only "0" is allowed to change the request while a preset runs (that is the cancel), anything else is put back
  loadAircraftPresetRequest->setAsInt64(currentProcedureID);

  // Signal other systems to use quick mode via a LVAR. Written every frame as the sim may have reset it.
  aircraftPresetQuickMode->setAndWriteToSim(runner.isExpedited() ? 1 : 0);

  runner.tick(pData->dt * 1000);
  updateProgress();

  if (runner.getState() == aircraft_presets::RunnerState::FINISHED) {
    LOG_INFO(fmt::format("AircraftPresets: Aircraft Preset {} done!", currentProcedureID));
    finishLoading();
  } else if (runner.getState() == aircraft_presets::RunnerState::ABORTED) {
    LOG_ERROR(fmt::format("AircraftPresets: Aircraft Preset {} aborted: {}", currentProcedureID, runner.getAbortReason()));
    finishLoading();
  }

  return true;
}

bool AircraftPresets::shutdown() {
  _isInitialized = false;
  std::cout << "AircraftPresets::shutdown()" << std::endl;
  return true;
}

// ==============================================================================
// Private methods
// ==============================================================================

bool AircraftPresets::CalculatorCodeEnvironment::evaluate(const std::string& code) {
  FLOAT64 value = 0.0;
  if (verboseVar && verboseVar->getAsBool()) {
    fmt::print("AircraftPresets: Test: [{}]\n", code);
  }
  execute_calculator_code(code.c_str(), &value, nullptr, nullptr);
  return !helper::Math::almostEqual(0.0, value);
}

void AircraftPresets::CalculatorCodeEnvironment::execute(const std::string& code) {
  if (verboseVar && verboseVar->getAsBool()) {
    fmt::print("AircraftPresets: Action: [{}]\n", code);
  }
  execute_calculator_code(code.c_str(), nullptr, nullptr, nullptr);
}

void AircraftPresets::logRunnerMessage(const std::string& message) {
  LOG_WARN(fmt::format("AircraftPresets: {}", message));
}

void AircraftPresets::updateProgress() {
  const std::string& description = runner.getCurrentDescription();
  if (description == lastReportedDescription) {
    return;
  }
  lastReportedDescription = description;
  LOG_INFO(fmt::format("AircraftPresets: Aircraft Preset Step: {}", description));

  const FLOAT64 loadPercentage = runner.getProgress();
  progressAircraftPreset->setAndWriteToSim(loadPercentage);
  // send this progress to the flyPad using Comm Bus
  const std::string buffer = fmt::format("{};{}", loadPercentage, description);
  fsCommBusCall("AIRCRAFT_PRESET_WASM_CALLBACK", buffer.c_str(), buffer.size() + 1, FsCommBusBroadcast_JS);
}

void AircraftPresets::startLoading(const Preset* requestedProcedure) {
  currentProcedureID = static_cast<int>(loadAircraftPresetRequest->getAsInt64());
  // The mode is read once here: a flyPad switch flipped during the run must not change which steps run
  const bool expedited = aircraftPresetExpedite->getAsBool();
  LOG_INFO(fmt::format("AircraftPresets: Aircraft Preset {} starting procedure ({})!", currentProcedureID,
                       expedited ? "expedited" : "normal"));
  lastReportedDescription.clear();
  runner.start(requestedProcedure, expedited, aircraftPresetExpediteDelay->get());
  aircraftPresetQuickMode->setAndWriteToSim(expedited ? 1 : 0);
  progressAircraftPreset->setAndWriteToSim(0);
}

void AircraftPresets::finishLoading() {
  LOG_INFO(fmt::format("AircraftPresets: Aircraft Preset {} loading finished or cancelled!", currentProcedureID));
  runner.reset();
  lastReportedDescription.clear();
  loadAircraftPresetRequest->setAndWriteToSim(0);
  progressAircraftPreset->setAndWriteToSim(0);
  aircraftPresetQuickMode->setAndWriteToSim(0);
}
