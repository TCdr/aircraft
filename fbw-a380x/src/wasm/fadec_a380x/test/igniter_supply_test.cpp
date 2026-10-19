// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the igniter electrical supply (src/Fadec/IgniterSupply_A380X.hpp): run test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/IgniterSupply_A380X.hpp"

static int failures = 0;

static void expectIgniters(const char* what, IgniterSelection_A380X::Igniters value, bool a, bool b) {
  if (value.a != a || value.b != b) {
    std::printf("FAIL %s: A %d B %d, expected A %d B %d\n", what, value.a, value.b, a, b);
    ++failures;
  }
}

int main() {
  const IgniterSelection_A380X::Igniters both{true, true};

  expectIgniters("both supplied", IgniterSupply_A380X::energized(both, 3), true, true);
  // AC ESS lost: igniter A is not energized
  expectIgniters("only B supplied", IgniterSupply_A380X::energized(both, 2), false, true);
  expectIgniters("only A supplied", IgniterSupply_A380X::energized(both, 1), true, false);
  expectIgniters("no supply", IgniterSupply_A380X::energized(both, 0), false, false);
  // the supply does not energize an igniter the FADEC has not selected
  expectIgniters("none selected", IgniterSupply_A380X::energized({false, false}, 3), false, false);
  expectIgniters("B selected, A supplied", IgniterSupply_A380X::energized({false, true}, 1), false, false);

  if (failures == 0) {
    std::printf("igniter_supply_test: all tests passed\n");
  }
  return failures == 0 ? 0 : 1;
}
