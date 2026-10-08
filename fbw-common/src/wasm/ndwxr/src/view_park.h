// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The parking of the MapViews nothing shows and the re-sending of their settings: pure logic (no MSFS dependency),
// tested natively by test/view_park_test.cpp.
//
// A view nothing has wanted for a while is made invisible (parked, see kParkAfterFrames) and made visible again when
// it is wanted, then left alone for a warm-up before it is drawn. Whether the engine keeps a view's settings while it
// is invisible is not known, and a setting the engine ignored is never sent again by a setter that only sends changes.
// So, as a safeguard (the A380X F/O VD once showed a terrain profile the CPT VD did not, with the same inputs, 2026-10-07):
// - a view that wakes up gets its whole setup again (setupDue, taken by the gauge code that knows the view's role);
// - the radius is sent on a change and again every resendSeconds while the view is in use, not only on a change.

#pragma once

namespace ndwxr {

// The parking state of one MapView and what was last sent to it.
struct ViewPark {
  bool parked = false;
  int idleFrames = 0;
  int warmupLeft = 0;
  float radiusSent = -1.0f;         // the radius last sent (m), -1 = none since the view (re)started
  double radiusSentSeconds = -1.0;  // when it was sent (sim time, s), -1 = never
  bool setupDue = false;            // the view woke up: its whole setup is to be sent again (see takeViewSetupDue)
};

// The visibility call a frame of the parking asks for.
enum class ViewVisibilityChange {
  None,
  Hide,
  Show,
};

struct ViewParkStep {
  ViewVisibilityChange change;
  bool usable;  // the view can be drawn this frame: wanted, visible and past its warm-up
};

// One frame of the parking of a view: parked after parkAfterFrames frames nobody wanted it; woken when it is wanted
// again, with a warm-up of warmupFrames frames, its radius to be sent again and its whole setup due.
inline ViewParkStep stepViewPark(ViewPark& park, bool wanted, int parkAfterFrames, int warmupFrames) {
  if (park.warmupLeft > 0) {
    --park.warmupLeft;
  }
  if (!wanted) {
    if (!park.parked && ++park.idleFrames >= parkAfterFrames) {
      park.parked = true;
      return ViewParkStep{ViewVisibilityChange::Hide, false};
    }
    return ViewParkStep{ViewVisibilityChange::None, false};
  }
  park.idleFrames = 0;
  if (park.parked) {
    park.parked = false;
    park.warmupLeft = warmupFrames;
    park.radiusSent = -1.0f;
    park.radiusSentSeconds = -1.0;
    park.setupDue = true;
    return ViewParkStep{ViewVisibilityChange::Show, warmupFrames == 0};
  }
  return ViewParkStep{ViewVisibilityChange::None, park.warmupLeft == 0};
}

// True (once) when the view woke up and its whole setup is to be sent again.
inline bool takeViewSetupDue(ViewPark& park) {
  const bool due = park.setupDue;
  park.setupDue = false;
  return due;
}

// Whether the radius is to be sent now: on a change, on the first call (or after a wake-up), when the sim time went
// back, and again once resendSeconds have passed since it was last sent.
inline bool viewRadiusSendDue(const ViewPark& park, float radiusMetres, double nowSeconds, double resendSeconds) {
  if (radiusMetres != park.radiusSent || park.radiusSentSeconds < 0.0 || nowSeconds < park.radiusSentSeconds) {
    return true;
  }
  return nowSeconds - park.radiusSentSeconds >= resendSeconds;
}

inline void noteViewRadiusSent(ViewPark& park, float radiusMetres, double nowSeconds) {
  park.radiusSent = radiusMetres;
  park.radiusSentSeconds = nowSeconds;
}

}  // namespace ndwxr
