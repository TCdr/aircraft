// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the lighting preset load target (LightingPresets/PresetLoadTarget.hpp): run test/run_tests.sh.

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "../LightingPresets/PresetLoadTarget.hpp"

using lighting_presets::presetLoadTarget;

static int failures = 0;

static void expectNear(const char* what, double actual, double expected) {
  if (std::fabs(actual - expected) > 1e-9) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

// A cut-down preset: the PFD brightness and the MCDU brightness, in the 0..100 scale of the stored presets
struct Lights {
  double pfdBrightness;
  double mcduBrightness;
};

static const Lights DEFAULT_50 = {50.0, 50.0};

// The same fade as LightingPresets::convergeValue: one step towards the target, the target once within a step
static double converge(double momentary, double target, double stepSize) {
  if (std::fabs(momentary - target) <= stepSize) {
    return target;
  }
  return momentary < target ? (std::min)(momentary + stepSize, target) : (std::max)(momentary - stepSize, target);
}

// Fades the lights to the target as a load does over its frames
static Lights fade(Lights current, const Lights& target) {
  for (int frame = 0; frame < 1000; ++frame) {
    current.pfdBrightness = converge(current.pfdBrightness, target.pfdBrightness, 2.0);
    current.mcduBrightness = converge(current.mcduBrightness, target.mcduBrightness, 2.0);
  }
  return current;
}

static void unsavedPresetLoadsTheDefaultPreset() {
  bool readCalled = false;
  const Lights target = presetLoadTarget(false, DEFAULT_50, [&]() {
    readCalled = true;
    return Lights{0.0, 0.0};
  });
  expectNear("unsaved preset: PFD target", target.pfdBrightness, 50.0);
  expectNear("unsaved preset: MCDU target", target.mcduBrightness, 50.0);
  expectTrue("unsaved preset: the missing ini section is not read", !readCalled);
}

static void savedPresetLoadsItsValues() {
  const Lights target = presetLoadTarget(true, DEFAULT_50, []() { return Lights{80.0, 20.0}; });
  expectNear("saved preset: PFD target", target.pfdBrightness, 80.0);
  expectNear("saved preset: MCDU target", target.mcduBrightness, 20.0);
}

// The cold and dark cockpit (displays at 10 %) loading a preset row that was never saved: the displays end at 50 %,
// not dark (the bug: the target stayed at its zero initial value, so every light faded to 0)
static void unsavedPresetDoesNotFadeTheDisplaysToZero() {
  const Lights coldAndDark = {10.0, 10.0};
  const Lights target = presetLoadTarget(false, DEFAULT_50, []() { return Lights{0.0, 0.0}; });
  const Lights after = fade(coldAndDark, target);
  expectNear("unsaved preset load: PFD brightness", after.pfdBrightness, 50.0);
  expectNear("unsaved preset load: MCDU brightness", after.mcduBrightness, 50.0);
}

// Loading a saved preset, then a row that was never saved: the second load goes to the default preset, not back to
// the values of the first one
static void unsavedPresetAfterASavedOneLoadsTheDefaultPreset() {
  Lights target = presetLoadTarget(true, DEFAULT_50, []() { return Lights{90.0, 90.0}; });
  Lights lights = fade(Lights{10.0, 10.0}, target);
  target = presetLoadTarget(false, DEFAULT_50, []() { return Lights{0.0, 0.0}; });
  lights = fade(lights, target);
  expectNear("second load: PFD brightness", lights.pfdBrightness, 50.0);
  expectNear("second load: MCDU brightness", lights.mcduBrightness, 50.0);
}

int main() {
  unsavedPresetLoadsTheDefaultPreset();
  savedPresetLoadsItsValues();
  unsavedPresetDoesNotFadeTheDisplaysToZero();
  unsavedPresetAfterASavedOneLoadsTheDefaultPreset();

  if (failures > 0) {
    std::printf("%d failure(s)\n", failures);
    return 1;
  }
  std::printf("preset_load_target_test: all tests passed\n");
  return 0;
}
