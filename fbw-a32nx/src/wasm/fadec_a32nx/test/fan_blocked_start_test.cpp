// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the fan blocked failure in the A32NX FADEC engine model (src/Fadec/FanBlockedStart_A32NX.hpp), with the
// start polynomials and the start sequence decisions the engine model uses: run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the engine model ignores the failure (as before it): the checks of the blocked fan fail.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/FanBlockedStart_A32NX.hpp"
#include "../src/Fadec/Polynomials_A32NX.hpp"
#include "../src/Fadec/StartSequence_A32NX.hpp"

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.2f)\n", what, value);
    ++failures;
  }
}

#ifdef WITHOUT_THE_FIX
static double shownN1(double n1, bool) {
  return n1;
}
static bool coreHangs(bool startN2Hang, bool) {
  return startN2Hang;
}
#else
static double shownN1(double n1, bool fanBlocked) {
  return FanBlockedStart_A32NX::fanN1(n1, fanBlocked);
}
static bool coreHangs(bool startN2Hang, bool fanBlocked) {
  return FanBlockedStart_A32NX::coreHangsBelowIdle(startN2Hang, fanBlocked);
}
#endif

/// Idle of a standard day at sea level (about what EngineControl_A32NX::generateIdleParameters gives)
static constexpr double IDLE_N2 = 68.2;
static constexpr double IDLE_N1 = 19.0;

/// The thresholds of the FWC alert ENG 1(2) LOW N1 (fbw-a32nx/.../FWC/Logic/EngineLowN1Alerts.ts, design choice)
static constexpr double LOW_N1_ALERT_MIN_N2 = 35.0;
static constexpr double LOW_N1_ALERT_MAX_N1 = 2.0;

struct StartResult {
  double maxN1AboveAlertN2 = 0.0;  // the highest N1 shown while the N2 is at or above the alert N2
  double minN1AboveAlertN2 = 100.0;
  double finalN2           = 0.0;
  bool   reachedIdle       = false;
};

/// A start on the ground as EngineControl_A32NX::engineStartProcedure runs it, frame by frame: the MSFS N2 rises to idle in
/// 40 s, the FADEC N2 follows (start polynomial, hung start cap), the N1 comes from the N2.
static StartResult runStart(bool fanBlockedFailure, bool onGround) {
  const bool  fanBlocked = FanBlockedStart_A32NX::isFanBlocked(fanBlockedFailure, onGround);
  const bool  hang       = coreHangs(false, fanBlocked);
  StartResult result;
  double      fadecN2 = 0.0;
  for (double t = 0.0; t < 60.0; t += 1.0 / 30.0) {
    const double simN2 = (std::min)(IDLE_N2, IDLE_N2 * t / 40.0);
    fadecN2            = StartSequence_A32NX::hungStartN2(Polynomial_A32NX::startN2(simN2, fadecN2, IDLE_N2), IDLE_N2, hang);
    const double n1    = shownN1(Polynomial_A32NX::startN1(fadecN2, IDLE_N2, IDLE_N1), fanBlocked);
    if (fadecN2 >= LOW_N1_ALERT_MIN_N2) {
      result.maxN1AboveAlertN2 = (std::max)(result.maxN1AboveAlertN2, n1);
      result.minN1AboveAlertN2 = (std::min)(result.minN1AboveAlertN2, n1);
    }
    if (StartSequence_A32NX::startReachesIdle(true, simN2, IDLE_N2, hang)) {
      result.reachedIdle = true;
    }
  }
  result.finalN2 = fadecN2;
  return result;
}

int main() {
  // A normal start: the N1 turns well above the LOW N1 threshold once the core passes the alert N2, and the start ends
  const StartResult normal = runStart(false, true);
  expect("normal start: N1 above the LOW N1 threshold at the alert N2", normal.minN1AboveAlertN2 > 2.0 * LOW_N1_ALERT_MAX_N1,
         normal.minN1AboveAlertN2);
  expect("normal start: reaches idle", normal.reachedIdle, normal.finalN2);

  // Fan blocked on the ground: the core passes the alert N2 with the N1 at 0, and hangs below idle
  const StartResult blocked = runStart(true, true);
  expect("fan blocked: the core passes the alert N2", blocked.finalN2 >= LOW_N1_ALERT_MIN_N2, blocked.finalN2);
  expect("fan blocked: N1 stays at 0", blocked.maxN1AboveAlertN2 < 0.01, blocked.maxN1AboveAlertN2);
  expect("fan blocked: the start does not reach idle", !blocked.reachedIdle, blocked.finalN2);
  expect("fan blocked: the core hangs below idle", blocked.finalN2 < IDLE_N2 - 10.0, blocked.finalN2);

  // In flight the fan windmills: the failure does not act
  const StartResult inFlight = runStart(true, false);
  expect("fan blocked in flight: normal start", inFlight.reachedIdle && inFlight.minN1AboveAlertN2 > LOW_N1_ALERT_MAX_N1,
         inFlight.minN1AboveAlertN2);

  // The hung start of the start sequence still hangs
  expect("hung start still hangs", coreHangs(true, false), 0.0);

  if (failures > 0) {
    std::printf("fan_blocked_start_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fan_blocked_start_test: all checks passed\n");
  return 0;
}
