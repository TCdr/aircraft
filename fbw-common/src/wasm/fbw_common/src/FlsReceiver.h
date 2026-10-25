#pragma once

#include <cmath>

/// The FLS beam the FMS defines for a non-precision approach.
struct FlsBeamDefinition {
  bool valid = false;
  double anchorLatitudeDeg = 0;
  double anchorLongitudeDeg = 0;
  /// Indicated altitude of the anchor point (threshold or end point + TCH), ft
  double anchorAltitudeFt = 0;
  double courseTrueDeg = 0;
  /// Positive downwards path angle, deg
  double slopeDeg = 0;
  /// Whether the lateral deviation comes from the beam (F-LOC) or the real localizer stays in use
  bool lateral = false;
};

struct FlsDeviations {
  bool valid = false;
  /// Same sign as the localizer deviation of the ILS receiver: positive when the beam is to the right
  double lateralDeviationDeg = 0;
  /// Same sign as the glide slope deviation of the ILS receiver: positive above the beam
  double verticalDeviationDeg = 0;
  double distanceToAnchorNm = 0;
};

/// The F-LOC and F-G/S deviations the MMR computes from the FMS position and the barometric altitude, scaled like ILS
/// deviations (degrees) so that the LOC and G/S guidance laws and the deviation scales use them unchanged.
class FlsReceiver {
 public:
  /// The FLS beam can be captured up to this distance from the anchor point
  static constexpr double MAX_CAPTURE_DISTANCE_NM = 100;

  /// On an FLS approach the MMR sends the FLS deviations in place of the ILS ones on its bus, so that the LOC and G/S
  /// modes fly the FLS beam: the vertical words always, the lateral words when F-LOC replaces the localizer.
  template <typename IlsBus>
  static void applyToIlsBus(IlsBus& bus, const FlsBeamDefinition& beam, const FlsDeviations& deviations) {
    if (!beam.valid) {
      return;
    }
    const unsigned int ssm = deviations.valid ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
    bus.glideslope_deviation_deg.SSM = ssm;
    bus.glideslope_deviation_deg.Data = static_cast<float>(deviations.verticalDeviationDeg);
    if (beam.lateral) {
      bus.runway_heading_deg.SSM = ssm;
      bus.runway_heading_deg.Data = static_cast<float>(beam.courseTrueDeg);
      bus.localizer_deviation_deg.SSM = ssm;
      bus.localizer_deviation_deg.Data = static_cast<float>(deviations.lateralDeviationDeg);
    }
  }

  static FlsDeviations compute(const FlsBeamDefinition& beam,
                               double aircraftLatitudeDeg,
                               double aircraftLongitudeDeg,
                               double aircraftAltitudeFt) {
    FlsDeviations result;
    if (!beam.valid) {
      return result;
    }

    const double aircraftLatitude = degToRad(aircraftLatitudeDeg);
    const double anchorLatitude = degToRad(beam.anchorLatitudeDeg);
    const double deltaLongitude = degToRad(beam.anchorLongitudeDeg - aircraftLongitudeDeg);
    const double deltaLatitude = anchorLatitude - aircraftLatitude;

    const double haversine = std::sin(deltaLatitude / 2) * std::sin(deltaLatitude / 2) +
                             std::cos(aircraftLatitude) * std::cos(anchorLatitude) * std::sin(deltaLongitude / 2) *
                                 std::sin(deltaLongitude / 2);
    const double distanceNm = EARTH_RADIUS_NM * 2 * std::atan2(std::sqrt(haversine), std::sqrt(1 - haversine));

    const double y = std::sin(deltaLongitude) * std::cos(anchorLatitude);
    const double x = std::cos(aircraftLatitude) * std::sin(anchorLatitude) -
                     std::sin(aircraftLatitude) * std::cos(anchorLatitude) * std::cos(deltaLongitude);
    const double bearingToAnchorDeg = normalise360(radToDeg(std::atan2(y, x)));

    const double lateralDeviationDeg = normalise180(bearingToAnchorDeg - beam.courseTrueDeg);
    // Past the anchor point there is no beam to follow
    if (distanceNm > MAX_CAPTURE_DISTANCE_NM || std::abs(lateralDeviationDeg) >= 90) {
      return result;
    }

    const double horizontalDistanceFt = distanceNm * FEET_PER_NM;
    const double elevationAngleDeg = radToDeg(std::atan2(aircraftAltitudeFt - beam.anchorAltitudeFt, horizontalDistanceFt));

    result.valid = true;
    result.lateralDeviationDeg = lateralDeviationDeg;
    result.verticalDeviationDeg = elevationAngleDeg - beam.slopeDeg;
    result.distanceToAnchorNm = distanceNm;
    return result;
  }

 private:
  static constexpr unsigned int SSM_NO_COMPUTED_DATA = 0b01;
  static constexpr unsigned int SSM_NORMAL_OPERATION = 0b11;
  static constexpr double EARTH_RADIUS_NM = 3440.065;
  static constexpr double FEET_PER_NM = 6076.12;
  static constexpr double PI = 3.14159265358979323846;

  static double degToRad(double degrees) { return degrees * PI / 180; }
  static double radToDeg(double radians) { return radians * 180 / PI; }
  static double normalise360(double degrees) { return std::fmod(std::fmod(degrees, 360) + 360, 360); }
  static double normalise180(double degrees) {
    const double normalised = normalise360(degrees);
    return normalised > 180 ? normalised - 360 : normalised;
  }
};
