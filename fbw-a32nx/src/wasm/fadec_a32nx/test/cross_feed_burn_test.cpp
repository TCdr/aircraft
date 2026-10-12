// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the wing tank each engine burns from (src/Fadec/CrossFeedBurn_A32NX.hpp): run test/run_tests.sh.
// Built with -DWITHOUT_THE_FIX, the burns are routed as EngineControlA32NX.cpp did before (gravity feeding burned no tank
// fuel): the test then fails.

#include <cmath>
#include <cstdio>

#include "../src/Fadec/CrossFeedBurn_A32NX.hpp"

using namespace CrossFeedBurn_A32NX;

#ifdef WITHOUT_THE_FIX
// The routing of EngineControlA32NX.cpp before the fix (develop 19910a87e, isTankClosed = 3 zeroed both engine burns)
static Burns route(WingSupply supply, double engine1Burn, double engine2Burn, double apuBurn) {
  if (supply == WingSupply::GRAVITY_FEED) {
    return {0.0, 0.0, apuBurn * 0.5, apuBurn * 0.5};
  }
  return routeBurns(supply, engine1Burn, engine2Burn, apuBurn);
}
#else
static Burns route(WingSupply supply, double engine1Burn, double engine2Burn, double apuBurn) {
  return routeBurns(supply, engine1Burn, engine2Burn, apuBurn);
}
#endif

static int failures = 0;

static void expectNear(const char* what, double actual, double expected) {
  if (std::fabs(actual - expected) > 1e-9) {
    std::printf("FAIL %s: %f, expected %f\n", what, actual, expected);
    ++failures;
  }
}

static void expectSupply(const char* what, WingSupply actual, WingSupply expected) {
  if (actual != expected) {
    std::printf("FAIL %s: supply %d, expected %d\n", what, static_cast<int>(actual), static_cast<int>(expected));
    ++failures;
  }
}

int main() {
  // The X FEED and the pumps select the supply
  expectSupply("X FEED closed", wingSupply(false, true, true), WingSupply::OWN_SIDE);
  expectSupply("X FEED open, left pumps off", wingSupply(true, true, false), WingSupply::RIGHT_FEEDS_BOTH);
  expectSupply("X FEED open, right pumps off", wingSupply(true, false, true), WingSupply::LEFT_FEEDS_BOTH);
  expectSupply("X FEED open, all wing pumps off", wingSupply(true, true, true), WingSupply::GRAVITY_FEED);
  expectSupply("X FEED open, all pumps on", wingSupply(true, false, false), WingSupply::BOTH_FEED_BOTH);

  // Gravity feeding (QRH GRAVITY FUEL FEEDING): each engine burns its own wing tank, the fuel is not lost
  const Burns gravity = route(WingSupply::GRAVITY_FEED, 1.0, 2.0, 0.4);
  expectNear("gravity feed: engine 1 burns the left tank", gravity.engine1, 1.0);
  expectNear("gravity feed: engine 2 burns the right tank", gravity.engine2, 2.0);
  expectNear("gravity feed: APU left half", gravity.apuLeft, 0.2);
  expectNear("gravity feed: APU right half", gravity.apuRight, 0.2);

  // The other cases are unchanged
  const Burns ownSide = route(WingSupply::OWN_SIDE, 1.0, 2.0, 0.4);
  expectNear("own side: engine 1", ownSide.engine1, 1.0);
  expectNear("own side: engine 2", ownSide.engine2, 2.0);
  expectNear("own side: APU from the left", ownSide.apuLeft, 0.4);
  expectNear("own side: nothing of the APU from the right", ownSide.apuRight, 0.0);

  const Burns rightFeedsBoth = route(WingSupply::RIGHT_FEEDS_BOTH, 1.0, 2.0, 0.4);
  expectNear("right feeds both: nothing from the left", rightFeedsBoth.engine1, 0.0);
  expectNear("right feeds both: both engines from the right", rightFeedsBoth.engine2, 3.0);
  expectNear("right feeds both: APU from the right", rightFeedsBoth.apuRight, 0.4);

  const Burns leftFeedsBoth = route(WingSupply::LEFT_FEEDS_BOTH, 1.0, 2.0, 0.4);
  expectNear("left feeds both: both engines from the left", leftFeedsBoth.engine1, 3.0);
  expectNear("left feeds both: nothing from the right", leftFeedsBoth.engine2, 0.0);
  expectNear("left feeds both: APU from the left", leftFeedsBoth.apuLeft, 0.4);

  const Burns bothFeedBoth = route(WingSupply::BOTH_FEED_BOTH, 1.0, 2.0, 0.4);
  expectNear("both feed both: engine 1", bothFeedBoth.engine1, 1.0);
  expectNear("both feed both: engine 2", bothFeedBoth.engine2, 2.0);
  expectNear("both feed both: APU half", bothFeedBoth.apuLeft, 0.2);

  if (failures == 0) {
    std::printf("cross_feed_burn_test: all passed\n");
    return 0;
  }
  std::printf("cross_feed_burn_test: %d failure(s)\n", failures);
  return 1;
}
