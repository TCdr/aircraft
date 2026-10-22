// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the spoilers shown failed on the F/CTL system display (src/SpoilerFailureIndication.h): run
// test/run_tests.sh. Build with -DWITHOUT_THE_FIX to run the same checks with no spoiler reported failed, as before the
// indication: the checks of the failed spoilers must fail.

#include <array>
#include <cstdio>
#include <string>

#include "SpoilerFailureIndication.h"

using FlightControlInputFailures::SpoilerFailures;
using SpoilerFailureIndication::ComputerHealth;

static int failures = 0;

static void expect(bool condition, const std::string& what) {
  if (!condition) {
    std::printf("FAIL %s\n", what.c_str());
    ++failures;
  }
}

static bool failedSent(int spoilerIndex,
                       const SpoilerFailures& ownWing,
                       const SpoilerFailures& otherWing,
                       const ComputerHealth& primHealthy,
                       const ComputerHealth& secHealthy) {
#ifdef WITHOUT_THE_FIX
  (void)spoilerIndex;
  (void)ownWing;
  (void)otherWing;
  (void)primHealthy;
  (void)secHealthy;
  return false;
#else
  return SpoilerFailureIndication::spoilerFailed(spoilerIndex, ownWing, otherWing, primHealthy, secHealthy);
#endif
}

/// Checks both wings, spoiler 1 at index 0 of the expected arrays (true = shown failed)
static void expectFailedSpoilers(const char* testCase,
                                 const SpoilerFailures& left,
                                 const SpoilerFailures& right,
                                 const ComputerHealth& primHealthy,
                                 const ComputerHealth& secHealthy,
                                 const std::array<bool, 8>& leftExpected,
                                 const std::array<bool, 8>& rightExpected) {
  for (int i = 0; i < 8; i++) {
    const std::string spoiler = std::to_string(i + 1);
    expect(failedSent(i, left, right, primHealthy, secHealthy) == leftExpected[i],
           std::string(testCase) + ": left spoiler " + spoiler + (leftExpected[i] ? " failed" : " not failed"));
    expect(failedSent(i, right, left, primHealthy, secHealthy) == rightExpected[i],
           std::string(testCase) + ": right spoiler " + spoiler + (rightExpected[i] ? " failed" : " not failed"));
  }
}

int main() {
  const SpoilerFailures noFailure = {};
  const ComputerHealth allHealthy = {true, true, true};

  expectFailedSpoilers("all operative", noFailure, noFailure, allHealthy, allHealthy, {}, {});

  // A failed spoiler and its inhibited symmetric spoiler
  SpoilerFailures leftSpoiler3 = {};
  leftSpoiler3[2] = true;
  const std::array<bool, 8> spoiler3 = {false, false, true, false, false, false, false, false};
  expectFailedSpoilers("left spoiler 3 actuator", leftSpoiler3, noFailure, allHealthy, allHealthy, spoiler3, spoiler3);

  // Spoilers 5 and 6 keep their symmetric spoiler
  SpoilerFailures rightSpoiler6 = {};
  rightSpoiler6[5] = true;
  const std::array<bool, 8> spoiler6 = {false, false, false, false, false, true, false, false};
  expectFailedSpoilers("right spoiler 6 actuator", noFailure, rightSpoiler6, allHealthy, allHealthy, {}, spoiler6);

  // ELEC DC ESS BUS FAULT (PRIM 1 and SEC 1 lost): spoilers 1, 2, 4, 5, 7 and 8 operate
  const std::array<bool, 8> spoilers3And6 = {false, false, true, false, false, true, false, false};
  expectFailedSpoilers("PRIM 1 and SEC 1 lost", noFailure, noFailure, {false, true, true}, {false, true, true}, spoilers3And6,
                       spoilers3And6);

  // ELEC AC BUS 3+4 & DC BUS 2 FAULT (PRIM 2 and SEC 2 lost): spoilers 1, 3, 4, 6 and 8 operate
  const std::array<bool, 8> spoilers2And5And7 = {false, true, false, false, true, false, true, false};
  expectFailedSpoilers("PRIM 2 and SEC 2 lost", noFailure, noFailure, {true, false, true}, {true, false, true}, spoilers2And5And7,
                       spoilers2And5And7);

  // ELEC AC BUS 1+2 & DC BUS 1 FAULT (PRIM 3 and SEC 3 lost): spoilers 2, 3, 5, 6 and 7 operate
  const std::array<bool, 8> spoilers1And4And8 = {true, false, false, true, false, false, false, true};
  expectFailedSpoilers("PRIM 3 and SEC 3 lost", noFailure, noFailure, {true, true, false}, {true, true, false}, spoilers1And4And8,
                       spoilers1And4And8);

  if (failures > 0) {
    std::printf("%d spoiler failure indication check(s) failed\n", failures);
    return 1;
  }
  std::printf("spoiler failure indication: all checks passed\n");
  return 0;
}
