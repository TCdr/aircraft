// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the SimConnect data definition 0 against the SimData struct (interface/SimConnectData.h): run test/run_tests.sh.
//
// SimConnect fills SimData with the variables of definition 0 one after the other, in the order of the addDataDefinition calls in
// SimConnectInterface::prepareSimDataSimConnectDataDefinitions, and the struct is read as raw bytes (simConnectProcessSimObjectData).
// A field inserted in one and not at the same place in the other would shift every later field. This test reads the definition
// list from SimConnectInterface.cpp, computes the byte offset of each variable and compares it with the struct, for the fields
// around the engine data (TURB ENG N2 added for the hold of EngineStartThrottleHold.h) and a few later ones, and the total size.

#include <cstddef>
#include <cstdio>
#include <fstream>
#include <map>
#include <regex>
#include <sstream>
#include <string>

#include "../src/interface/SimConnectData.h"

static int failures = 0;

static void expect(bool condition, const std::string& what) {
  if (!condition) {
    std::printf("FAIL %s\n", what.c_str());
    ++failures;
  }
}

int main(int argc, char** argv) {
  const std::string path = argc > 1 ? argv[1] : "../src/interface/SimConnectInterface.cpp";
  std::ifstream     file(path);
  if (!file) {
    std::printf("FAIL cannot read %s\n", path.c_str());
    return 1;
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  const std::string source = buffer.str();

  // the body of the function that declares definition 0 (SimData) and 1 (FuelSystemData)
  const std::size_t begin = source.find("bool SimConnectInterface::prepareSimDataSimConnectDataDefinitions()");
  const std::size_t end   = source.find("\n}", begin);  // the closing brace of the function (the source has CRLF line ends)
  expect(begin != std::string::npos && end != std::string::npos, "prepareSimDataSimConnectDataDefinitions found");
  const std::string body = source.substr(begin, end - begin);

  // byte size of each SimConnect data type used in definition 0
  const std::map<std::string, std::size_t> typeSize = {
      {"FLOAT64", 8}, {"INT64", 8}, {"XYZ", sizeof(SIMCONNECT_DATA_XYZ)}, {"LATLONALT", sizeof(SIMCONNECT_DATA_LATLONALT)}};

  const std::regex                    definition(R"re(addDataDefinition\(hSimConnect,\s*0,\s*SIMCONNECT_DATATYPE_(\w+),\s*"([^"]+)")re");
  std::map<std::string, std::size_t>  offsetOf;  // first offset of each variable in definition 0
  std::size_t                         offset = 0;
  int                                 count  = 0;
  for (std::sregex_iterator it(body.begin(), body.end(), definition), last; it != last; ++it) {
    const std::string type = (*it)[1];
    const std::string name = (*it)[2];
    const auto        size = typeSize.find(type);
    expect(size != typeSize.end(), "known data type " + type + " for " + name);
    if (size == typeSize.end()) {
      continue;
    }
    offsetOf.emplace(name, offset);
    offset += size->second;
    ++count;
  }

  std::printf("definition 0: %d variables, %zu bytes; sizeof(SimData) %zu bytes\n", count, offset, sizeof(SimData));
  expect(offset == sizeof(SimData), "definition 0 fills SimData exactly (" + std::to_string(offset) + " bytes defined, " +
                                        std::to_string(sizeof(SimData)) + " in the struct)");

  const struct {
    const char* simVar;
    std::size_t structOffset;
    const char* field;
  } checks[] = {
      {"G FORCE", offsetof(SimData, nz_g), "nz_g"},
      {"TURB ENG CORRECTED N1:4", offsetof(SimData, corrected_engine_N1_4_percent), "corrected_engine_N1_4_percent"},
      {"TURB ENG N2:1", offsetof(SimData, engine_N2_1_percent), "engine_N2_1_percent"},
      {"TURB ENG N2:2", offsetof(SimData, engine_N2_2_percent), "engine_N2_2_percent"},
      {"TURB ENG N2:3", offsetof(SimData, engine_N2_3_percent), "engine_N2_3_percent"},
      {"TURB ENG N2:4", offsetof(SimData, engine_N2_4_percent), "engine_N2_4_percent"},
      {"ENG COMBUSTION:1", offsetof(SimData, engine_combustion_1), "engine_combustion_1"},
      {"ENG COMBUSTION:4", offsetof(SimData, engine_combustion_4), "engine_combustion_4"},
      {"ENG ANTI ICE:1", offsetof(SimData, engineAntiIce_1), "engineAntiIce_1"},
      {"SIM ON GROUND", offsetof(SimData, simOnGround), "simOnGround"},
      {"NAV GS LATLONALT:3", offsetof(SimData, nav_gs_pos), "nav_gs_pos"},
      {"SEA LEVEL PRESSURE", offsetof(SimData, seaLevelPressure), "seaLevelPressure"},
  };
  for (const auto& check : checks) {
    const auto found = offsetOf.find(check.simVar);
    expect(found != offsetOf.end(), std::string("definition 0 has ") + check.simVar);
    if (found != offsetOf.end()) {
      expect(found->second == check.structOffset, std::string(check.simVar) + " at byte " + std::to_string(found->second) +
                                                      ", SimData::" + check.field + " at byte " + std::to_string(check.structOffset));
    }
  }

  if (failures == 0) {
    std::printf("sim_data_layout_test (A380X): all tests passed\n");
    return 0;
  }
  std::printf("sim_data_layout_test (A380X): %d failure(s)\n", failures);
  return 1;
}
