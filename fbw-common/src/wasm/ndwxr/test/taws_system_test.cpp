// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the A380X TAWS system that feeds the terrain (src/taws_system.h): run test/run_tests.sh.

#include <cstdio>

#include "../src/taws_system.h"

using namespace ndwxr;

static int failures = 0;

static void expectEqual(const char* what, int actual, int expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

int main() {
  expectEqual("the selected system in normal operation", tawsSystemForTerrain(1.0, 1.0), 1);
  expectEqual("the other system after an automatic reconfiguration", tawsSystemForTerrain(1.0, 2.0), 2);
  expectEqual("the other system after an automatic reconfiguration (SYS 2 selected)", tawsSystemForTerrain(2.0, 1.0),
              1);
  expectEqual("the selected system until the systems host has written the system in use", tawsSystemForTerrain(2.0, 0.0),
              2);
  expectEqual("none without a selected system", tawsSystemForTerrain(0.0, 0.0), 0);

  if (failures > 0) {
    std::printf("taws_system_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("taws_system_test: OK\n");
  return 0;
}
