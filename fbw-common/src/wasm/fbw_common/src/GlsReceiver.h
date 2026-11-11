#pragma once

#include <cmath>

#include "ReceiverGeometry.h"

/// The GLS procedure the FMS uploads, from the sim runway record and the charted slope and crossing height.
struct GlsApproachDefinition {
  bool valid = false;
  /// The channel the ground station broadcasts: an MMR only receives it when set to the same one
  int channel = 0;
  double thresholdLatitudeDeg = 0;
  double thresholdLongitudeDeg = 0;
  /// True altitude of the threshold, ft MSL
  double thresholdAltitudeFt = 0;
  double runwayLengthM = 0;
  double courseTrueDeg = 0;
  /// Positive downwards path angle, deg
  double gpaDeg = 0;
  double thresholdCrossingHeightFt = 0;
};

struct GlsDeviations {
  /// The lateral deviation can be used: inside the service volume and before the azimuth reference point
  bool lateralValid = false;
  /// The vertical deviation can be used: inside the service volume and before the glide path intercept point
  bool verticalValid = false;
  /// Same sign as the localizer deviation of the ILS receiver: positive when the beam is to the right
  double lateralDeviationDeg = 0;
  /// Same sign as the glide slope deviation of the ILS receiver: positive above the beam
  double verticalDeviationDeg = 0;
  /// Horizontal distance to the threshold, NM
  double distanceToThresholdNm = 0;
};

/// What the flight guidance computers are told when the GLS is the guidance source instead of the ILS or FLS
struct GlsFmsGuidanceInputs {
  bool flsApproachActive = false;
  double locDistanceNm = 0;
  double unrealisticGsAngleDeg = 0;
};

/// The deviations and their validity as the autoland monitor judges them
struct AutolandMonitorInputs {
  bool locValid = false;
  double locErrorDeg = 0;
  bool gsValid = false;
  double gsErrorDeg = 0;
};

/// The LOC and G/S deviations a GBAS receiver computes from the GNSS position and the approach path data, scaled like ILS
/// deviations (degrees) so that the LOC and G/S guidance laws and the deviation scales use them unchanged.
class GlsReceiver {
 public:
  /// Design choice: the GBAS azimuth reference point lies this far beyond the stop end of the runway, like the
  /// localizer antenna of an ILS, m
  static constexpr double AZIMUTH_REFERENCE_BEYOND_STOP_END_M = 305;

  /// Design choice: the service volume as published for GBAS, whatever the aircraft heading: it is 450 ft to each side
  /// of the threshold and widens from there, so that an aircraft a few metres off the centreline stays inside to the
  /// threshold. The wide sector reaches 15 NM and the narrow sector 20 NM.
  static constexpr double HALF_WIDTH_AT_THRESHOLD_FT = 450;
  static constexpr double WIDE_SECTOR_HALF_ANGLE_DEG = 35;
  static constexpr double WIDE_SECTOR_RANGE_NM = 15;
  static constexpr double NARROW_SECTOR_HALF_ANGLE_DEG = 10;
  static constexpr double NARROW_SECTOR_RANGE_NM = 20;

  /// The deviations stay invalid outside the service volume and past the references: the lateral ones past the azimuth
  /// reference point (so that the roll out follows the runway centreline), the vertical ones past the glide path
  /// intercept point, where the G/S is no longer used.
  /// @param aircraftTrueAltitudeFt geometric altitude: a GNSS path has no pressure or temperature error
  static GlsDeviations compute(const GlsApproachDefinition& approach,
                               double aircraftLatitudeDeg,
                               double aircraftLongitudeDeg,
                               double aircraftTrueAltitudeFt) {
    GlsDeviations result;
    if (!approach.valid || approach.gpaDeg <= 0 || approach.runwayLengthM <= 0) {
      return result;
    }

    // Position in the runway frame, NM from the threshold: along the course and to the right of it
    const double distanceNm = distanceToThresholdNm(approach, aircraftLatitudeDeg, aircraftLongitudeDeg);
    const double bearingFromThresholdDeg = bearingFromThreshold(approach, aircraftLatitudeDeg, aircraftLongitudeDeg);
    const double relativeBearingRad = ReceiverGeometry::degToRad(bearingFromThresholdDeg - approach.courseTrueDeg);
    const double alongNm = distanceNm * std::cos(relativeBearingRad);
    const double rightNm = distanceNm * std::sin(relativeBearingRad);

    result.distanceToThresholdNm = distanceNm;
    if (!isInServiceVolume(alongNm, rightNm)) {
      return result;
    }

    const double azimuthReferenceAlongNm = (approach.runwayLengthM + AZIMUTH_REFERENCE_BEYOND_STOP_END_M) / METRES_PER_NM;
    const double azimuthReferenceAheadNm = azimuthReferenceAlongNm - alongNm;
    if (azimuthReferenceAheadNm > 0) {
      result.lateralValid = true;
      result.lateralDeviationDeg = ReceiverGeometry::radToDeg(std::atan2(-rightNm, azimuthReferenceAheadNm));
    }

    // The glide path intercept point is where the path reaches the runway plane
    const double interceptPointAlongNm = approach.thresholdCrossingHeightFt / std::tan(ReceiverGeometry::degToRad(approach.gpaDeg)) / FEET_PER_NM;
    const double interceptPointAheadNm = interceptPointAlongNm - alongNm;
    if (interceptPointAheadNm > 0) {
      const double horizontalDistanceFt = std::hypot(interceptPointAheadNm, rightNm) * FEET_PER_NM;
      const double elevationAngleDeg = ReceiverGeometry::radToDeg(std::atan2(aircraftTrueAltitudeFt - approach.thresholdAltitudeFt, horizontalDistanceFt));
      result.verticalValid = true;
      result.verticalDeviationDeg = elevationAngleDeg - approach.gpaDeg;
    }
    return result;
  }

