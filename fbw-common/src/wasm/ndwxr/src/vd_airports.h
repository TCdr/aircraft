// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The airports on the A380X VD's terrain profile: pure geometry (no MSFS dependency), tested natively by
// test/vd_airports_test.cpp.
//
// The terrain MapView (ALTITUDE mode) draws the airport diagram (runways, taxiways, aprons) in light grey over the
// terrain, in every view and whatever the follow mode (measured in the sim at CYUL). The VD reads that grey
// as terrain far above its plot, which drew spikes wherever the cut crossed an airport. The MapView API has no setting
// to hide it, and NanoVG cannot mask one tap's texels without erasing the profile of the others, so the stretches of
// the cut whose band reaches an airport are drawn as flat ground at the airport's elevation instead (design choice:
// an airport is flat ground). Each airport is a circle sized to it, holding all its runways plus a margin (from the
// systems host, EfisTawsBridge / VdAirports.ts, L:A380X_VD_AIRPORT_*): rectangles around each runway left the
// taxiways and aprons beside them as spikes in the sim.

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

// An airport near the cut: a circle (margin included), relative to the aircraft.
struct VdAirportArea {
  float eastNm;  // its centre
  float northNm;
  float radiusNm;
  float elevationFeet;
};

// A stretch of the cut drawn as flat ground.
struct VdFlatStretch {
  float startNm;  // along the cut, from the aircraft
  float endNm;
  float elevationFeet;
};

// The stretches of the cut, up to rangeNm, where the band of halfWidthNm on each side of it (the width the profile is
// taken over) reaches an airport's circle. Per piece P(t) = S + t d (t = 0 .. length, d along the piece, n across it),
// the band's cross-section at t is the segment P(t) +- halfWidthNm n. With w = C - S, the circle's centre is
// a = w . n across the piece (the same for every t) and w . d - t along it, so the segment comes within
// sqrt((w . d - t)^2 + max(|a| - halfWidthNm, 0)^2) of the centre: it reaches the circle (radius R) for
// |w . d - t| <= sqrt(R^2 - max(|a| - halfWidthNm, 0)^2). Returns how many were written to out (at most maxOut);
// stretches may overlap.
inline int vdAirportStretches(const VdCutSegment* cut,
                              int cutCount,
                              float halfWidthNm,
                              float rangeNm,
                              const VdAirportArea* airports,
                              int airportCount,
                              VdFlatStretch* out,
                              int maxOut) {
  constexpr float kDegToRad = 3.14159265358979f / 180.0f;
  int count = 0;
  for (int a = 0; a < airportCount; ++a) {
    const VdAirportArea& airport = airports[a];
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
      const float wEast = airport.eastNm - piece.startEastNm;
      const float wNorth = airport.northNm - piece.startNorthNm;
      const float across = std::fabs(wEast * nEast + wNorth * nNorth);
      const float along = wEast * dEast + wNorth * dNorth;
      // how far the circle's centre lies beyond the band's edge
      const float beyondBand = std::fmax(across - halfWidthNm, 0.0f);
      if (beyondBand > airport.radiusNm) {
        continue;
      }
      const float reach = std::sqrt(airport.radiusNm * airport.radiusNm - beyondBand * beyondBand);
      const float lo = std::fmax(along - reach, 0.0f);
      const float hi = std::fmin(along + reach, piece.lengthNm);
      if (hi <= lo) {
        continue;
      }
      const float start = piece.startNm + lo;
      const float end = std::fmin(piece.startNm + hi, rangeNm);
      if (end > start) {
        out[count++] = VdFlatStretch{start, end, airport.elevationFeet};
      }
    }
  }
  return count;
}

}  // namespace ndwxr
