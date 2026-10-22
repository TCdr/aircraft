// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_N1LIMITBLEEDCORRECTION_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_N1LIMITBLEEDCORRECTION_A32NX_HPP

/**
 * The bleed configuration the FADEC corrects the N1 limit for (no MSFS SDK dependency, tested natively by
 * test/n1_limit_bleed_correction_test.cpp).
 *
 * The Engine Interface Unit transmits the bleed configuration (packs, nacelle and wing anti-ice) to its FADEC. A FADEC without
 * the EIU data (ENG 1(2) EIU FAULT) no longer knows it and no longer corrects the N1 limit for the bleeds.
 */
namespace N1LimitBleedCorrection_A32NX {

/// The bleed consumers in the form ThrustLimits_A32NX::limitN1 takes them: 1 when on, 0 when off.
struct BleedConfiguration {
  int packs;
  int nacelleAntiIce;
  int wingAntiIce;
};

constexpr BleedConfiguration NO_BLEED_CORRECTION{0, 0, 0};

// Design choice: one N1 limit is computed for both engines, so an EIU lost on either engine removes the bleed corrections from
// the limit of both, as it gives both engines the approach idle.
inline BleedConfiguration correctedFor(const BleedConfiguration& bleeds, bool eiuDataLost) {
  return eiuDataLost ? NO_BLEED_CORRECTION : bleeds;
}

}  // namespace N1LimitBleedCorrection_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_N1LIMITBLEEDCORRECTION_A32NX_HPP
