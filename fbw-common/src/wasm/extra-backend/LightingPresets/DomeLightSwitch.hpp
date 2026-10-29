// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_LIGHTINGPRESETS_DOMELIGHTSWITCH_HPP
#define FLYBYWIRE_LIGHTINGPRESETS_DOMELIGHTSWITCH_HPP

namespace lighting_presets {

// The A320 overhead DOME switch has three positions, and the cockpit model moves the switch to the position whose
// potentiometer level matches exactly: any other level leaves the switch where it is while the lamps change.
constexpr double DOME_SWITCH_OFF = 0.0;
constexpr double DOME_SWITCH_DIM = 20.0;
constexpr double DOME_SWITCH_BRT = 100.0;

/**
 * The DOME switch position a preset's dome light level maps to.
 *
 * Levels between the positions go to the nearest one, so a preset saved before the positions were matched (DIM was
 * stored as 50) still loads as DIM.
 *
 * @param level the dome light level of the preset, 0..100
 * @return 0 (OFF), 20 (DIM) or 100 (BRT)
 */
constexpr double domeLightSwitchLevel(double level) {
  if (level <= DOME_SWITCH_OFF) {
    return DOME_SWITCH_OFF;
  }
  if (level <= (DOME_SWITCH_DIM + DOME_SWITCH_BRT) / 2) {
    return DOME_SWITCH_DIM;
  }
  return DOME_SWITCH_BRT;
}

}  // namespace lighting_presets

#endif  // FLYBYWIRE_LIGHTINGPRESETS_DOMELIGHTSWITCH_HPP
