#pragma once

#include <cmath>

// The AUTOLAND warning light of the glareshield. Pure logic, no MSFS SDK: tested natively by test/run_tests.sh.
//
// A320 FCOM DSC-22_30-80-30-10 AUTOLAND WARNING LIGHT (a320_fcom.txt l.32107-32127, the same list as l.32073-32088 plus
// the untimely flare):
//   "The AUTOLAND warning flashes when:
//   - At least one RA indicates a height below 200 ft, and
//   - At least one AP is engaged with LAND or FLARE mode on the FMA, and
//   - At least one of the following conditions occurs:
//     - The LOC deviation exceeds 1/4 dot and the aircraft is above 15 ft RA [...], or
//     - The GLIDE deviation exceeds 1 dot and the aircraft is above 100 ft RA [...], or
//     - Loss of LOC signal above 15 ft RA [...], or
//     - Loss of GLIDE signal above 100 ft RA [...], or
//     - The difference between both RA indications is greater than 15 ft RA, or
//     - The last autopilot disengages, or
//     - The FMGS detects a long flare, or
//     - The FMGS detects an untimely Flare condition.
//   The FMGS detects an untimely Flare condition when one radio altimeter is inoperative, and the time between LAND
//   engagement (measured radio height is below 400 ft) and FLARE condition (measured radio height is below 50 ft) is
//   lower than 2 s."
//
// Not modelled: the long flare (the A320 FCOM gives no duration for it).
class AutolandWarning {
 public:
  /// The data of one radio altimeter (the RA bus word)
  struct RadioAltimeter {
    /// The word is in normal operation: a failed RA, or one without computed data, is inoperative
    bool isValid = false;
    double heightFt = 0;
  };

  struct Inputs {
    RadioAltimeter radioAltimeters[2];
    /// The radio height of the aircraft for the deviation conditions (the simulator radio height, as before)
    double aircraftRadioHeightFt = 0;
    /// At least one AP is engaged
    bool apEngaged = false;
    /// The FMA vertical mode is LAND or FLARE
    bool landOrFlareMode = false;
    double locDeviationDeg = 0;
    bool locSignalValid = false;
    double glideDeviationDeg = 0;
    bool glideSignalValid = false;
  };

  /// 1/4 dot of LOC deviation, and 1 dot of GLIDE deviation, in degrees (the values of the earlier logic)
  static constexpr double LOC_QUARTER_DOT_DEG = 0.2;
  static constexpr double GLIDE_ONE_DOT_DEG = 0.4;
  /// l.32122: "The difference between both RA indications is greater than 15 ft RA"
  static constexpr double RA_DISAGREE_FT = 15;
  /// l.32125-32127: LAND engagement below 400 ft, FLARE condition below 50 ft, untimely when lower than 2 s
  static constexpr double LAND_ENGAGEMENT_HEIGHT_FT = 400;
  static constexpr double FLARE_CONDITION_HEIGHT_FT = 50;
  static constexpr double UNTIMELY_FLARE_TIME_S = 2;

  /// @return the warning is on
  bool update(const Inputs& in, double deltaTimeS) {
    const RadioAltimeter& ra1 = in.radioAltimeters[0];
    const RadioAltimeter& ra2 = in.radioAltimeters[1];
    const bool oneRaInoperative = ra1.isValid != ra2.isValid;

    updateUntimelyFlareDetection(ra1.isValid ? ra1 : ra2, oneRaInoperative, deltaTimeS);

    const bool oneRaBelow200Ft = (ra1.isValid && ra1.heightFt < 200) || (ra2.isValid && ra2.heightFt < 200);
    // An inoperative RA indicates no height: it does not reset the warning
    const bool noRaBelow200Ft = !oneRaBelow200Ft && (ra1.isValid || ra2.isValid);

    if (oneRaBelow200Ft && in.apEngaged && in.landOrFlareMode) {
      armed = true;
    } else if (noRaBelow200Ft || !in.landOrFlareMode) {
      armed = false;
      triggered = false;
    }

    if (armed && !triggered) {
      const bool raDisagree = ra1.isValid && ra2.isValid && std::abs(ra1.heightFt - ra2.heightFt) > RA_DISAGREE_FT;
      const bool locCondition =
          in.aircraftRadioHeightFt > 15 && (std::abs(in.locDeviationDeg) > LOC_QUARTER_DOT_DEG || !in.locSignalValid);
      const bool glideCondition = in.aircraftRadioHeightFt > 100 &&
                                  (std::abs(in.glideDeviationDeg) > GLIDE_ONE_DOT_DEG || !in.glideSignalValid);
      if (!in.apEngaged || locCondition || glideCondition || raDisagree || untimelyFlare) {
        triggered = true;
      }
    }

    return triggered;
  }

  bool isOn() const { return triggered; }

 private:
  /// Time since the measured radio height went below 400 ft (LAND engagement), while it has not reached 50 ft
  void updateUntimelyFlareDetection(const RadioAltimeter& measured, bool oneRaInoperative, double deltaTimeS) {
    if (!measured.isValid || measured.heightFt >= LAND_ENGAGEMENT_HEIGHT_FT) {
      timeSinceLandEngagementS = -1;
      untimelyFlare = false;
      return;
    }
    if (timeSinceLandEngagementS < 0) {
      timeSinceLandEngagementS = 0;
      flareConditionReached = false;
    } else if (!flareConditionReached) {
      timeSinceLandEngagementS += deltaTimeS;
    }
    if (!flareConditionReached && measured.heightFt < FLARE_CONDITION_HEIGHT_FT) {
      flareConditionReached = true;
      untimelyFlare = oneRaInoperative && timeSinceLandEngagementS < UNTIMELY_FLARE_TIME_S;
    }
  }

  bool armed = false;
  bool triggered = false;
  /// < 0: the measured radio height is not below 400 ft
  double timeSinceLandEngagementS = -1;
  bool flareConditionReached = false;
  bool untimelyFlare = false;
};
