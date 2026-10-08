// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the A380X weather radar GAIN and ELEVN/TILT logic (src/wxr_controls.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "../src/wxr_controls.h"

using namespace ndwxr;

static int failures = 0;

static void expectNear(const char* what, float actual, float expected, float tolerance) {
  if (!(std::fabs(actual - expected) <= tolerance)) {
    std::printf("FAIL %s: %g, expected %g (+/- %g)\n", what, static_cast<double>(actual), static_cast<double>(expected),
                static_cast<double>(tolerance));
    ++failures;
  }
}

static void expectTrue(const char* what, bool actual) {
  if (!actual) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

// The calibrated thresholds of constants.h (kGreenFromMmH, kYellowFromMmH, kRedFromMmH, kTurbulenceRateMmH).
static const RadarThresholds kCalibrated{0.7f, 4.0f, 12.0f, 20.0f};

static void testGainPercentToDb() {
  // 50 % (the FCOM default value) is the calibrated gain; the ends are the RDR-4000 MIN and MAX.
  expectNear("50 % = CAL", gainDbFromPercent(50.0f), 0.0f, 1e-6f);
  expectNear("0 % = MIN", gainDbFromPercent(0.0f), -16.0f, 1e-6f);
  expectNear("100 % = MAX", gainDbFromPercent(100.0f), 10.0f, 1e-6f);
  expectNear("25 % = half of MIN", gainDbFromPercent(25.0f), -8.0f, 1e-5f);
  expectNear("75 % = half of MAX", gainDbFromPercent(75.0f), 5.0f, 1e-5f);
  expectNear("above 100 % clamps", gainDbFromPercent(140.0f), 10.0f, 1e-6f);
  expectNear("below 0 % clamps", gainDbFromPercent(-5.0f), -16.0f, 1e-6f);
}

static void testEffectiveGain() {
  expectNear("AUTO gain is calibrated whatever the stored value", effectiveGainDb(false, 0.0), 0.0f, 1e-6f);
  expectNear("MAN gain 0 %", effectiveGainDb(true, 0.0), -16.0f, 1e-6f);
  expectNear("MAN gain 100 %", effectiveGainDb(true, 100.0), 10.0f, 1e-6f);
  // L:A380X_WXR_GAIN = -9999 while no value is entered (WxrManualSettings.ts): the default 50 %.
  expectNear("MAN gain without an entry = the default 50 %", effectiveGainDb(true, kWxrNoEntry), 0.0f, 1e-6f);
}

static void testThresholdsForGain() {
  // CAL: the thresholds are unchanged.
  const RadarThresholds cal = radarThresholdsForGain(kCalibrated, 0.0f);
  expectNear("CAL green", cal.greenFromMmH, 0.7f, 1e-6f);
  expectNear("CAL red", cal.redFromMmH, 12.0f, 1e-5f);

  // Marshall-Palmer Z = 200 R^1.6: -16 dB of gain needs 16 dB more reflectivity = 10 times the rain rate.
  const RadarThresholds min = radarThresholdsForGain(kCalibrated, -16.0f);
  expectNear("MIN green x10", min.greenFromMmH, 7.0f, 1e-4f);
  expectNear("MIN yellow x10", min.yellowFromMmH, 40.0f, 1e-3f);
  expectNear("MIN red x10", min.redFromMmH, 120.0f, 1e-3f);
  // RDR-4000 Pilot's Manual: magenta (turbulence) is unaffected by gain changes.
  expectNear("MIN turbulence unchanged", min.turbulenceMmH, 20.0f, 1e-6f);

  // +10 dB: rates times 10^(-10/16) = 0.2371.
  const RadarThresholds max = radarThresholdsForGain(kCalibrated, 10.0f);
  expectNear("MAX green", max.greenFromMmH, 0.7f * 0.23714f, 1e-4f);
  expectNear("MAX red", max.redFromMmH, 12.0f * 0.23714f, 1e-3f);
  expectNear("MAX turbulence unchanged", max.turbulenceMmH, 20.0f, 1e-6f);

  // Safety First #22: reducing the gain turns red into yellow, yellow into green, green into nothing. A 10 mm/h cell
  // (yellow at CAL, below the 12 mm/h red) is green at -8 dB (yellow from 4 * 3.16 = 12.6 mm/h).
  const RadarThresholds reduced = radarThresholdsForGain(kCalibrated, -8.0f);
  expectTrue("10 mm/h is yellow at CAL", 10.0f >= cal.yellowFromMmH && 10.0f < cal.redFromMmH);
  expectTrue("10 mm/h is green at -8 dB", 10.0f >= reduced.greenFromMmH && 10.0f < reduced.yellowFromMmH);
}

static void testPrecipBands() {
  MaskBand bands[3];
  precipViewBands(radarThresholdsForGain(kCalibrated, 0.0f), 1e6f, bands);
  expectNear("precip band 0 ends at green", bands[0].upToMmH, 0.7f, 1e-6f);
  expectTrue("precip band 0 is empty", bands[0].r == 0.0f && bands[0].g == 0.0f && bands[0].b == 0.0f);
  expectNear("precip band 1 (G) ends at yellow", bands[1].upToMmH, 4.0f, 1e-6f);
  expectTrue("precip band 1 is G", bands[1].r == 0.0f && bands[1].g == 1.0f);
  expectNear("precip band 2 (R+G) is open", bands[2].upToMmH, 1e6f, 1.0f);
  expectTrue("precip band 2 is R+G", bands[2].r == 1.0f && bands[2].g == 1.0f && bands[2].b == 0.0f);
}

static void testHotBands() {
  MaskBand bands[3];
  // CAL: red (12) below turbulence (20): empty / red (G) / red + magenta (all three channels).
  hotViewBands(radarThresholdsForGain(kCalibrated, 0.0f), 1e6f, bands);
  expectNear("hot CAL band 0 ends at red", bands[0].upToMmH, 12.0f, 1e-5f);
  expectTrue("hot CAL band 1 is G (red only)", bands[1].r == 0.0f && bands[1].g == 1.0f && bands[1].b == 0.0f);
  expectNear("hot CAL band 1 ends at turbulence", bands[1].upToMmH, 20.0f, 1e-6f);
  expectTrue("hot CAL band 2 is R+G+B", bands[2].r == 1.0f && bands[2].g == 1.0f && bands[2].b == 1.0f);

  // Reduced gain: red (12 x 10 = 120) above turbulence (20). The engine needs the bands in rising order: empty up to the
  // turbulence, then magenta without red (R+B) up to the red, then both.
  hotViewBands(radarThresholdsForGain(kCalibrated, -16.0f), 1e6f, bands);
  expectNear("hot MIN band 0 ends at turbulence", bands[0].upToMmH, 20.0f, 1e-6f);
  expectTrue("hot MIN band 1 is R+B (magenta, no red)", bands[1].r == 1.0f && bands[1].g == 0.0f && bands[1].b == 1.0f);
  expectNear("hot MIN band 1 ends at red", bands[1].upToMmH, 120.0f, 1e-3f);
  expectTrue("hot MIN band 2 is R+G+B", bands[2].r == 1.0f && bands[2].g == 1.0f && bands[2].b == 1.0f);
  expectTrue("hot MIN bands rise", bands[0].upToMmH < bands[1].upToMmH && bands[1].upToMmH < bands[2].upToMmH);
}

static void testTiltGroundRange() {
  // Level or up tilt never reaches the ground.
  expectTrue("0 deg at FL350: no limit", std::isinf(tiltGroundRangeNm(35000.0f, 0.0f)));
  expectTrue("+3 deg on ground: no limit", std::isinf(tiltGroundRangeNm(20.0f, 3.0f)));
  // -1 deg from 35 000 ft: the earth (4/3 radius) curves away faster than the surface comes down.
  expectTrue("-1 deg at FL350: no limit", std::isinf(tiltGroundRangeNm(35000.0f, -1.0f)));
  // -5 deg from 35 000 ft: 4/3-earth solution r = Re (-tan t - sqrt(tan^2 t - 2h/Re)), about 72 NM (66 NM flat).
  expectNear("-5 deg at FL350", tiltGroundRangeNm(35000.0f, -5.0f), 72.4f, 0.5f);
  // -10 deg from 10 000 ft: about 9.6 NM (flat earth 9.35 NM).
  expectNear("-10 deg at 10000 ft", tiltGroundRangeNm(10000.0f, -10.0f), 9.40f, 0.1f);
  // On the ground any down tilt is in the ground at once.
  expectNear("-1 deg on the ground", tiltGroundRangeNm(0.0f, -1.0f), 0.0f, 1e-6f);
}

static void testDisplayRangeLimit() {
  // AUTO: no limit, whatever is stored.
  expectTrue("AUTO", std::isinf(wxDisplayRangeLimitNm(0.0, -10.0, 0.0, 10000.0f, 0.0f)));
  // TILT -10 deg at 10 000 ft above the ground.
  expectNear("TILT -10", wxDisplayRangeLimitNm(2.0, -10.0, 0.0, 10000.0f, 2000.0f), 9.40f, 0.1f);
  // TILT without an entry: as AUTO.
  expectTrue("TILT no entry", std::isinf(wxDisplayRangeLimitNm(2.0, kWxrNoEntry, 0.0, 10000.0f, 0.0f)));
  // ELEVN at or below the ground under the aircraft: the slice is in the ground.
  expectNear("ELEVN below ground", wxDisplayRangeLimitNm(1.0, 0.0, 1000.0, 3000.0f, 1500.0f), 0.0f, 1e-6f);
  expectTrue("ELEVN above ground", std::isinf(wxDisplayRangeLimitNm(1.0, 0.0, 12500.0, 3000.0f, 1500.0f)));
  expectTrue("ELEVN no entry", std::isinf(wxDisplayRangeLimitNm(1.0, 0.0, kWxrNoEntry, 3000.0f, 1500.0f)));
}

static void testRangeFraction() {
  expectNear("no limit = full picture", wxRangeFraction(std::numeric_limits<float>::infinity(), 80.0f), 1.0f, 1e-6f);
  expectNear("limit 20 NM of 80", wxRangeFraction(20.0f, 80.0f), 0.25f, 1e-6f);
  expectNear("limit beyond the range", wxRangeFraction(200.0f, 80.0f), 1.0f, 1e-6f);
  expectNear("limit 0", wxRangeFraction(0.0f, 80.0f), 0.0f, 1e-6f);
}

int main() {
  testGainPercentToDb();
  testEffectiveGain();
  testThresholdsForGain();
  testPrecipBands();
  testHotBands();
  testTiltGroundRange();
  testDisplayRangeLimit();
  testRangeFraction();
  if (failures == 0) {
    std::printf("wxr_controls_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
