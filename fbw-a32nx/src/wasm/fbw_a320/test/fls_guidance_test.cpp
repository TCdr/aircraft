// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the FLS deviations and of the ILS bus words they replace on an FLS approach (fbw-common
// FlsReceiver.h): run test/run_tests.sh.
//
// Built with -DWITHOUT_THE_FIX, the ILS bus keeps the ILS deviations on an FLS approach: the bus checks then fail.

#include <cmath>
#include <cstdio>

#include "FlsReceiver.h"
#include "FmgcComputer_types.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FEET_PER_NM = 6076.12;

/// A beam into a runway heading north at 45 N 0 E, anchor 50 ft above a 0 ft threshold, 3 deg slope
static FlsBeamDefinition northBeam() {
  FlsBeamDefinition beam;
  beam.valid = true;
  beam.anchorLatitudeDeg = 45;
  beam.anchorLongitudeDeg = 0;
  beam.anchorAltitudeFt = 50;
  beam.courseTrueDeg = 0;
  beam.slopeDeg = 3;
  beam.lateral = true;
  return beam;
}

/// The position this many NM south of the anchor, offset east by the given NM
static void southOfAnchor(double distanceNm, double eastNm, double& latitude, double& longitude) {
  latitude = 45 - distanceNm / 60;
  longitude = eastNm / (60 * std::cos(45 * M_PI / 180));
}

static FlsBeamDefinition beamAt(double anchorLatitudeDeg, double anchorLongitudeDeg, double courseTrueDeg) {
  FlsBeamDefinition beam = northBeam();
  beam.anchorLatitudeDeg = anchorLatitudeDeg;
  beam.anchorLongitudeDeg = anchorLongitudeDeg;
  beam.courseTrueDeg = courseTrueDeg;
  return beam;
}

/// The position this many NM before the anchor of a beam that runs along a meridian, offset to the right of the course by the
/// given NM. The longitude is between -180 and 180 degrees, as the sim gives it.
static void beforeAnchor(const FlsBeamDefinition& beam, double distanceNm, double rightNm, double& latitude, double& longitude) {
  const double northbound = std::cos(beam.courseTrueDeg * M_PI / 180) > 0 ? 1 : -1;
  latitude = beam.anchorLatitudeDeg - northbound * distanceNm / 60;
  longitude = std::remainder(beam.anchorLongitudeDeg + northbound * rightNm / (60 * std::cos(latitude * M_PI / 180)), 360.0);
}

static void deviationsOnTheBeam() {
  double latitude, longitude;
  southOfAnchor(10, 0, latitude, longitude);
  const double onSlopeAltitude = 50 + 10 * FEET_PER_NM * std::tan(3 * M_PI / 180);
  const FlsDeviations onBeam = FlsReceiver::compute(northBeam(), latitude, longitude, onSlopeAltitude);
  expect(onBeam.valid, "valid 10 NM before the anchor");
  expect(std::abs(onBeam.lateralDeviationDeg) < 0.01, "no lateral deviation on the course");
  expect(std::abs(onBeam.verticalDeviationDeg) < 0.01, "no vertical deviation on the slope");
  expect(std::abs(onBeam.distanceToAnchorNm - 10) < 0.05, "distance to the anchor");

  const FlsDeviations high = FlsReceiver::compute(northBeam(), latitude, longitude, onSlopeAltitude + 500);
  expect(high.verticalDeviationDeg > 0.3, "positive vertical deviation above the beam");
}

// The ILS deviation sign: positive when the beam is to the right of the aircraft (the PFD diamond moves right)
static void lateralSignAsTheIlsDeviation() {
  double latitude, longitude;
  southOfAnchor(8, 0.3, latitude, longitude);
  expect(FlsReceiver::compute(northBeam(), latitude, longitude, 2000).lateralDeviationDeg < -1,
         "east of a northbound beam the beam is to the left");
  southOfAnchor(8, -0.3, latitude, longitude);
  expect(FlsReceiver::compute(northBeam(), latitude, longitude, 2000).lateralDeviationDeg > 1,
         "west of a northbound beam the beam is to the right");
}

