#pragma once

#include <cmath>

/// The great-circle geometry and the ARINC 429 sign status values that the FLS and GLS receivers have in common.
namespace ReceiverGeometry {

constexpr unsigned int SSM_NO_COMPUTED_DATA = 0b01;
constexpr unsigned int SSM_NORMAL_OPERATION = 0b11;
constexpr double EARTH_RADIUS_NM = 3440.065;
constexpr double FEET_PER_NM = 6076.12;
constexpr double PI = 3.14159265358979323846;

inline double degToRad(double degrees) {
  return degrees * PI / 180;
}

inline double radToDeg(double radians) {
  return radians * 180 / PI;
}

/// Haversine distance from the first to the second position, NM
inline double distanceNm(double fromLatitudeDeg, double fromLongitudeDeg, double toLatitudeDeg, double toLongitudeDeg) {
  const double fromLatitude = degToRad(fromLatitudeDeg);
  const double toLatitude = degToRad(toLatitudeDeg);
  const double deltaLatitude = toLatitude - fromLatitude;
  const double deltaLongitude = degToRad(toLongitudeDeg - fromLongitudeDeg);
  const double haversine = std::sin(deltaLatitude / 2) * std::sin(deltaLatitude / 2) +
                           std::cos(fromLatitude) * std::cos(toLatitude) * std::sin(deltaLongitude / 2) * std::sin(deltaLongitude / 2);
  return EARTH_RADIUS_NM * 2 * std::atan2(std::sqrt(haversine), std::sqrt(1 - haversine));
}

/// Initial great-circle bearing from the first to the second position, deg in (-180, 180]
inline double initialBearingDeg(double fromLatitudeDeg, double fromLongitudeDeg, double toLatitudeDeg, double toLongitudeDeg) {
  const double fromLatitude = degToRad(fromLatitudeDeg);
  const double toLatitude = degToRad(toLatitudeDeg);
  const double deltaLongitude = degToRad(toLongitudeDeg - fromLongitudeDeg);
  const double y = std::sin(deltaLongitude) * std::cos(toLatitude);
  const double x = std::cos(fromLatitude) * std::sin(toLatitude) - std::sin(fromLatitude) * std::cos(toLatitude) * std::cos(deltaLongitude);
  return radToDeg(std::atan2(y, x));
}

}  // namespace ReceiverGeometry
