// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the GLS deviations (fbw-common GlsReceiver.h): run test/run_tests.sh.

#include <cmath>
#include <cstdio>

#include "GlsReceiver.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double PI = 3.14159265358979323846;
static constexpr double FEET_PER_NM = 6076.12;
static constexpr double METRES_PER_NM = 1852;
static constexpr double EARTH_RADIUS_NM = 3440.065;
static constexpr double THRESHOLD_ELEVATION_FT = 1000;
static constexpr double RUNWAY_LENGTH_M = 3000;
static constexpr double GARP_BEYOND_STOP_END_M = 305;

static double degToRad(double degrees) {
  return degrees * PI / 180;
}

/// A runway heading 250 deg true at 50 N 8 E, 1000 ft threshold elevation, 3 deg path, 50 ft crossing height
static GlsApproachDefinition frankfurtLikeRunway() {
  GlsApproachDefinition approach;
  approach.valid = true;
  approach.thresholdLatitudeDeg = 50;
  approach.thresholdLongitudeDeg = 8;
  approach.thresholdAltitudeFt = THRESHOLD_ELEVATION_FT;
  approach.runwayLengthM = RUNWAY_LENGTH_M;
  approach.courseTrueDeg = 250;
  approach.gpaDeg = 3;
  approach.thresholdCrossingHeightFt = 50;
  return approach;
}

/// The point reached from the start along a great circle
static void destination(double latitudeDeg, double longitudeDeg, double bearingDeg, double distanceNm, double& latitude, double& longitude) {
  const double angularDistance = distanceNm / EARTH_RADIUS_NM;
  const double lat1 = degToRad(latitudeDeg);
  const double bearing = degToRad(bearingDeg);
  const double lat2 = std::asin(std::sin(lat1) * std::cos(angularDistance) + std::cos(lat1) * std::sin(angularDistance) * std::cos(bearing));
  const double lon2 = degToRad(longitudeDeg) + std::atan2(std::sin(bearing) * std::sin(angularDistance) * std::cos(lat1),
                                                         std::cos(angularDistance) - std::sin(lat1) * std::sin(lat2));
  latitude = lat2 * 180 / PI;
  longitude = lon2 * 180 / PI;
}

/// A position on the extended centreline this far before the threshold (negative: past it), offset to the right of the
/// course by the given NM
static void alongTheCourse(const GlsApproachDefinition& approach, double nmBeforeThreshold, double nmRight, double& latitude, double& longitude) {
  destination(approach.thresholdLatitudeDeg, approach.thresholdLongitudeDeg, approach.courseTrueDeg + 180, nmBeforeThreshold, latitude, longitude);
  if (nmRight != 0) {
    destination(latitude, longitude, approach.courseTrueDeg + 90, nmRight, latitude, longitude);
  }
}

static double onPathAltitudeFt(const GlsApproachDefinition& approach, double nmBeforeThreshold) {
  const double gpipNmPastThreshold = approach.thresholdCrossingHeightFt / std::tan(degToRad(approach.gpaDeg)) / FEET_PER_NM;
  return approach.thresholdAltitudeFt + (nmBeforeThreshold + gpipNmPastThreshold) * FEET_PER_NM * std::tan(degToRad(approach.gpaDeg));
}

static void zeroOnTheBeam() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  const double distances[] = {10, 1};
  for (const double nm : distances) {
    double latitude, longitude;
    alongTheCourse(approach, nm, 0, latitude, longitude);
    const GlsDeviations onBeam = GlsReceiver::compute(approach, latitude, longitude, onPathAltitudeFt(approach, nm));
    expect(onBeam.lateralValid && onBeam.verticalValid, "valid on the beam");
    expect(std::abs(onBeam.lateralDeviationDeg) < 0.005, "no lateral deviation on the course");
    expect(std::abs(onBeam.verticalDeviationDeg) < 0.005, "no vertical deviation on the path");
    expect(std::abs(onBeam.distanceToThresholdNm - nm) < 0.02, "distance to the threshold");
  }
}