static void noBeamPastTheAnchorOrTooFar() {
  double latitude, longitude;
  southOfAnchor(-2, 0, latitude, longitude);
  expect(!FlsReceiver::compute(northBeam(), latitude, longitude, 500).valid, "no deviation past the anchor");
  southOfAnchor(101, 0, latitude, longitude);
  expect(!FlsReceiver::compute(northBeam(), latitude, longitude, 30000).valid, "no deviation beyond 100 NM");
  FlsBeamDefinition invalid = northBeam();
  invalid.valid = false;
  southOfAnchor(10, 0, latitude, longitude);
  expect(!FlsReceiver::compute(invalid, latitude, longitude, 3000).valid, "no deviation without a beam");
}

/// The same deviations in the southern hemisphere, on both sides of the antimeridian and for a southbound beam
static void theGeometryHoldsOnOtherBeams() {
  struct Case {
    const char* name;
    FlsBeamDefinition beam;
    /// The aircraft right of the course is on the other side of the 180 degree meridian than the anchor
    bool rightSideAcrossTheAntimeridian;
  };
  const Case cases[] = {
      {"southern hemisphere, northbound", beamAt(-33.9, 151.2, 0), false},
      {"southern hemisphere, southbound", beamAt(-33.9, 151.2, 180), false},
      {"northern hemisphere, southbound", beamAt(45, 0, 180), false},
      {"northbound at the antimeridian", beamAt(-17.7, 179.999, 0), true},
      {"southbound at the antimeridian", beamAt(65, -179.999, 180), true},
  };
  const double onSlopeAltitude = 50 + 10 * FEET_PER_NM * std::tan(3 * M_PI / 180);
  const double offsetDeg = std::atan2(0.3, 8.0) * 180 / M_PI;
  for (const Case& c : cases) {
    char what[160];
    double latitude, longitude;
    beforeAnchor(c.beam, 10, 0, latitude, longitude);
    const FlsDeviations onBeam = FlsReceiver::compute(c.beam, latitude, longitude, onSlopeAltitude);
    std::snprintf(what, sizeof(what), "%s: on the beam 10 NM before the anchor, valid with no deviation", c.name);
    expect(onBeam.valid && std::abs(onBeam.lateralDeviationDeg) < 0.01 && std::abs(onBeam.verticalDeviationDeg) < 0.01, what);
    std::snprintf(what, sizeof(what), "%s: 10 NM to the anchor", c.name);
    expect(std::abs(onBeam.distanceToAnchorNm - 10) < 0.05, what);

    beforeAnchor(c.beam, 8, 0.3, latitude, longitude);
    if (c.rightSideAcrossTheAntimeridian) {
      std::snprintf(what, sizeof(what), "%s: setup, the aircraft is on the other side of the antimeridian", c.name);
      expect(longitude * c.beam.anchorLongitudeDeg < 0, what);
    }
    const FlsDeviations right = FlsReceiver::compute(c.beam, latitude, longitude, 2000);
    std::snprintf(what, sizeof(what), "%s: right of the course the beam is to the left", c.name);
    expect(right.valid && std::abs(right.lateralDeviationDeg + offsetDeg) < 0.05, what);
    beforeAnchor(c.beam, 8, -0.3, latitude, longitude);
    const FlsDeviations left = FlsReceiver::compute(c.beam, latitude, longitude, 2000);
    std::snprintf(what, sizeof(what), "%s: left of the course the beam is to the right", c.name);
    expect(left.valid && std::abs(left.lateralDeviationDeg - offsetDeg) < 0.05, what);

    beforeAnchor(c.beam, -2, 0, latitude, longitude);
    std::snprintf(what, sizeof(what), "%s: no deviation past the anchor", c.name);
    expect(!FlsReceiver::compute(c.beam, latitude, longitude, 500).valid, what);
  }
}

