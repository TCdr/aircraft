// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The amber radio altitude zone of the A380X VD: pure geometry (no MSFS dependency), tested natively by
// test/vd_ra_zone_test.cpp.
//
// The amber zone shows the real location of the terrain from the measured radio altitude, below 5000 ft radio
// altitude. VerticalDisplay.tsx draws the block in nd.html (VdRadioAltitudeZone.ts):
// centred on the 0 NM line (kVdLeft), kVdRadioAltitudeZoneWidth wide, from the ground under the aircraft down to the
// bottom of the plot. This module's surface is ADDED onto nd.html (see ndwxr.h), so the terrain and the weather it
// draws under the block would turn the amber into a lighter orange. While the VD shows the block
// (L:A380X_VD_{1,2}_RA_ZONE_SHOWN, written by VerticalDisplay.tsx), the plot column the block covers is wiped from
// this surface, over the whole plot height (the block is the terrain there).

#pragma once

namespace ndwxr {

// The block's width in ND pixels (VD_RADIO_ALTITUDE_ZONE_WIDTH of VdRadioAltitudeZone.ts)
constexpr float kVdRadioAltitudeZoneWidth = 18.0f;

struct VdWipeRect {
  float x;
  float y;
  float width;
  float height;
};

// Whether the column under the block is wiped, and that column: the part of the block inside the plot, i.e. from the
// plot's left edge (the block's centre) over half its width, the whole plot height.
inline bool vdRadioAltitudeZoneWipe(double zoneShownVar, float plotLeft, float plotTop, float plotHeight, VdWipeRect* out) {
  if (!(zoneShownVar > 0.5)) {
    return false;
  }
  out->x = plotLeft;
  out->y = plotTop;
  out->width = 0.5f * kVdRadioAltitudeZoneWidth;
  out->height = plotHeight;
  return true;
}

}  // namespace ndwxr
