// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the HP spool run-down after a shutdown (Polynomial_A380X::shutdownN3): run test/run_tests.sh. The
// time from idle to the quick relight limit and down to a stop must be the same at every frame rate.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/Polynomials_A380X.hpp"

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.3f)\n", what, value);
    ++failures;
  }
}

/// Ground idle N3 of a standard day at sea level
static constexpr double IDLE_N3 = 63.0;

/// Seconds of run-down from idle, frame by frame at `framesPerSecond`, until N3 is no longer above `targetN3`
static double secondsToRunDownTo(double targetN3, double framesPerSecond) {
  const double frameTime = 1.0 / framesPerSecond;
  double       n3        = IDLE_N3;
  int          frames    = 0;
  while (n3 > targetN3 && frames < 600 * framesPerSecond) {
    n3 = Polynomial_A380X::shutdownN3(n3, frameTime);
    ++frames;
  }
  return frames * frameTime;
}

int main() {
  struct Milestone {
    double n3;
    double expectedSeconds;
  };
  // From the start of the run-down, without the flame-out delay of the shutdown; 0 % is the spool at a stop
  const Milestone milestones[]   = {{45.0, 8.0}, {30.0, 18.8}, {10.0, 43.4}, {1.0, 58.3}, {0.0, 60.0}};
  const double    framesPerSec[] = {30.0, 60.0};

  for (const Milestone& milestone : milestones) {
    for (const double fps : framesPerSec) {
      const double seconds = secondsToRunDownTo(milestone.n3, fps);
      char         what[96];
      std::snprintf(what, sizeof(what), "idle to %.0f %% N3 in %.1f s at %.0f fps", milestone.n3, milestone.expectedSeconds, fps);
      expect(what, std::fabs(seconds - milestone.expectedSeconds) < 0.2, seconds);
    }
    const double frameRateGap = std::fabs(secondsToRunDownTo(milestone.n3, 30.0) - secondsToRunDownTo(milestone.n3, 60.0));
    expect("the same run-down at 30 and 60 fps", frameRateGap < 0.05, frameRateGap);
  }

  // A spool at a stop stays at a stop
  expect("no N3 below 0", Polynomial_A380X::shutdownN3(0.0, 1.0 / 30.0) == 0.0, Polynomial_A380X::shutdownN3(0.0, 1.0 / 30.0));

  if (failures == 0) {
    std::printf("shutdown_n3_rundown_test: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