// ILS scaling: the same angle at the same distance from the azimuth reference as a localizer at the far end
static void oneDegreeOffIsOneDegreeOfDeviation() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  const double garpFromThresholdNm = (RUNWAY_LENGTH_M + GARP_BEYOND_STOP_END_M) / METRES_PER_NM;
  const double fromGarpNm = 10;
  const double nmBeforeThreshold = fromGarpNm - garpFromThresholdNm;
  const double offsetNm = fromGarpNm * std::tan(degToRad(1));
  double latitude, longitude;
  alongTheCourse(approach, nmBeforeThreshold, -offsetNm, latitude, longitude);
  const GlsDeviations left = GlsReceiver::compute(approach, latitude, longitude, 5000);
  expect(left.lateralValid && std::abs(left.lateralDeviationDeg - 1) < 0.02, "1 deg left of the course gives +1 deg");
  alongTheCourse(approach, nmBeforeThreshold, offsetNm, latitude, longitude);
  const GlsDeviations right = GlsReceiver::compute(approach, latitude, longitude, 5000);
  expect(right.lateralValid && std::abs(right.lateralDeviationDeg + 1) < 0.02, "1 deg right of the course gives -1 deg");
}

// The ILS deviation signs: lateral positive when the beam is to the right of the aircraft, vertical positive above the
// beam
static void signsAsTheIlsDeviations() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  double latitude, longitude;
  alongTheCourse(approach, 8, -0.3, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, 5000).lateralDeviationDeg > 0.5, "left of the course: beam to the right");
  alongTheCourse(approach, 8, 0.3, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, 5000).lateralDeviationDeg < -0.5, "right of the course: beam to the left");

  alongTheCourse(approach, 8, 0, latitude, longitude);
  const double onPath = onPathAltitudeFt(approach, 8);
  const GlsDeviations high = GlsReceiver::compute(approach, latitude, longitude, onPath + 500);
  const GlsDeviations low = GlsReceiver::compute(approach, latitude, longitude, onPath - 500);
  expect(high.verticalDeviationDeg > 0.3, "above the path: positive");
  expect(low.verticalDeviationDeg < -0.3, "below the path: negative");
}

static void garpIsPastTheStopEnd() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  const double stopEndNm = RUNWAY_LENGTH_M / METRES_PER_NM;
  double latitude, longitude;
  // On the rollout, beyond the stop end but before the reference point: still a localizer
  alongTheCourse(approach, -(stopEndNm + 0.05), 0, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "lateral valid just past the stop end");
  alongTheCourse(approach, -(stopEndNm + 0.2), 0, latitude, longitude);
  expect(!GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "lateral invalid past the reference point");
  // Half way down the runway on the centreline
  alongTheCourse(approach, -(stopEndNm / 2), 0.002, latitude, longitude);
  const GlsDeviations rollout = GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT);
  expect(rollout.lateralValid && rollout.lateralDeviationDeg < 0, "lateral valid on the ground on the runway, right of the centreline");
}

static void verticalEndsAtTheGlidePathInterceptPoint() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  const double gpipNm = 50 / std::tan(degToRad(3)) / FEET_PER_NM;
  double latitude, longitude;
  alongTheCourse(approach, -(gpipNm - 0.02), 0, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT + 5).verticalValid, "vertical valid just before the intercept point");
  alongTheCourse(approach, -(gpipNm + 0.02), 0, latitude, longitude);
  const GlsDeviations past = GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT + 5);
  expect(!past.verticalValid, "vertical invalid past the intercept point");
  expect(past.lateralValid, "lateral stays valid past the intercept point");
  alongTheCourse(approach, 0, 0, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT + 50).verticalValid, "vertical valid over the threshold");
}

static void serviceVolumeEdges() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  double latitude, longitude;
  const auto validAt = [&](double distanceNm, double angleDeg) {
    destination(approach.thresholdLatitudeDeg, approach.thresholdLongitudeDeg, approach.courseTrueDeg + 180 + angleDeg, distanceNm, latitude, longitude);
    const GlsDeviations deviations = GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT + distanceNm * 300);
    return deviations.lateralValid;
  };
  expect(validAt(10, 34), "34 deg at 10 NM is inside");
  expect(!validAt(10, 36), "36 deg at 10 NM is outside");
  expect(validAt(10, -34), "34 deg on the other side at 10 NM is inside");
  expect(!validAt(10, -36), "36 deg on the other side at 10 NM is outside");
  expect(validAt(18, 9), "9 deg at 18 NM is inside");
  expect(!validAt(18, 11), "11 deg at 18 NM is outside");
  expect(validAt(14, 34), "34 deg at 14 NM is inside");
  expect(!validAt(16, 34), "34 deg at 16 NM is outside");
  expect(validAt(19, 0), "19 NM on the course is inside");
  expect(!validAt(21, 0), "21 NM on the course is outside");
}

