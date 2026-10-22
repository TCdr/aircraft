// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the bleed configuration the N1 limit is corrected for (src/Fadec/N1LimitBleedCorrection_A32NX.hpp): run
// test/run_tests.sh. With the EIU data the N1 limit is corrected for the bleeds that are on; without the data of either EIU it
// is corrected for none. Built with -DWITHOUT_THE_FIX, the EIU data are ignored: the checks fail.

#include <cstdio>

#include "../src/Fadec/N1LimitBleedCorrection_A32NX.hpp"

using N1LimitBleedCorrection_A32NX::BleedConfiguration;

static int failures = 0;

static void expect(const char* what, const BleedConfiguration& actual, const BleedConfiguration& expected) {
  if (actual.packs != expected.packs || actual.nacelleAntiIce != expected.nacelleAntiIce ||
      actual.wingAntiIce != expected.wingAntiIce) {
    std::printf("FAIL %s (packs %d, nacelle anti-ice %d, wing anti-ice %d)\n", what, actual.packs, actual.nacelleAntiIce,
                actual.wingAntiIce);
    ++failures;
  }
}

static BleedConfiguration limitBleedsFor(const BleedConfiguration& bleeds, bool eiuDataLost) {
#ifdef WITHOUT_THE_FIX
  (void)eiuDataLost;
  return bleeds;
#else
  return N1LimitBleedCorrection_A32NX::correctedFor(bleeds, eiuDataLost);
#endif
}

static constexpr BleedConfiguration ALL_BLEEDS{1, 1, 1};
static constexpr BleedConfiguration PACKS_ONLY{1, 0, 0};
static constexpr BleedConfiguration NONE{0, 0, 0};

int main() {
  expect("EIU data received: every bleed on is corrected for", limitBleedsFor(ALL_BLEEDS, false), ALL_BLEEDS);
  expect("EIU data received: only the packs are corrected for", limitBleedsFor(PACKS_ONLY, false), PACKS_ONLY);
  expect("EIU data lost: no correction with every bleed on", limitBleedsFor(ALL_BLEEDS, true), NONE);
  expect("EIU data lost: no correction with the packs on", limitBleedsFor(PACKS_ONLY, true), NONE);
  expect("EIU data lost, no bleed on: no correction", limitBleedsFor(NONE, true), NONE);

  if (failures == 0) {
    std::printf("n1_limit_bleed_correction_test: all checks passed\n");
    return 0;
  }
  std::printf("n1_limit_bleed_correction_test: %d check(s) failed\n", failures);
  return 1;
}