  /// An MMR in ILS mode has channel 0. A failed MMR or ground station, or a channel other than the one uplinked, gives no signal.
  static bool isReceiving(const GlsApproachDefinition& uplink, int mmrChannel, bool mmrFailed, bool groundStationFailed) {
    return uplink.valid && !groundStationFailed && !mmrFailed && mmrChannel > 0 && mmrChannel == uplink.channel;
  }

  /// An MMR set to a GLS channel sends the GLS words on its ILS bus in place of whatever the detuned ILS receiver gives, with
  /// the same signs and scaling, so that the LOC and G/S modes and the landing modes use them as they use an ILS. The channel
  /// goes into the frequency word, where the flight guidance compares the two MMRs. An MMR on a channel that receives nothing
  /// (no uplink, wrong channel, no ground station) still sends its GLS words, as no computed data, and a failed one as failure
  /// warning: neither must fall back to a stale ILS beam. An MMR in ILS mode keeps its words.
  template <typename IlsBus>
  static void applyToIlsBus(IlsBus& bus,
                            const GlsApproachDefinition& uplink,
                            int mmrChannel,
                            bool mmrFailed,
                            bool groundStationFailed,
                            const GlsDeviations& deviations) {
    if (mmrChannel <= 0) {
      return;
    }
    const bool receiving = isReceiving(uplink, mmrChannel, mmrFailed, groundStationFailed);
    // A failed MMR is a dead function, which the flight guidance must tell from a lost signal: it flies the other MMR then
    const unsigned int lateralSsm =
        mmrFailed ? SSM_FAILURE_WARNING : receiving && deviations.lateralValid ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
    const unsigned int verticalSsm =
        mmrFailed ? SSM_FAILURE_WARNING : receiving && deviations.verticalValid ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;

    bus.runway_heading_deg.SSM = lateralSsm;
    bus.runway_heading_deg.Data = uplink.valid ? static_cast<float>(uplink.courseTrueDeg) : 0.0F;
    bus.ils_frequency_mhz.SSM = SSM_NORMAL_OPERATION;
    bus.ils_frequency_mhz.Data = static_cast<float>(mmrChannel);
    bus.localizer_deviation_deg.SSM = lateralSsm;
    bus.localizer_deviation_deg.Data = lateralSsm == SSM_NORMAL_OPERATION ? static_cast<float>(deviations.lateralDeviationDeg) : 0.0F;
    bus.glideslope_deviation_deg.SSM = verticalSsm;
    bus.glideslope_deviation_deg.Data = verticalSsm == SSM_NORMAL_OPERATION ? static_cast<float>(deviations.verticalDeviationDeg) : 0.0F;
  }

  /// The ILS-DME distance and the glide slope angle of the outer loops come from the NAV 3 radio, which is detuned on a GLS
  /// approach, so the receiver supplies them. LAND is only blocked on an FLS approach.
  /// @param glsMode an MMR is set to a GLS channel, whether or not it receives: an FLS beam is never applied over it
  static GlsFmsGuidanceInputs fmsGuidanceInputs(bool glsMode,
                                                const GlsApproachDefinition& uplink,
                                                const GlsDeviations& deviations,
                                                bool flsBeamValid,
                                                double radioLocDistanceNm,
                                                double radioUnrealisticGsAngleDeg) {
    GlsFmsGuidanceInputs inputs;
    if (glsMode) {
      inputs.flsApproachActive = false;
      inputs.locDistanceNm = deviations.distanceToThresholdNm;
      inputs.unrealisticGsAngleDeg = uplink.valid ? -uplink.gpaDeg : 0;
    } else {
      inputs.flsApproachActive = flsBeamValid;
      inputs.locDistanceNm = radioLocDistanceNm;
      inputs.unrealisticGsAngleDeg = radioUnrealisticGsAngleDeg;
    }
    return inputs;
  }

