// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The reference altitude of the TERR ON ND picture: pure logic (no MSFS dependency), tested natively by
// test/terrain_reference_test.cpp.
//
// The terrain colours are relative to the aircraft's altitude or, in a fast descent, to the altitude expected some
// time ahead (a parameter, kTerrainLookAheadSeconds in constants.h). The MapView colours by the aircraft's own altitude,
// so the look-ahead shifts the altitude window the view is given. Both NDs show the picture of the one GPWS computer,
// so they share one vertical speed and one look-ahead state; the value changes in steps with a deadband, so a window
// that moves back and forth does not make the two views, which take a change at their own time, show different
// pictures for a moment.

#pragma once

#include <cmath>

namespace ndwxr {

constexpr int kIrCount = 3;

// One inertial reference's vertical speed (ft/min) and whether its word is valid.
struct IrVerticalSpeed {
  bool valid = false;
  float fpm = 0.0f;
};

// Design choice: the first valid IR's vertical speed. The aircraft has one GPWS computer, so both NDs must show one
// picture; the first valid IR does not depend on the side the ND is on.
inline IrVerticalSpeed selectVerticalSpeed(const IrVerticalSpeed (&irs)[kIrCount]) {
  for (const IrVerticalSpeed& ir : irs) {
    if (ir.valid) {
      return ir;
    }
  }
  return IrVerticalSpeed{};
}

// The look-ahead in use and whether it is active (shared by the NDs).
struct TerrainLookAhead {
  bool active = false;
  float feet = 0.0f;
};

// The look-ahead (ft) for the vertical speed. It becomes active when descending faster than onBelowFpm and stays
// active until the vertical speed is above -offAboveFpm. While active it is the distance flown in `seconds`, in whole
// steps of stepFeet, and changes only when the distance is a full step or more away from the value in use. Calling it
// again with the same input returns the same value, so the NDs can all call it in one frame.
inline float updateTerrainLookAhead(TerrainLookAhead& state,
                                    bool valid,
                                    float verticalSpeedFpm,
                                    float onBelowFpm,
                                    float offAboveFpm,
                                    float seconds,
                                    float stepFeet) {
  if (!valid || !std::isfinite(verticalSpeedFpm) || (state.active ? verticalSpeedFpm > -offAboveFpm : verticalSpeedFpm >= -onBelowFpm)) {
    state = TerrainLookAhead{};
    return 0.0f;
  }
  const float distanceFeet = -verticalSpeedFpm * (seconds / 60.0f);
  if (!state.active || std::fabs(distanceFeet - state.feet) >= stepFeet) {
    state.feet = std::round(distanceFeet / stepFeet) * stepFeet;
  }
  state.active = true;
  return state.feet;
}

}  // namespace ndwxr
