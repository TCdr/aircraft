// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The A380X CDS display unit reconfiguration as seen by this gauge: pure logic (no MSFS dependency), tested natively
// by test/cds_display_test.cpp.
//
// The systems host writes which display each DU shows into L:A380X_CDS_{DU}_DU_DISPLAY (fbw-a380x
// shared/src/CdsReconfiguration.ts, A380 FCOM DSC-31-15-20): 0 = the DU's own display, else 1 PFD, 2 ND, 3 MFD,
// 4 EWD, 5 SD. When the ND DU shows the PFD (PFD DU lost, or PFD/ND pb), the PFD is a gauge stacked on the ND's
// panel.cfg block; this gauge's MapView image is always drawn over the HTML gauges, so it must draw nothing then.

#pragma once

namespace ndwxr {

// The value of L:A380X_CDS_{DU}_DU_DISPLAY for the ND (CdsDisplay.Nd).
constexpr double kCdsDisplayNd = 2.0;

// Whether the ND DU shows the ND, from its L:A380X_CDS_{DU}_DU_DISPLAY value (0 = its own display, the ND).
inline bool isNdShownOnNdDisplayUnit(double displayValue) {
  return displayValue == 0.0 || displayValue == kCdsDisplayNd;
}

}  // namespace ndwxr