  /// The autoland monitor watches the receiver that flies the approach. NAV 3 is detuned on a GLS, so with an MMR in GLS mode
  /// the GLS deviations and validity replace the radio ones; a GLS that is not received is invalid. The sim radio keeps receiving
  /// the ILS when the ILS receivers of the aircraft are dead, so on an ILS the signal is only valid with an operative receiver.
  static AutolandMonitorInputs autolandMonitorInputs(bool glsMode,
                                                     bool glsReceiving,
                                                     const GlsDeviations& deviations,
                                                     const AutolandMonitorInputs& radio,
                                                     bool ilsReceiverOperative) {
    if (!glsMode) {
      AutolandMonitorInputs inputs = radio;
      inputs.locValid = radio.locValid && ilsReceiverOperative;
      inputs.gsValid = radio.gsValid && ilsReceiverOperative;
      return inputs;
    }
    AutolandMonitorInputs inputs;
    inputs.locValid = glsReceiving && deviations.lateralValid;
    inputs.locErrorDeg = deviations.lateralDeviationDeg;
    inputs.gsValid = glsReceiving && deviations.verticalValid;
    inputs.gsErrorDeg = deviations.verticalDeviationDeg;
    return inputs;
  }

  /// The autoland warning limits: the localizer above 15 ft and the glide slope above 100 ft radio height
  static bool exceedsAutolandLimits(double radioHeightFt, const AutolandMonitorInputs& inputs) {
    return (radioHeightFt > 15 && (std::abs(inputs.locErrorDeg) > 0.2 || !inputs.locValid)) ||
           (radioHeightFt > 100 && (std::abs(inputs.gsErrorDeg) > 0.4 || !inputs.gsValid));
  }

 private:
  static constexpr unsigned int SSM_FAILURE_WARNING = ReceiverGeometry::SSM_FAILURE_WARNING;
  static constexpr unsigned int SSM_NO_COMPUTED_DATA = ReceiverGeometry::SSM_NO_COMPUTED_DATA;
  static constexpr unsigned int SSM_NORMAL_OPERATION = ReceiverGeometry::SSM_NORMAL_OPERATION;
  static constexpr double FEET_PER_NM = ReceiverGeometry::FEET_PER_NM;
  static constexpr double METRES_PER_NM = 1852;

  /// Over and past the threshold the volume keeps its width at the threshold, so that the roll out stays inside it and an
  /// aircraft far to the side of the runway does not.
  static bool isInServiceVolume(double alongNm, double rightNm) {
    const double halfWidthAtThresholdNm = HALF_WIDTH_AT_THRESHOLD_FT / FEET_PER_NM;
    if (alongNm >= 0) {
      return std::abs(rightNm) <= halfWidthAtThresholdNm;
    }
    const double distanceNm = std::hypot(alongNm, rightNm);
    const double beforeThresholdNm = -alongNm;
    const bool inWideSector = distanceNm <= WIDE_SECTOR_RANGE_NM &&
                              std::abs(rightNm) <= halfWidthAtThresholdNm + beforeThresholdNm * std::tan(ReceiverGeometry::degToRad(WIDE_SECTOR_HALF_ANGLE_DEG));
    const bool inNarrowSector = distanceNm <= NARROW_SECTOR_RANGE_NM &&
                                std::abs(rightNm) <= halfWidthAtThresholdNm + beforeThresholdNm * std::tan(ReceiverGeometry::degToRad(NARROW_SECTOR_HALF_ANGLE_DEG));
    return inWideSector || inNarrowSector;
  }

  static double distanceToThresholdNm(const GlsApproachDefinition& approach, double latitudeDeg, double longitudeDeg) {
    return ReceiverGeometry::distanceNm(latitudeDeg, longitudeDeg, approach.thresholdLatitudeDeg, approach.thresholdLongitudeDeg);
  }

  static double bearingFromThreshold(const GlsApproachDefinition& approach, double latitudeDeg, double longitudeDeg) {
    return ReceiverGeometry::initialBearingDeg(approach.thresholdLatitudeDeg, approach.thresholdLongitudeDeg, latitudeDeg, longitudeDeg);
  }
};
