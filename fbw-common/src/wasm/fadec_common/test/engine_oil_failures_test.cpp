// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the engine oil failures shared by the FADECs (src/EngineOilFailures.hpp): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/EngineOilFailures.hpp"

static int failures = 0;

static void expectNear(const char* what, double value, double expected, double tolerance = 1e-6) {
  if (std::fabs(value - expected) > tolerance) {
    std::printf("FAIL %s: %f, expected %f\n", what, value, expected);
    ++failures;
  }
}

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

int main() {
  using namespace EngineOilFailures;

  // Leak: 2 qt/min while the core turns the oil pump, nothing without the failure or with the core stopped.
  const double rate = 2.0 / 60.0;
  expectNear("leak, 1 s at 2 qt/min", leakedQuantity(true, 85.0, 15.0, rate, 1.0), rate);
  expectNear("no leak without the failure", leakedQuantity(false, 85.0, 15.0, rate, 1.0), 0.0);
  expectNear("no leak with the core stopped", leakedQuantity(true, 0.0, 15.0, rate, 1.0), 0.0);
  expectNear("no leak below the oil pump speed", leakedQuantity(true, 9.0, 15.0, rate, 1.0), 0.0);
  expectNear("windmilling core above the oil pump speed leaks", leakedQuantity(true, 12.0, 15.0, rate, 1.0), rate);
  expectNear("never more than the oil left", leakedQuantity(true, 85.0, 0.01, rate, 1.0), 0.01);
  expectNear("an empty system loses nothing", leakedQuantity(true, 85.0, 0.0, rate, 1.0), 0.0);

  // A whole leak: 15 qt at 2 qt/min in 0.1 s steps is empty after 7.5 min, never below 0.
  double total = 15.0;
  for (int step = 0; step < 4500; ++step) {
    total -= leakedQuantity(true, 85.0, total, rate, 0.1);
  }
  expectNear("15 qt gone after 7.5 min", total, 0.0, 1e-6);
  expectTrue("the quantity never goes below 0", total >= 0.0);

  // Pressure: the pump delivers its normal pressure down to 2 qt in the tank, none at 0.5 qt, linear in between.
  expectNear("normal pressure with a full tank", pressureFactor(12.0, 2.0, 0.5), 1.0);
  expectNear("normal pressure at the threshold", pressureFactor(2.0, 2.0, 0.5), 1.0);
  expectNear("half pressure half way", pressureFactor(1.25, 2.0, 0.5), 0.5);
  expectNear("no pressure with an empty tank", pressureFactor(0.5, 2.0, 0.5), 0.0);
  expectNear("no pressure below the empty quantity", pressureFactor(0.0, 2.0, 0.5), 0.0);

  // Overheat: heads to 135 C at idle, 175 C at 100 % core speed, with a 60 s time constant.
  const OverheatParameters overheat{135.0, 175.0, 60.0};
  expectNear("target at idle", overheatTargetTemperature(68.0, 68.0, overheat), 135.0);
  expectNear("target below idle", overheatTargetTemperature(20.0, 68.0, overheat), 135.0);
  expectNear("target at 100 %", overheatTargetTemperature(100.0, 68.0, overheat), 175.0);
  expectNear("target half way", overheatTargetTemperature(84.0, 68.0, overheat), 155.0);
  expectNear("one time constant: 63 % of the way", overheatTemperature(85.0, 100.0, 68.0, 60.0, overheat),
             85.0 + 90.0 * (1.0 - std::exp(-1.0)));

  double temperature = 85.0;
  for (int step = 0; step < 6000; ++step) {
    temperature = overheatTemperature(temperature, 100.0, 68.0, 0.1, overheat);
  }
  expectNear("10 min at full thrust: at the full thrust temperature", temperature, 175.0, 0.1);
  for (int step = 0; step < 6000; ++step) {
    temperature = overheatTemperature(temperature, 68.0, 68.0, 0.1, overheat);
  }
  expectNear("then 10 min at idle: back at the idle temperature", temperature, 135.0, 0.1);

  // The sim test of 2026-10-06 (A380X engine 4 overheat at FL200, 300 kt: N3 84.3 %, idle N3 60.5 %, oil at 75 C): the
  // oil temperature stopped at 128 C. MSFS moves GENERAL ENG OIL TEMPERATURE with its own oil model between two FADEC
  // updates; this emulation of it (a pull towards -172 C with a 240 s time constant, fitted to the recording: 94.5 C after
  // 20 s, 106.5 C after 40 s, 113.6 C after 60 s, 128 C after 280 s) reproduces that plateau.
  const OverheatParameters a380Overheat{170.0, 225.0, 60.0};
  const double             frame = 0.05;
  auto msfsOilModel = [frame](double written) { return written + (-172.0 - written) * (1.0 - std::exp(-frame / 240.0)); };

  // Integrating the overheat from the value read back (the FADEC before the fix) gives the plateau of the recording
  double readBack = 75.0;
  for (int step = 0; step < static_cast<int>(280.0 / frame); ++step) {
    readBack = msfsOilModel(overheatTemperature(readBack, 84.3, 60.5, frame, a380Overheat));
  }
  expectNear("emulated MSFS oil model: the read back integration stops near 128 C after 280 s", readBack, 128.0, 1.5);

  // The FADEC keeps its own overheat temperature (OverheatTracker): ENG OIL TEMP HI (above 196 C) within 4 min at cruise
  OverheatTracker tracker;
  double          simTemperature = 75.0;
  double          aboveLimitAt   = -1.0;
  for (int step = 0; step < static_cast<int>(240.0 / frame); ++step) {
    const double written = tracker.update(true, simTemperature, 84.3, 60.5, frame, a380Overheat);
    if (aboveLimitAt < 0.0 && written > 196.0) {
      aboveLimitAt = step * frame;
    }
    simTemperature = msfsOilModel(written);
  }
  expectTrue("overheat at cruise N3 passes the 196 C of ENG OIL TEMP HI within 4 min despite the MSFS oil model",
             aboveLimitAt > 0.0);
  expectTrue("the written temperature is the tracker's, not the MSFS one", simTemperature > 196.0);

  // Without the failure the tracker hands back the MSFS value, and a new failure starts from it again
  expectNear("no overheat: the MSFS temperature", tracker.update(false, 90.0, 84.3, 60.5, frame, a380Overheat), 90.0);
  expectNear("a new overheat starts from the MSFS temperature",
             tracker.update(true, 90.0, 84.3, 60.5, frame, a380Overheat),
             overheatTemperature(90.0, 84.3, 60.5, frame, a380Overheat));

  if (failures == 0) {
    std::printf("engine_oil_failures_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
