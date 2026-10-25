// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the N1 of a start with the N1 rotor jammed (src/Fadec/FanBlockedStart_A380X.hpp): run test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/FanBlockedStart_A380X.hpp"

static int failures = 0;

static void expect(const char* what, bool ok) {
  if (!ok) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

int main() {
  expect("jammed on the ground: the fan is blocked", FanBlockedStart_A380X::isFanBlocked(true, true));
  expect("jammed in flight: the fan windmills", !FanBlockedStart_A380X::isFanBlocked(true, false));
  expect("no failure: the fan turns", !FanBlockedStart_A380X::isFanBlocked(false, true));

  expect("blocked fan: N1 0 whatever the start N1", FanBlockedStart_A380X::fanN1(4.5, true) == 0.0);
  expect("turning fan: the N1 is kept", FanBlockedStart_A380X::fanN1(4.5, false) == 4.5);

  if (failures != 0) {
    std::printf("fan_blocked_start_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fan_blocked_start_test: all checks passed\n");
  return 0;
}
