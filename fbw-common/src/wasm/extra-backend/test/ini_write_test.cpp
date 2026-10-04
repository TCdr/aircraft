// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the ini library write into an existing folder (cpp-msfs-framework/lib/inih/ini_fbw.h), the way
// the lighting presets save "\work\InteriorLightingPresets.ini": run test/run_tests.sh.

#include <sys/stat.h>
#include <cstdio>
#include <string>

#include "../../cpp-msfs-framework/lib/inih/ini_fbw.h"
#include "../LightingPresets/PresetLoadTarget.hpp"

static int failures = 0;

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

int main() {
  // The folder already exists, like the aircraft's \work folder in the sim
  const std::string folder = "../obj/ini_write_test_work";
  mkdir(folder.c_str(), 0777);
  const std::string file = folder + "/InteriorLightingPresets.ini";
  std::remove(file.c_str());

  mINI::INIFile      iniFile(file);
  mINI::INIStructure saved;
  saved["preset 1"]["pfd_cpt_lvl"] = "100";
  expectTrue("write into an existing folder succeeds", iniFile.write(saved, true));

  mINI::INIStructure readBack;
  expectTrue("the written file can be read", iniFile.read(readBack));
  expectTrue("the saved preset is in the file", readBack.has("preset 1") && readBack["preset 1"]["pfd_cpt_lvl"] == "100");

  // A second save (the file and folder exist) updates the file
  saved["preset 2"]["pfd_cpt_lvl"] = "50";
  expectTrue("second write succeeds", iniFile.write(saved, true));
  expectTrue("second read succeeds", iniFile.read(readBack));
  expectTrue("both presets are in the file", readBack.has("preset 1") && readBack.has("preset 2"));

  // A load with no presets file yet (fresh install): the read finds no file, the presets stay empty and the requested
  // row loads the default preset instead of failing (which left every light untouched)
  const std::string missing = folder + "/NoSuchPresets.ini";
  std::remove(missing.c_str());
  mINI::INIFile      missingFile(missing);
  mINI::INIStructure presets;
  presets["stale"]["pfd_cpt_lvl"] = "10";
  expectTrue("a missing file is reported as not read", !lighting_presets::readPresetsForLoad(missingFile, presets));
  expectTrue("a missing file leaves no presets", presets.size() == 0);
  const double target =
      lighting_presets::presetLoadTarget(presets.has("preset 5"), 50.0, [&]() { return std::stod(presets["preset 5"]["pfd_cpt_lvl"]); });
  expectTrue("a row loaded with no presets file goes to the default preset", target == 50.0);

  if (failures == 0) {
    std::printf("ini_write_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