static void serviceVolumeHasWidthAtTheThreshold() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  const double offsetsM[] = {5, 10, 20};
  const double metresBeforeThreshold[] = {100, 30, 10, 1};
  for (const double offsetM : offsetsM) {
    for (const double beforeM : metresBeforeThreshold) {
      double latitude, longitude;
      alongTheCourse(approach, beforeM / METRES_PER_NM, offsetM / METRES_PER_NM, latitude, longitude);
      const double height = onPathAltitudeFt(approach, beforeM / METRES_PER_NM);
      const GlsDeviations deviations = GlsReceiver::compute(approach, latitude, longitude, height);
      expect(deviations.lateralValid && deviations.verticalValid, "a few metres off the centreline just before the threshold stays valid");
    }
  }
}

static void serviceVolumeIsNarrowAbeamTheRunway() {
  const GlsApproachDefinition approach = frankfurtLikeRunway();
  double latitude, longitude;
  alongTheCourse(approach, -0.1, 5, latitude, longitude);
  expect(!GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "5 NM to the side past the threshold is outside");
  alongTheCourse(approach, -0.1, 100, latitude, longitude);
  expect(!GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "100 NM to the side past the threshold is outside");
  const double halfRunwayNm = RUNWAY_LENGTH_M / 2 / METRES_PER_NM;
  alongTheCourse(approach, -halfRunwayNm, 300 / FEET_PER_NM, latitude, longitude);
  expect(GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "300 ft to the side on the runway is inside");
  alongTheCourse(approach, -halfRunwayNm, 600 / FEET_PER_NM, latitude, longitude);
  expect(!GlsReceiver::compute(approach, latitude, longitude, THRESHOLD_ELEVATION_FT).lateralValid, "600 ft to the side on the runway is outside");
}

static void trueAltitudeNotBarometric() {
  GlsApproachDefinition approach = frankfurtLikeRunway();
  double latitude, longitude;
  alongTheCourse(approach, 5, 0, latitude, longitude);
  const double onPath = onPathAltitudeFt(approach, 5);
  const GlsDeviations onPathResult = GlsReceiver::compute(approach, latitude, longitude, onPath);
  expect(std::abs(onPathResult.verticalDeviationDeg) < 0.005, "the true altitude on the path gives no deviation");
  // 100 ft lower than the path is the same deviation whatever the altimeter setting would have indicated
  const GlsDeviations lowResult = GlsReceiver::compute(approach, latitude, longitude, onPath - 100);
  const double expectedDeg = std::atan2(onPath - 100 - THRESHOLD_ELEVATION_FT, (5 + 50 / std::tan(degToRad(3)) / FEET_PER_NM) * FEET_PER_NM) * 180 / PI - 3;
  expect(std::abs(lowResult.verticalDeviationDeg - expectedDeg) < 0.005, "the deviation is the geometric angle above the threshold elevation");
  // A threshold at sea level: the same height above it gives the same deviation
  approach.thresholdAltitudeFt = 0;
  const GlsDeviations seaLevel = GlsReceiver::compute(approach, latitude, longitude, onPath - THRESHOLD_ELEVATION_FT);
  expect(std::abs(seaLevel.verticalDeviationDeg) < 0.005, "the deviation depends on the height above the threshold only");
}

static void noDeviationWithoutAnApproach() {
  GlsApproachDefinition approach = frankfurtLikeRunway();
  approach.valid = false;
  double latitude, longitude;
  alongTheCourse(approach, 10, 0, latitude, longitude);
  const GlsDeviations deviations = GlsReceiver::compute(approach, latitude, longitude, 3000);
  expect(!deviations.lateralValid && !deviations.verticalValid, "nothing without a valid approach");
}

