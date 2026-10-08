// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the MapView parking and the re-sending of the views' settings (src/view_park.h): run
// test/run_tests.sh.

#include <cstdio>

#include "../src/view_park.h"

using ndwxr::noteViewRadiusSent;
using ndwxr::stepViewPark;
using ndwxr::takeViewSetupDue;
using ndwxr::ViewPark;
using ndwxr::ViewParkStep;
using ndwxr::ViewVisibilityChange;
using ndwxr::viewRadiusSendDue;

static int failures = 0;

static void expect(const char* what, bool actual, bool expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

constexpr int kParkAfter = 120;
constexpr int kWarmup = 60;
constexpr double kResend = 1.0;

// Parks a fresh view: kParkAfter frames nobody wants it.
static ViewParkStep parkFresh(ViewPark& park) {
  ViewParkStep step{ViewVisibilityChange::None, false};
  for (int i = 0; i < kParkAfter; ++i) {
    step = stepViewPark(park, false, kParkAfter, kWarmup);
  }
  return step;
}

static void testParking() {
  ViewPark park;
  expect("a wanted fresh view is usable at once", stepViewPark(park, true, kParkAfter, kWarmup).usable, true);
  expect("a fresh view has no setup due", takeViewSetupDue(park), false);

  ViewPark idle;
  for (int i = 0; i < kParkAfter - 1; ++i) {
    expect("not hidden before kParkAfter idle frames", stepViewPark(idle, false, kParkAfter, kWarmup).change == ViewVisibilityChange::Hide,
           false);
  }
  const ViewParkStep hide = stepViewPark(idle, false, kParkAfter, kWarmup);
  expect("hidden after kParkAfter idle frames", hide.change == ViewVisibilityChange::Hide, true);
  expect("parked", idle.parked, true);
  expect("hidden only once", stepViewPark(idle, false, kParkAfter, kWarmup).change == ViewVisibilityChange::None, true);
}

static void testWakeUp() {
  ViewPark park;
  noteViewRadiusSent(park, 18520.0f, 5.0);
  parkFresh(park);
  const ViewParkStep wake = stepViewPark(park, true, kParkAfter, kWarmup);
  expect("shown again when wanted", wake.change == ViewVisibilityChange::Show, true);
  expect("not usable during the warm-up", wake.usable, false);
  // The fix: the whole setup is due once after the wake-up, and the radius is sent again even when unchanged.
  expect("setup due after the wake-up", takeViewSetupDue(park), true);
  expect("setup due only once", takeViewSetupDue(park), false);
  expect("radius sent again after the wake-up (same radius, 0.1 s later)", viewRadiusSendDue(park, 18520.0f, 5.1, kResend), true);

  bool usable = false;
  for (int i = 0; i < kWarmup - 1; ++i) {
    usable = stepViewPark(park, true, kParkAfter, kWarmup).usable;
  }
  expect("still warming up one frame before the end", usable, false);
  expect("usable after the warm-up", stepViewPark(park, true, kParkAfter, kWarmup).usable, true);
  expect("no setup due while in use", takeViewSetupDue(park), false);
}

static void testRadiusResend() {
  ViewPark park;
  expect("first radius is sent", viewRadiusSendDue(park, 18520.0f, 10.0, kResend), true);
  noteViewRadiusSent(park, 18520.0f, 10.0);
  expect("same radius 0.5 s later: not sent", viewRadiusSendDue(park, 18520.0f, 10.5, kResend), false);
  expect("changed radius: sent at once", viewRadiusSendDue(park, 37040.0f, 10.5, kResend), true);
  // The fix: the same radius is sent again after kResend, in case the engine ignored it.
  expect("same radius 1 s later: sent again", viewRadiusSendDue(park, 18520.0f, 11.0, kResend), true);
  expect("sim time went back: sent", viewRadiusSendDue(park, 18520.0f, 2.0, kResend), true);
  noteViewRadiusSent(park, 18520.0f, 11.0);
  expect("after the resend: not due again before kResend", viewRadiusSendDue(park, 18520.0f, 11.9, kResend), false);
}

int main() {
  testParking();
  testWakeUp();
  testRadiusResend();
  if (failures == 0) {
    std::printf("view_park_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