/// The deviation is the angle between the course and the bearing to the anchor, also where the course wraps at north
static void theCourseWrapsAtNorth() {
  double latitude, longitude;
  southOfAnchor(8, 0, latitude, longitude);
  const FlsDeviations justWestOfNorth = FlsReceiver::compute(beamAt(45, 0, 359.5), latitude, longitude, 2000);
  expect(justWestOfNorth.valid && std::abs(justWestOfNorth.lateralDeviationDeg - 0.5) < 0.01,
         "course 359.5, due south of the anchor: the beam is 0.5 deg to the right");
  const FlsDeviations justEastOfNorth = FlsReceiver::compute(beamAt(45, 0, 0.5), latitude, longitude, 2000);
  expect(justEastOfNorth.valid && std::abs(justEastOfNorth.lateralDeviationDeg + 0.5) < 0.01,
         "course 0.5, due south of the anchor: the beam is 0.5 deg to the left");
  const FlsDeviations fullTurn = FlsReceiver::compute(beamAt(45, 0, 360), latitude, longitude, 2000);
  expect(fullTurn.valid && std::abs(fullTurn.lateralDeviationDeg) < 0.01, "course 360 is course 0");
}

static base_ils_bus ilsBusWithLocalizer() {
  base_ils_bus bus{};
  bus.runway_heading_deg.SSM = 3;
  bus.runway_heading_deg.Data = 90;
  bus.localizer_deviation_deg.SSM = 3;
  bus.localizer_deviation_deg.Data = 0.5F;
  bus.glideslope_deviation_deg.SSM = 1;
  bus.glideslope_deviation_deg.Data = 0;
  return bus;
}

static base_ils_bus busOnApproach(const FlsBeamDefinition& beam, const FlsDeviations& deviations) {
  base_ils_bus bus = ilsBusWithLocalizer();
#ifndef WITHOUT_THE_FIX
  FlsReceiver::applyToIlsBus(bus, beam, deviations);
#else
  (void)beam;
  (void)deviations;
#endif
  return bus;
}

static void ilsBusOnAnFlsApproach() {
  FlsDeviations deviations;
  deviations.valid = true;
  deviations.lateralDeviationDeg = -1.2;
  deviations.verticalDeviationDeg = 0.25;

  const base_ils_bus fLocAndFGs = busOnApproach(northBeam(), deviations);
  expect(fLocAndFGs.glideslope_deviation_deg.SSM == 3 && std::abs(fLocAndFGs.glideslope_deviation_deg.Data - 0.25) < 1e-6,
         "F-G/S deviation on the G/S word");
  expect(std::abs(fLocAndFGs.localizer_deviation_deg.Data + 1.2) < 1e-6, "F-LOC deviation on the LOC word");
  expect(fLocAndFGs.runway_heading_deg.Data == 0, "FLS course on the runway heading word");

  FlsBeamDefinition locAndFGsBeam = northBeam();
  locAndFGsBeam.lateral = false;
  const base_ils_bus locAndFGs = busOnApproach(locAndFGsBeam, deviations);
  expect(std::abs(locAndFGs.localizer_deviation_deg.Data - 0.5) < 1e-6 && locAndFGs.runway_heading_deg.Data == 90,
         "LOC approach: the localizer words stay on the real localizer");
  expect(std::abs(locAndFGs.glideslope_deviation_deg.Data - 0.25) < 1e-6, "LOC approach: F-G/S on the G/S word");

  FlsDeviations pastTheAnchor;
  const base_ils_bus lost = busOnApproach(northBeam(), pastTheAnchor);
  expect(lost.glideslope_deviation_deg.SSM == 1 && lost.localizer_deviation_deg.SSM == 1,
         "no computed data without FLS deviations");

  FlsBeamDefinition noBeam = northBeam();
  noBeam.valid = false;
  const base_ils_bus ils = busOnApproach(noBeam, deviations);
  expect(ils.localizer_deviation_deg.SSM == 3 && std::abs(ils.localizer_deviation_deg.Data - 0.5) < 1e-6 &&
             ils.glideslope_deviation_deg.SSM == 1,
         "without an FLS beam the ILS words are unchanged");
}

int main() {
  deviationsOnTheBeam();
  lateralSignAsTheIlsDeviation();
  noBeamPastTheAnchorOrTooFar();
  theGeometryHoldsOnOtherBeams();
  theCourseWrapsAtNorth();
  ilsBusOnAnFlsApproach();
  if (failures > 0) {
    std::printf("fls_guidance_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("fls_guidance_test: all checks passed\n");
  return 0;
}
