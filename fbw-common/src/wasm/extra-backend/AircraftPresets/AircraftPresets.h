// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFTPRESETS_H
#define FLYBYWIRE_AIRCRAFTPRESETS_H

#include <cstdint>

#include "DataManager.h"
#include "Module.h"
#include "PresetProcedures.hpp"
#include "PresetRunner.hpp"
#include "ProcedureStep.hpp"

class MsfsHandler;

/**
 * AircraftPresets is responsible for loading aircraft presets. It reads the procedures from an XML file and creates the presets with the
 * correct procedure steps.
 *
 * The module is initialized with the MsfsHandler instance and the path to the XML file containing the procedure definitions.<p/>
 *
 * The module is updated in the update method.<br/>
 * It uses various control variables to manage the loading process and the progress of the loading.<br/>
 * It checks if a preset load is requested and if so, it initializes the loading process.<br/>
 * It executes the steps in the procedures in the correct order and sends the progress to the Lvars and the flyPad via COMM_BUS.<p/>
 *
 * The control variables are:<br/>
 * - "<prefix>AIRCRAFT_PRESET_LOAD": The LVAR that is used to request a preset load. It is a number between 1 and 5 and is set to 0 to reset
 *   the request.<br/>
 * - "<prefix>AIRCRAFT_PRESET_LOAD_PROGRESS": The LVAR that is used to track the progress of the preset load.<br/>
 * - "<prefix>AIRCRAFT_PRESET_VERBOSE": The LVAR that is used to set the verbose mode of the preset load (outputs to the MSFS console).<br/>
 * - "<prefix>AIRCRAFT_PRESET_LOAD_EXPEDITE": The LVAR that is used to set the expedited mode of the preset load.<br/>
 * - "<prefix>AIRCRAFT_PRESET_LOAD_EXPEDITE_DELAY": The LVAR that is used to set a delay in ms for the expedited mode of the preset
 *   load.<br/>
 */
class AircraftPresets : public Module {
 private:
  // Convenience pointer to the data manager
  DataManager* dataManager = nullptr;

  // LVARs

  // "<prefix>AIRCRAFT_PRESET_LOAD" is the LVAR that is used to request a preset load.
  // It is a number between 1 and 5 and is set to 0 to reset the request.
  NamedVariablePtr loadAircraftPresetRequest{};

  // "<prefix>AIRCRAFT_PRESET_LOAD_PROGRESS" is the LVAR that is used to track the progress of the preset load.
  NamedVariablePtr progressAircraftPreset{};

  // "<prefix>AIRCRAFT_PRESET_VERBOSE" is the LVAR that is used to set the verbose mode of the preset load
  // to print additional information while loading to the console.
  NamedVariablePtr aircraftPresetVerbose{};

  // "<prefix>AIRCRAFT_PRESET_LOAD_EXPEDITE" is the LVAR that is used to set the expedited mode of the preset load
  // to skip waiting times and expedite the loading process.
  NamedVariablePtr aircraftPresetExpedite{};

  // "<prefix>AIRCRAFT_PRESET_LOAD_EXPEDITE_DELAY" is the LVAR that is used to set a delay in ms for
  // the expedited mode of the preset load. If the default value of 0 causes issues, it can be increased.
  NamedVariablePtr aircraftPresetExpediteDelay{};

  // "<prefix>AIRCRAFT_PRESET_QUICK_MODE" is the LVAR that is used to set the quick mode of the preset load
  // to skip tell the systems to execute quickly (instant APU, ENG,ADIRS, etc.)
  NamedVariablePtr aircraftPresetQuickMode{};

  // Procedures
  PresetProcedures presetProcedures;

  // Runs the calculator code of the steps in the sim
  class CalculatorCodeEnvironment : public aircraft_presets::CodeEnvironment {
   public:
    explicit CalculatorCodeEnvironment(const NamedVariablePtr& verboseVar) : verboseVar(verboseVar) {}
    bool evaluate(const std::string& code) override;
    void execute(const std::string& code) override;

   private:
    const NamedVariablePtr& verboseVar;
  };
  CalculatorCodeEnvironment codeEnvironment{aircraftPresetVerbose};

  // Walks through the steps of the running preset
  aircraft_presets::PresetRunner runner{codeEnvironment, &AircraftPresets::logRunnerMessage};

  // ID of the preset that is being loaded
  int currentProcedureID = 0;

  // the step the progress was last sent for, so that the flyPad is only told about changes
  std::string lastReportedDescription;

 public:
  AircraftPresets() = delete;  // no default constructor

  /**
   * Creates a new AircraftPresets instance and takes a reference to the MsfsHandler instance.
   * @param msfsHandler The MsfsHandler instance that is used to communicate with the simulator.
   * @param aircraftProceduresDefinitions The AircraftProceduresDefinition instance that is used to define the procedures.
   */
  explicit AircraftPresets(MsfsHandler& msfsHandler, std::string&& configFile)
      : Module(msfsHandler), presetProcedures(std::move(configFile)) {}

  bool initialize() override;
  bool preUpdate(sGaugeDrawData*) override { return true; };  // not required for this module
  bool update(sGaugeDrawData* pData) override;
  bool postUpdate(sGaugeDrawData*) override { return true; };  // not required for this module
  bool shutdown() override;

 private:
  static void logRunnerMessage(const std::string& message);

  /**
   * Updates the progress of the preset load and send it to the Lvars and the flyPad via COMM_BUS
   */
  void updateProgress();

  /**
   * Starts loading the requested preset and latches the loading mode (normal or expedited) for the whole run.
   */
  void startLoading(const Preset* requestedProcedure);

  /**
   * Is called when the loading is completed, cancelled or aborted. Releases the request and the quick mode LVAR.
   */
  void finishLoading();
};

#endif  // FLYBYWIRE_AIRCRAFTPRESETS_H
