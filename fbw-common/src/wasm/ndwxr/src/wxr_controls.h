// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The A380X weather radar's manual GAIN and ELEVN/TILT selections as seen by this gauge: pure logic (no MSFS
// dependency), tested natively by test/wxr_controls_test.cpp.
//
// What MSFS lets us change (MSFS_MapView.h): the radar views only take a list of rain rate bands (the colour table,
// fsMapViewSetWeatherRadarRainColors), a cone angle and a scan rate. The precipitation they paint has no height (the
// altitude range is ignored, measured 2026-09-19), and fsMapViewSetWeatherRadarTiltInRadians is not in the build
// container's SDK header and crashed the module on the vertical views (2026-09-19). So:
//  - GAIN moves the rain rate thresholds of the colour table: the same picture as the real receiver gain, which
//    moves the reflectivity each colour starts at;
//  - ELEVN/TILT can only change WHERE the weather is shown, not which cells: the part of the ND where the selected
//    slice (ELEVN) or tilted surface (TILT) is in the ground shows no weather (the radar's ground returns are removed:
//    "It also reduces the ground returns from the displayed weather, by using the terrain data provided by the TAWS
//    database", A380 FCOM DSC-34-20-30-10 P 2/12). A slice or tilt above the cell tops cannot be shown: MSFS gives no
//    cell tops.

#pragma once

#include <cmath>
#include <limits>

