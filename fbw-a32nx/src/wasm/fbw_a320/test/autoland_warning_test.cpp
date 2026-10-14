// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the AUTOLAND warning light (src/fmgc/AutolandWarning.h): run test/run_tests.sh.
//
// A320 FCOM DSC-22_30-80-30-10 AUTOLAND WARNING LIGHT (a320_fcom.txt l.32107-32127): besides the AP loss and the LOC /
// GLIDE conditions, the light flashes when "the difference between both RA indications is greater than 15 ft RA", or
// when "the FMGS detects an untimely Flare condition [...] when one radio altimeter is inoperative, and the time
// between LAND engagement (measured radio height is below 400 ft) and FLARE condition (measured radio height is below
// 50 ft) is lower than 2 s".
// Built with -DWITHOUT_THE_FIX, the light uses the logic FlyByWireInterface.cpp had before (AP loss and LOC / GLIDE on
// the simulator radio height only): the RA disagree and untimely flare checks then fail.

#include <cstdio>

#include "../src/fmgc/AutolandWarning.h"

#ifdef WITHOUT_THE_FIX
// The logic of FlyByWireInterface.cpp before the fix (develop c33609d0c)
class Warning {
 public:
  bool update(const AutolandWarning::Inputs& in, double) {
    if (in.aircraftRadioHeightFt < 200 && in.apEngaged && in.landOrFlareMode) {
      latch = true;
    } else if (in.aircraftRadioHeightFt >= 200 || !in.landOrFlareMode) {
      latch = false;
      triggered = false;
    }
    if (latch && !triggered) {
      if (!in.apEngaged || (in.aircraftRadioHeightFt > 15 && (std::abs(in.locDeviationDeg) > 0.2 || !in.locSignalValid)) ||
          (in.aircraftRadioHeightFt > 100 && (std::abs(in.glideDeviationDeg) > 0.4 || !in.glideSignalValid))) {
        triggered = true;
      }
    }
    return triggered;
  }

 private:
  bool latch = false;
  bool triggered = false;
};
#else
using Warning = AutolandWarning;
#endif

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

/// An ILS approach with the AP engaged, on the beams: LAND mode, FLARE below 50 ft
struct Approach {
  Warning warning;
  AutolandWarning::Inputs in;
  bool warningOn = false;

  Approach() {
    in.apEngaged = true;
    in.landOrFlareMode = true;
    in.locSignalValid = true;
    in.glideSignalValid = true;
    in.radioAltimeters[0].isValid = true;
    in.radioAltimeters[1].isValid = true;
  }

  /// One frame at this aircraft radio height, both RAs reading it plus their offset
  void frame(double heightFt, double ra1OffsetFt = 0, double ra2OffsetFt = 0) {
    in.aircraftRadioHeightFt = heightFt;
    in.radioAltimeters[0].heightFt = heightFt + ra1OffsetFt;
    in.radioAltimeters[1].heightFt = heightFt + ra2OffsetFt;
    warningOn = warning.update(in, frameTime);
  }

  /// Descends from fromFt to toFt at this vertical speed (ft/s); stops and returns early when the warning comes on
  void descend(double fromFt, double toFt, double feetPerSecond, double ra1OffsetFt = 0, double ra2OffsetFt = 0) {
    for (double h = fromFt; h > toFt; h -= feetPerSecond * frameTime) {
      frame(h, ra1OffsetFt, ra2OffsetFt);
      if (warningOn) {
        return;
      }
    }
  }
};

static void normalAutolandHasNoWarning() {
  Approach approach;
  approach.descend(1000, 0, 12);
  expect(!approach.warningOn, "normal autoland: no AUTOLAND warning");
}

static void lastApDisengagingBelow200FtGivesTheWarning() {
  Approach approach;
  approach.descend(1000, 150, 12);
  approach.in.apEngaged = false;
  approach.frame(149);
  expect(approach.warningOn, "AP disengaged below 200 ft: AUTOLAND warning");
}

static void raDisagreeAbove15FtGivesTheWarning() {
  Approach approach;
  // RA 2 reads 20 ft more than RA 1 (l.32122: "greater than 15 ft")
  approach.descend(1000, 0, 12, 0, 20);
  expect(approach.warningOn, "RA 1 and RA 2 20 ft apart below 200 ft: AUTOLAND warning");
}

static void raDifferenceOf10FtHasNoWarning() {
  Approach approach;
  approach.descend(1000, 0, 12, 0, 10);
  expect(!approach.warningOn, "RA 1 and RA 2 10 ft apart: no AUTOLAND warning");
}

static void untimelyFlareWithOneRaInoperativeGivesTheWarning() {
  Approach approach;
  approach.in.radioAltimeters[1].isValid = false;
  // The operative RA 1 jumps from 450 ft to 40 ft within 1 s while the aircraft is at 300 ft: LAND engagement (below
  // 400 ft) and FLARE condition (below 50 ft) less than 2 s apart
  approach.descend(1000, 450, 12);
  for (int i = 0; i < 20 && !approach.warningOn; i++) {
    const double measured = 450 - i * (410.0 / 20);
    approach.in.aircraftRadioHeightFt = 300;
    approach.in.radioAltimeters[0].heightFt = measured;
    approach.warningOn = approach.warning.update(approach.in, frameTime);
  }
  for (int i = 0; i < 10 && !approach.warningOn; i++) {
    approach.in.radioAltimeters[0].heightFt = 40;
    approach.warningOn = approach.warning.update(approach.in, frameTime);
  }
  expect(approach.warningOn, "one RA inoperative, LAND to FLARE in 1 s: AUTOLAND warning (untimely flare)");
}

static void normalFlareWithOneRaInoperativeHasNoWarning() {
  Approach approach;
  approach.in.radioAltimeters[1].isValid = false;
  approach.descend(1000, 0, 12);
  expect(!approach.warningOn, "one RA inoperative, LAND to FLARE in 29 s: no AUTOLAND warning");
}

static void fastFlareWithBothRasOperativeHasNoUntimelyFlare() {
  Approach approach;
  approach.descend(1000, 450, 12);
  for (int i = 0; i < 30 && !approach.warningOn; i++) {
    approach.frame(i < 20 ? 450 - i * (410.0 / 20) : 40);
  }
  expect(!approach.warningOn, "both RAs operative, LAND to FLARE in 1 s: no untimely flare");
}

static void inoperativeRaAloneDoesNotResetTheWarning() {
  Approach approach;
  approach.descend(1000, 150, 12);
  approach.in.apEngaged = false;
  approach.frame(149);
  approach.in.radioAltimeters[0].isValid = false;
  approach.in.radioAltimeters[1].isValid = false;
  approach.frame(148);
  expect(approach.warningOn, "both RAs lost after the warning: the warning stays");
}

int main() {
  normalAutolandHasNoWarning();
  lastApDisengagingBelow200FtGivesTheWarning();
  raDisagreeAbove15FtGivesTheWarning();
  raDifferenceOf10FtHasNoWarning();
  untimelyFlareWithOneRaInoperativeGivesTheWarning();
  normalFlareWithOneRaInoperativeHasNoWarning();
  fastFlareWithBothRasOperativeHasNoUntimelyFlare();
  inoperativeRaAloneDoesNotResetTheWarning();

  if (failures > 0) {
    std::printf("autoland_warning_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("autoland_warning_test: all checks passed\n");
  return 0;
}
