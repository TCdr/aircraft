// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the MSFS core speed during a start or an in-flight relight (src/Fadec/RelightStart_A380X.hpp):
// run test/run_tests.sh.

#include <cmath>
#include <cstdio>
#include <optional>

#include "../src/Fadec/RelightStart_A380X.hpp"

static int failures = 0;

static void expectNone(const char* what, std::optional<double> command) {
  if (command) {
    std::printf("FAIL %s: corrected N2 %f written, expected none\n", what, *command);
    ++failures;
  }
}

static void expectCommand(const char* what, std::optional<double> command, double expected) {
  if (!command) {
    std::printf("FAIL %s: nothing written, expected corrected N2 %f\n", what, expected);
    ++failures;
  } else if (std::fabs(*command - expected) > 1e-6) {
    std::printf("FAIL %s: corrected N2 %f written, expected %f\n", what, *command, expected);
    ++failures;
  }
}

/// The corrected N2 that MSFS shows as this N2 at this ambient temperature: N2 / sqrt(T / 288.15 K).
static double correctedN2(double n2, double ambientTemperature) {
  return n2 / std::sqrt((ambientTemperature + 273.15) / 288.15);
}

int main() {
  // A ground start from rest: MSFS N2 held at 0 during the 1.7 s start delay, then left to the MSFS starter.
  expectCommand("ground start, start delay", RelightStart_A380X::correctedN2Command({true, 0.5, false, false, 0.0, 15.0}), 0.0);
  expectNone("ground start, after the start delay", RelightStart_A380X::correctedN2Command({true, 2.0, false, false, 20.0, 15.0}));

  // In flight the core turns (windmilling or still fast): the start delay must not stop it (sim test 2026-10-05: the quick relight
  // at 50 % N3 and the windmilling relights never burned).
  expectNone("in flight, start delay of a quick relight", RelightStart_A380X::correctedN2Command({false, 0.5, false, true, 50.0, -15.0}));
  expectNone("in flight, start delay of a relight attempt", RelightStart_A380X::correctedN2Command({false, 0.5, true, false, 12.0, -15.0}));

  // An in-flight relight that the systems WASM lets light up (fuel no longer cut) while MSFS windmills below its combustion speed
  // and has no starter air (no MSFS APU bleed): MSFS is brought to the light-up speed, 25 % N2.
  expectCommand("in flight, windmilling relight lit up", RelightStart_A380X::correctedN2Command({false, 0.5, false, false, 12.0, -34.5}),
                correctedN2(25.0, -34.5));
  expectCommand("in flight, windmilling relight lit up after the start delay",
                RelightStart_A380X::correctedN2Command({false, 5.0, false, false, 15.0, -15.0}), correctedN2(25.0, -15.0));

  // ...but not before the systems WASM lets it light up, nor once MSFS burns or turns fast enough by itself.
  expectNone("in flight, relight attempt not lit up (fuel cut)",
             RelightStart_A380X::correctedN2Command({false, 5.0, true, false, 12.0, -15.0}));
  expectNone("in flight, MSFS burns", RelightStart_A380X::correctedN2Command({false, 5.0, false, true, 22.0, -15.0}));
  expectNone("in flight, MSFS already above the light-up speed",
             RelightStart_A380X::correctedN2Command({false, 5.0, false, false, 30.0, -15.0}));

  if (failures == 0) {
    std::printf("relight_start_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