// The autoland warning limits (200 ft window: LOC 0.2 deg above 15 ft, G/S 0.4 deg above 100 ft) judge the receiver that flies the
// approach: NAV 3 is detuned on a GLS, so its words must not decide.
static AutolandMonitorInputs detunedRadio() {
  AutolandMonitorInputs radio;
  radio.locValid = false;
  radio.locErrorDeg = 0;
  radio.gsValid = false;
  radio.gsErrorDeg = 0;
  return radio;
}

static GlsDeviations onTheBeam() {
  GlsDeviations deviations;
  deviations.lateralValid = true;
  deviations.verticalValid = true;
  return deviations;
}

static void autolandWarningOnAGls() {
  const AutolandMonitorInputs onBeam = GlsReceiver::autolandMonitorInputs(true, true, onTheBeam(), detunedRadio());
  expect(!GlsReceiver::exceedsAutolandLimits(150, onBeam), "on-beam GLS at 150 ft: no autoland warning");
  expect(!GlsReceiver::exceedsAutolandLimits(50, onBeam), "on-beam GLS at 50 ft: no autoland warning");

  GlsDeviations off = onTheBeam();
  off.lateralDeviationDeg = 0.3;
  const AutolandMonitorInputs offLoc = GlsReceiver::autolandMonitorInputs(true, true, off, detunedRadio());
  expect(GlsReceiver::exceedsAutolandLimits(50, offLoc), "0.3 deg GLS LOC error: autoland warning");

  GlsDeviations noLoc = onTheBeam();
  noLoc.lateralValid = false;
  const AutolandMonitorInputs invalidLoc = GlsReceiver::autolandMonitorInputs(true, true, noLoc, detunedRadio());
  expect(GlsReceiver::exceedsAutolandLimits(50, invalidLoc), "invalid GLS LOC above 15 ft: autoland warning");
  expect(!GlsReceiver::exceedsAutolandLimits(10, invalidLoc), "invalid GLS LOC below 15 ft: no autoland warning");

  GlsDeviations high = onTheBeam();
  high.verticalDeviationDeg = 0.5;
  expect(GlsReceiver::exceedsAutolandLimits(150, GlsReceiver::autolandMonitorInputs(true, true, high, detunedRadio())),
         "0.5 deg GLS G/S error above 100 ft: autoland warning");

  const AutolandMonitorInputs notReceived = GlsReceiver::autolandMonitorInputs(true, false, onTheBeam(), detunedRadio());
  expect(GlsReceiver::exceedsAutolandLimits(50, notReceived), "GLS selected but not received: autoland warning");
}

static void autolandWarningOnAnIls() {
  AutolandMonitorInputs radio;
  radio.locValid = true;
  radio.locErrorDeg = 0.1;
  radio.gsValid = true;
  radio.gsErrorDeg = -0.2;
  const AutolandMonitorInputs chosen = GlsReceiver::autolandMonitorInputs(false, false, onTheBeam(), radio);
  expect(chosen.locValid && chosen.gsValid && chosen.locErrorDeg == 0.1 && chosen.gsErrorDeg == -0.2,
         "ILS: the radio inputs pass through unchanged");
  expect(!GlsReceiver::exceedsAutolandLimits(50, chosen), "ILS within the limits: no autoland warning");
  radio.locErrorDeg = 0.25;
  expect(GlsReceiver::exceedsAutolandLimits(50, GlsReceiver::autolandMonitorInputs(false, false, onTheBeam(), radio)),
         "ILS 0.25 deg LOC error: autoland warning");
}

int main() {
  zeroOnTheBeam();
  oneDegreeOffIsOneDegreeOfDeviation();
  signsAsTheIlsDeviations();
  garpIsPastTheStopEnd();
  verticalEndsAtTheGlidePathInterceptPoint();
  serviceVolumeEdges();
  serviceVolumeHasWidthAtTheThreshold();
  serviceVolumeIsNarrowAbeamTheRunway();
  trueAltitudeNotBarometric();
  noDeviationWithoutAnApproach();
  autolandWarningOnAGls();
  autolandWarningOnAnIls();
  if (failures > 0) {
    std::printf("gls_receiver_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("gls_receiver_test: all checks passed\n");
  return 0;
}