namespace ndwxr {

// The value of the WXR manual setting L:vars (L:A380X_WXR_GAIN, _TILT, _ELEVN) while nothing is entered
// (WXR_NO_ENTRY of the MFD's WxrManualSettings.ts).
constexpr double kWxrNoEntry = -9999.0;

// ---------------------------------------------------------------------------------------------------------------------
// GAIN
//
// A380 FCOM DSC-34-20-30-10 P 5/12: "The manual GAIN mode enables the flight crew to adjust sensitivity of the weather
// display on the ND." DSC-34-20-30-20 (GAIN knob): AUTO "The GAIN function is automatically set to the most
// appropriate setting", manual "adjusts the gain value in percentages", "The default GAIN value is 50 %".
// Honeywell IntuVue RDR-4000 Pilot's Manual (the A380's radar), Gain Control: "Rotating the GAIN Knob to the minimum
// (MIN) position reduces gain by approximately 16 dBZ. Rotating the GAIN Knob to the maximum (MAX) position increases
// gain by approximately 10 dBZ"; the calibrated (AUTO) position is the only one where the colours are the standard
// levels (green 20, yellow 30, red 40 dBZ); magenta (turbulence) is unaffected by gain changes.
// Airbus Safety First #22 (2016), Gain adjustment: reducing the gain, "most red areas slowly turn yellow, the yellow
// areas turn green and the green areas slowly disappear".
// ---------------------------------------------------------------------------------------------------------------------

constexpr float kGainMinDb = -16.0f;
constexpr float kGainMaxDb = 10.0f;
// Design choice (the FCOM gives the percentage but not its scale): 50 %, the FCOM default value, is the calibrated
// gain (as AUTO); 0 % is the RDR-4000 MIN and 100 % its MAX, linear in dB on each side.
constexpr float kGainCalibratedPercent = 50.0f;
// Marshall-Palmer Z = 200 R^1.6 (the relation the radar colour levels are given in: 20 dBZ = 0.65 mm/h, 40 dBZ =
// 11.5 mm/h, which the calibrated thresholds of constants.h follow): a reflectivity step of D dB is a rain rate
// factor of 10^(D / 16).
constexpr float kRainRateDbPerDecade = 16.0f;

// The gain in dB from the manual GAIN percentage of the SURV page (0..100 %, out of range values are clamped).
inline float gainDbFromPercent(float percent) {
  const float clamped = std::fmin(std::fmax(percent, 0.0f), 100.0f);
  if (clamped >= kGainCalibratedPercent) {
    return kGainMaxDb * (clamped - kGainCalibratedPercent) / (100.0f - kGainCalibratedPercent);
  }
  return kGainMinDb * (kGainCalibratedPercent - clamped) / kGainCalibratedPercent;
}

// The gain to apply: calibrated (0 dB) in AUTO (L:A380X_WXR_GAIN_MAN false) and in MAN without an entry (the default
// 50 %), else the entered percentage.
inline float effectiveGainDb(bool manual, double gainPercent) {
  if (!manual || gainPercent < 0.0) {
    return 0.0f;
  }
  return gainDbFromPercent(static_cast<float>(gainPercent));
}

// The rain rate thresholds (mm/h) of the radar views.
struct RadarThresholds {
  float greenFromMmH;
  float yellowFromMmH;
  float redFromMmH;
  float turbulenceMmH;
};

// The thresholds for a gain: more gain shows a colour from a lower rain rate. The turbulence threshold stands for the
// Doppler turbulence detection (see kTurbulenceRateMmH) and does not move with the gain (RDR-4000 Pilot's Manual).
inline RadarThresholds radarThresholdsForGain(const RadarThresholds& calibrated, float gainDb) {
  const float factor = std::pow(10.0f, -gainDb / kRainRateDbPerDecade);
  return RadarThresholds{calibrated.greenFromMmH * factor, calibrated.yellowFromMmH * factor, calibrated.redFromMmH * factor,
                         calibrated.turbulenceMmH};
}

// One band of a radar view's colour table: the 0/1 mask channels painted from the previous band's rate up to upToMmH
// (the SDK's FsRainRateColor: each entry's rate is its band's UPPER edge, see weather.cpp).
struct MaskBand {
  float r;
  float g;
  float b;
  float upToMmH;
};

// The precipitation view's table: R = rate >= yellow, G = rate >= green (the order cannot change with the gain).
inline void precipViewBands(const RadarThresholds& t, float topBandRate, MaskBand out[3]) {
  out[0] = MaskBand{0.0f, 0.0f, 0.0f, t.greenFromMmH};
  out[1] = MaskBand{0.0f, 1.0f, 0.0f, t.yellowFromMmH};
  out[2] = MaskBand{1.0f, 1.0f, 0.0f, topBandRate};
}

// The hot view's table: G = rate >= red (the red wipe), R and B = rate >= turbulence (the magenta). At the calibrated
// gain red starts below the turbulence; a reduced gain moves red above it, and the engine needs the bands in rising
// order, so the middle band is then magenta without red.
inline void hotViewBands(const RadarThresholds& t, float topBandRate, MaskBand out[3]) {
  if (t.redFromMmH <= t.turbulenceMmH) {
    out[0] = MaskBand{0.0f, 0.0f, 0.0f, t.redFromMmH};
    out[1] = MaskBand{0.0f, 1.0f, 0.0f, t.turbulenceMmH};
  } else {
    out[0] = MaskBand{0.0f, 0.0f, 0.0f, t.turbulenceMmH};
    out[1] = MaskBand{1.0f, 0.0f, 1.0f, t.redFromMmH};
  }
  out[2] = MaskBand{1.0f, 1.0f, 1.0f, topBandRate};
}

// ---------------------------------------------------------------------------------------------------------------------
// ELEVN / TILT
//
// A380 FCOM DSC-34-20-30-10 P 5/12: "The manual ELEVN mode enables the flight crew to analyze the weather at a selected
// altitude", "The manual TILT mode enables the flight crew to analyze the weather at a selected tilt angle", "Zero tilt
// value indicates the horizon as seen by the ADIRS", "the WXR extracts data from the 3-D buffer: At a selected
// altitude, or At a selected tilt angle. The WXR displays the extracted data on the ND." P 2/12: "The WXR takes into
// account the curvature of the earth".
// ---------------------------------------------------------------------------------------------------------------------

// L:A380X_WXR_ELEVN_TILT_MODE (MfdSurvControls.tsx WxrElevnTiltMode).
constexpr double kElevnTiltModeElevn = 1.0;
constexpr double kElevnTiltModeTilt = 2.0;

constexpr float kFeetPerNm = 6076.12f;
// Design choice: the earth radius scaled by 4/3, the usual radar engineering allowance for the standard atmosphere's
// refraction of the beam (the FCOM only says the curvature is taken into account).
constexpr float kEffectiveEarthRadiusNm = 3440.065f * 4.0f / 3.0f;
constexpr float kTiltDegToRad = 3.14159265f / 180.0f;

constexpr float kNoRangeLimit = std::numeric_limits<float>::infinity();

// The range (NM) at which a surface tilted tiltDeg from the horizon (negative = down) reaches the ground, from
// heightAboveGroundFeet above it. Design choice: the ground is taken level at the elevation under the aircraft (the
// radar's own ground returns are not modelled, and this gauge cannot read the terrain ahead back). The height of the
// surface above the curved ground at range r is h + r tan(t) + r^2 / (2 Re); its first zero is the limit. No limit
// when it never reaches the ground (level or up tilt, or a down tilt flatter than the earth's curvature).
inline float tiltGroundRangeNm(float heightAboveGroundFeet, float tiltDeg) {
  if (tiltDeg >= 0.0f) {
    return kNoRangeLimit;
  }
  const float heightNm = std::fmax(heightAboveGroundFeet, 0.0f) / kFeetPerNm;
  if (heightNm <= 0.0f) {
    return 0.0f;
  }
  const float tanTilt = std::tan(tiltDeg * kTiltDegToRad);
  const float discriminant = tanTilt * tanTilt - 2.0f * heightNm / kEffectiveEarthRadiusNm;
  if (discriminant < 0.0f) {
    return kNoRangeLimit;
  }
  return kEffectiveEarthRadiusNm * (-tanTilt - std::sqrt(discriminant));
}

// How far from the aircraft (NM) the ND shows the precipitation for the selected ELEVN/TILT mode, kNoRangeLimit for
// all of it: AUTO, or a manual mode without an entry, shows everything; TILT stops where the tilted surface reaches the
// ground; ELEVN shows nothing when the selected altitude is at or below the ground under the aircraft (the slice is in
// the ground), everything above it. elevnFeet and groundElevationFeet are in the same (barometric) reference.
inline float wxDisplayRangeLimitNm(double elevnTiltMode,
                                   double tiltDeg,
                                   double elevnFeet,
                                   float heightAboveGroundFeet,
                                   float groundElevationFeet) {
  if (elevnTiltMode == kElevnTiltModeTilt && tiltDeg != kWxrNoEntry) {
    return tiltGroundRangeNm(heightAboveGroundFeet, static_cast<float>(tiltDeg));
  }
  if (elevnTiltMode == kElevnTiltModeElevn && elevnFeet != kWxrNoEntry) {
    return static_cast<float>(elevnFeet) <= groundElevationFeet ? 0.0f : kNoRangeLimit;
  }
  return kNoRangeLimit;
}

// The limit as a fraction of the display's radius (rangeNmForMode: the ARC range, or half the ROSE range), at most 1.
inline float wxRangeFraction(float limitNm, float rangeNmForMode) {
  if (!(limitNm < rangeNmForMode) || rangeNmForMode <= 0.0f) {
    return 1.0f;
  }
  return std::fmax(limitNm, 0.0f) / rangeNmForMode;
}

}  // namespace ndwxr
