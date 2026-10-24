// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
const J2000_JULIAN_DAY = 2451545;
const DAYS_PER_JULIAN_CENTURY = 36525;
/** The sun's centre sits 0.833 degrees below the horizon at sunset: 0.5667 of refraction plus the 0.2667 solar radius */
const SUNSET_ALTITUDE_DEG = -0.833;
const MINUTES_PER_DEGREE_OF_LONGITUDE = 4;
const SOLAR_NOON_MINUTES_UTC = 720;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Equation of time in minutes and solar declination in degrees, for a time in Julian centuries since J2000 */
const solarPosition = (centuries: number): { equationOfTimeMin: number; declinationDeg: number } => {
  const meanLongitudeRad = toRad((280.46646 + centuries * (36000.76983 + centuries * 0.0003032)) % 360);
  const meanAnomalyRad = toRad(357.52911 + centuries * (35999.05029 - 0.0001537 * centuries));
  const eccentricity = 0.016708634 - centuries * (0.000042037 + 0.0000001267 * centuries);

  const equationOfCenterDeg =
    Math.sin(meanAnomalyRad) * (1.914602 - centuries * (0.004817 + 0.000014 * centuries)) +
    Math.sin(2 * meanAnomalyRad) * (0.019993 - 0.000101 * centuries) +
    Math.sin(3 * meanAnomalyRad) * 0.000289;
  const trueLongitudeDeg = toDeg(meanLongitudeRad) + equationOfCenterDeg;
  const apparentLongitudeRad = toRad(
    trueLongitudeDeg - 0.00569 - 0.00478 * Math.sin(toRad(125.04 - 1934.136 * centuries)),
  );

  const meanObliquityDeg =
    23 + (26 + (21.448 - centuries * (46.815 + centuries * (0.00059 - centuries * 0.001813))) / 60) / 60;
  const obliquityRad = toRad(meanObliquityDeg + 0.00256 * Math.cos(toRad(125.04 - 1934.136 * centuries)));

  const declinationDeg = toDeg(Math.asin(Math.sin(obliquityRad) * Math.sin(apparentLongitudeRad)));

  const y = Math.tan(obliquityRad / 2) ** 2;
  const equationOfTimeRad =
    y * Math.sin(2 * meanLongitudeRad) -
    2 * eccentricity * Math.sin(meanAnomalyRad) +
    4 * eccentricity * y * Math.sin(meanAnomalyRad) * Math.cos(2 * meanLongitudeRad) -
    0.5 * y * y * Math.sin(4 * meanLongitudeRad) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomalyRad);

  return { equationOfTimeMin: 4 * toDeg(equationOfTimeRad), declinationDeg };
};

const centuriesAt = (utcMs: number): number =>
  (utcMs / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY - J2000_JULIAN_DAY) / DAYS_PER_JULIAN_CENTURY;

/** Minutes after 00:00 UTC of the given day at which the sun sets, null when it does not set that day */
const sunsetMinutesUtc = (latDeg: number, longDeg: number, centuries: number): number | null => {
  const { equationOfTimeMin, declinationDeg } = solarPosition(centuries);
  const latRad = toRad(latDeg);
  const declinationRad = toRad(declinationDeg);

  const cosHourAngle =
    (Math.cos(toRad(90 - SUNSET_ALTITUDE_DEG)) - Math.sin(latRad) * Math.sin(declinationRad)) /
    (Math.cos(latRad) * Math.cos(declinationRad));
  if (cosHourAngle > 1 || cosHourAngle < -1) {
    return null;
  }

  const hourAngleDeg = toDeg(Math.acos(cosHourAngle));
  // The sun is west of the meridian at sunset, so its longitude offset is subtracted
  return SOLAR_NOON_MINUTES_UTC - MINUTES_PER_DEGREE_OF_LONGITUDE * (longDeg - hourAngleDeg) - equationOfTimeMin;
};

/**
 * Sunset at a position on the solar day that contains `dateUtc` at that longitude, so a western longitude does not get
 * the sunset of the day before. Null for polar day and polar night.
 */
export const sunsetUtc = (latDeg: number, longDeg: number, dateUtc: Date): Date | null => {
  const solarDayMs = dateUtc.getTime() + longDeg * (MS_PER_DAY / 360);
  const dayStartUtcMs = Math.floor(solarDayMs / MS_PER_DAY) * MS_PER_DAY;

  // The first pass uses the declination at midday UTC, the second refines it at the sunset time found
  const first = sunsetMinutesUtc(latDeg, longDeg, centuriesAt(dayStartUtcMs + MS_PER_DAY / 2));
  if (first === null) {
    return null;
  }
  const second = sunsetMinutesUtc(latDeg, longDeg, centuriesAt(dayStartUtcMs + first * MS_PER_MINUTE));
  if (second === null) {
    return null;
  }
  return new Date(dayStartUtcMs + second * MS_PER_MINUTE);
};
