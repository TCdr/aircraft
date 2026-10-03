// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The runways on the A380X VD's terrain profile: pure geometry (no MSFS dependency), tested natively by
// test/vd_runways_test.cpp.
//
// The terrain MapView (ALTITUDE mode) draws the airport diagram (the runways) in light grey over the terrain, in every
// view and whatever the follow mode (probed in the sim at CYUL, 2026-10-03). The VD reads that grey as terrain far
// above its plot, which drew spikes wherever the cut crossed an airport. The MapView API has no setting to hide it,
// and NanoVG cannot mask one tap's texels without erasing the profile of the others, so the stretches of the cut whose
// band reaches a runway are drawn as flat ground at the runway's elevation instead (a design choice: a runway is flat
// ground). Masking runway rectangles rather than a circle around the airport keeps the terrain around the airport on
// the profile. The runways come from the systems host (EfisTawsBridge, L:A380X_VD_RUNWAY_*).

#pragma once

#include <cmath>

namespace ndwxr {

// One straight piece of the vertical cut, relative to the aircraft (see buildVdPlanCut).
struct VdCutSegment {
  float startEastNm;   // where the piece starts, east ...
  float startNorthNm;  // ... and north of the aircraft
  float trackDeg;      // its true track
  float lengthNm;
  float startNm;  // its distance along the cut (the aircraft is at 0)
};

// A runway near the cut: a rectangle (margins included), relative to the aircraft.
struct VdRunwayArea {
  float eastNm;  // its centre
  float northNm;
  float courseDeg;  // its true course
  float halfLengthNm;
  float halfWidthNm;
  float elevationFeet;
};

// A stretch of the cut drawn as flat ground.
struct VdFlatStretch {
  float startNm;  // along the cut, from the aircraft
  float endNm;
  float elevationFeet;
};

// Narrows [lo, hi] to the t where |offset + slope * t| <= reach; returns false when nothing is left.
inline bool vdClipSlab(float offset, float slope, float reach, float& lo, float& hi) {
  if (std::fabs(slope) < 1e-6f) {
    return std::fabs(offset) <= reach;
  }
  float a = (-reach - offset) / slope;
  float b = (reach - offset) / slope;
  if (a > b) {
    const float swap = a;
    a = b;
    b = swap;
  }
  lo = std::fmax(lo, a);
  hi = std::fmin(hi, b);
  return hi > lo;
}

// The stretches of the cut, up to rangeNm, where the band of halfWidthNm on each side of it (the width the profile is
// taken over) reaches a runway. Per piece P(t) = S + t d (t = 0 .. length), the band's cross-section at t is the
// segment P(t) +- halfWidthNm n (n across the piece), so it reaches the rectangle (centre C, axes u along and v across
// the runway, half sizes a and b) when P(t) lies in the rectangle grown by that segment: a zonotope, the intersection
// of the slabs across its three generators u, v and n, i.e. |m . (P(t) - C)| <= a |m . u| + b |m . v| +
// halfWidthNm |m . n| for m = u, v and d. Returns how many were written to out (at most maxOut); stretches may overlap.
inline int vdRunwayStretches(const VdCutSegment* cut,
                             int cutCount,
                             float halfWidthNm,
                             float rangeNm,
                             const VdRunwayArea* runways,
                             int runwayCount,
                             VdFlatStretch* out,
                             int maxOut) {
  constexpr float kDegToRad = 3.14159265358979f / 180.0f;
  int count = 0;
  for (int r = 0; r < runwayCount; ++r) {
    const VdRunwayArea& runway = runways[r];
    const float course = runway.courseDeg * kDegToRad;
    const float uEast = std::sin(course);
    const float uNorth = std::cos(course);
    const float vEast = uNorth;
    const float vNorth = -uEast;
    for (int i = 0; i < cutCount && count < maxOut; ++i) {
      const VdCutSegment& piece = cut[i];
      if (piece.startNm >= rangeNm) {
        break;
      }
      const float track = piece.trackDeg * kDegToRad;
      const float dEast = std::sin(track);
      const float dNorth = std::cos(track);
      const float nEast = dNorth;
      const float nNorth = -dEast;
      // P(t) - C = (S - C) + t d
      const float offEast = piece.startEastNm - runway.eastNm;
      const float offNorth = piece.startNorthNm - runway.northNm;
      const float du = dEast * uEast + dNorth * uNorth;
      const float dv = dEast * vEast + dNorth * vNorth;
      const float nu = nEast * uEast + nNorth * uNorth;
      const float nv = nEast * vEast + nNorth * vNorth;
      float lo = 0.0f;
      float hi = piece.lengthNm;
      const bool reaches =
          // across the runway's length (m = u): reach a + halfWidth |u . n|
          vdClipSlab(offEast * uEast + offNorth * uNorth, du, runway.halfLengthNm + halfWidthNm * std::fabs(nu), lo, hi) &&
          // across its width (m = v): reach b + halfWidth |v . n|
          vdClipSlab(offEast * vEast + offNorth * vNorth, dv, runway.halfWidthNm + halfWidthNm * std::fabs(nv), lo, hi) &&
          // along the piece (m = d, d . n = 0): reach a |d . u| + b |d . v|
          vdClipSlab(offEast * dEast + offNorth * dNorth, 1.0f, runway.halfLengthNm * std::fabs(du) + runway.halfWidthNm * std::fabs(dv),
                     lo, hi);
      if (!reaches) {
        continue;
      }
      const float start = piece.startNm + lo;
      const float end = std::fmin(piece.startNm + hi, rangeNm);
      if (end > start) {
        out[count++] = VdFlatStretch{start, end, runway.elevationFeet};
      }
    }
  }
  return count;
}

}  // namespace ndwxr
