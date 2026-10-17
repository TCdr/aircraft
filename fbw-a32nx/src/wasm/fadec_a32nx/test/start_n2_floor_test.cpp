// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the least N2 rise of a burning start in the A32NX FADEC (Polynomial_A32NX::startN2, src/Fadec/
// Polynomials_A32NX.hpp): run test/run_tests.sh. The floor keeps the start N2 from running down; it must be the same at
// every frame rate. Built with -DWITHOUT_THE_FIX, the floor is the old fixed step per frame: the frame rate checks fail.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/Polynomials_A32NX.hpp"

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.3f)\n", what, value);
    ++failures;
  }
}

/// Idle of a standard day at sea level (about what EngineControl_A32NX::generateIdleParameters gives)
static constexpr double IDLE_N2 = 68.2;

#ifdef WITHOUT_THE_FIX
// The start N2 before the fix: the floor rose by 0.002 % each frame, whatever the frame time
static double litStartN2(double simN2, double previousN2, double idleN2, double) {
  const double withoutFloor = Polynomial_A32NX::startN2(simN2, previousN2, idleN2, 0.0);
  return (std::min)((std::max)(withoutFloor, previousN2 + 0.002), idleN2 + 0.1);
}
#else
static double litStartN2(double simN2, double previousN2, double idleN2, double deltaTime) {
  return Polynomial_A32NX::startN2(simN2, previousN2, idleN2, deltaTime);
}
#endif

/// The FADEC N2 of a burning start after `seconds`, frame by frame at `framesPerSecond`, from `startN2` with the MSFS N2
/// given by `simN2At(t)`.
template <typename SimN2>
static double runStart(double framesPerSecond, double seconds, double startN2, SimN2 simN2At) {
  const double frameTime = 1.0 / framesPerSecond;
  const int    frames    = static_cast<int>(std::lround(seconds * framesPerSecond));
  double       fadecN2   = startN2;
  for (int frame = 1; frame <= frames; ++frame) {
    fadecN2 = litStartN2(simN2At(frame * frameTime), fadecN2, IDLE_N2, frameTime);
  }
  return fadecN2;
}

int main() {
  // 1. MSFS gives the engine no fuel: its N2 stays at starter speed (25 %). The FADEC N2 creeps up only by the floor, and by
  // the same amount at 20, 30, 60 and 120 fps: 60 s x 0.06 %/s = 3.6 %.
  const auto   stalledSimN2   = [](double) { return 25.0; };
  const double startN2        = Polynomial_A32NX::startN2(25.0, 0.0, IDLE_N2, 0.0);
  const double expectedCreep  = 60.0 * Polynomial_A32NX::LIT_START_MIN_N2_RISE_PER_SECOND;
  const double framesPerSec[] = {20.0, 30.0, 60.0, 120.0};
  for (const double fps : framesPerSec) {
    const double creep = runStart(fps, 60.0, startN2, stalledSimN2) - startN2;
    char         what[96];
    std::snprintf(what, sizeof(what), "stalled MSFS N2: the FADEC N2 creeps 3.6 %% in 60 s at %.0f fps", fps);
    expect(what, std::fabs(creep - expectedCreep) < 0.05, creep);
  }

  // 2. A normal start (MSFS N2 to idle in 40 s) reaches idle at every frame rate and stops at the idle cap
  const auto normalSimN2 = [](double t) { return (std::min)(IDLE_N2, IDLE_N2 * t / 40.0); };
  for (const double fps : framesPerSec) {
    const double n2 = runStart(fps, 60.0, 0.0, normalSimN2);
    expect("normal start: the FADEC N2 reaches idle", n2 >= IDLE_N2 - 0.1 && n2 <= IDLE_N2 + 0.1, n2);
  }

  // 3. A burning start never runs down: the MSFS N2 drops by 2 % for a moment, the FADEC N2 keeps rising
  double fadecN2   = 40.0;
  bool   ranDown   = false;
  double lowestGap = 1.0;
  for (int frame = 0; frame < 30; ++frame) {
    const double simN2  = frame < 10 ? 40.0 : 38.0;
    const double nextN2 = litStartN2(simN2, fadecN2, IDLE_N2, 1.0 / 30.0);
    ranDown             = ranDown || nextN2 <= fadecN2;
    lowestGap           = (std::min)(lowestGap, nextN2 - fadecN2);
    fadecN2             = nextN2;
  }
  expect("a burning start never runs down", !ranDown, lowestGap);

  if (failures == 0) {
    std::printf("start_n2_floor_test: all checks passed\n");
    return 0;
  }
  std::printf("start_n2_floor_test: %d check(s) failed\n", failures);
  return 1;
}
