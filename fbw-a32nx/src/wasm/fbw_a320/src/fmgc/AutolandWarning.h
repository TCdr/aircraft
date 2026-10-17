#pragma once

#include <cmath>

// The AUTOLAND warning light of the glareshield. Pure logic, no MSFS SDK: tested natively by test/run_tests.sh.
//
// The light flashes when at least one RA indicates a height below 200 ft, at least one AP is engaged with LAND or FLARE
// mode on the FMA, and one of these conditions occurs:
//   - the LOC deviation exceeds 1/4 dot above 15 ft RA, or the GLIDE deviation exceeds 1 dot above 100 ft RA,
//   - the LOC signal is lost above 15 ft RA, or the GLIDE signal above 100 ft RA,
//   - both RA indications differ by more than 15 ft,
//   - the last AP disengages,
//   - the FMGS detects a long flare, or an untimely flare: one RA inoperative and less than 2 s between LAND
//     engagement (measured radio height below 400 ft) and the FLARE condition (measured radio height below 50 ft).
//
// Not modelled: the long flare (no published duration for it).
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
    /// The radio height of the aircraft for the deviation conditions (the simulator radio height)
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

  /// 1/4 dot of LOC deviation, and 1 dot of GLIDE deviation, in degrees
  static constexpr double LOC_QUARTER_DOT_DEG = 0.2;
  static constexpr double GLIDE_ONE_DOT_DEG = 0.4;
  /// The warning comes on when both RA indications differ by more than this
  static constexpr double RA_DISAGREE_FT = 15;
  /// Untimely flare: LAND engagement below 400 ft, FLARE condition below 50 ft, untimely when lower than 2 s
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
