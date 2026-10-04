// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_LIGHTINGPRESETS_PRESETLOADTARGET_HPP
#define FLYBYWIRE_LIGHTINGPRESETS_PRESETLOADTARGET_HPP

namespace lighting_presets {

/**
 * The light values a preset load fades the cockpit lights to.
 *
 * A preset row that was saved from the flyPad has a section in the ini file and loads the saved values. A row that was
 * never saved has no section: it loads the default preset with all lights at 50 %, as the flyPad lighting presets page
 * promises ("If a preset is not defined for this number a default preset (all lights at 50%) will be loaded").
 *
 * The target must always be set: the load fades every light from its current value to this target, so a target left
 * at its zero initial value (or at the values of the preset loaded before) would fade every light, including the PFD,
 * ND, ECAM and MCDU brightness, to that value instead.
 *
 * @param sectionExists whether the ini file has a section for the requested preset
 * @param defaultPreset the default preset (all lights at 50 %), in the same units as the saved values
 * @param readSavedPreset reads the saved preset from its ini section; only called when the section exists
 * @return the values to fade the lights to
 */
template <typename LightValues, typename ReadSavedPreset>
LightValues presetLoadTarget(bool sectionExists, const LightValues& defaultPreset, ReadSavedPreset readSavedPreset) {
  if (!sectionExists) {
    return defaultPreset;
  }
  return readSavedPreset();
}

/**
 * Reads the presets file for a preset load. No file (no preset saved yet, e.g. a fresh install) or an unreadable one
 * leaves the presets empty, so every row loads the default preset: that is not a failed load, which would leave the
 * lights untouched.
 *
 * @param iniFile the presets file
 * @param ini receives the saved presets, empty when the file could not be read
 * @return whether the file was read
 */
template <typename IniFile, typename IniStructure>
bool readPresetsForLoad(const IniFile& iniFile, IniStructure& ini) {
  if (iniFile.read(ini)) {
    return true;
  }
  ini.clear();
  return false;
}

}  // namespace lighting_presets

#endif  // FLYBYWIRE_LIGHTINGPRESETS_PRESETLOADTARGET_HPP
