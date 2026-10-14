// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The A380X SURV system whose TAWS feeds the terrain on the ND and VD: pure logic (no MSFS dependency), tested natively
// by test/taws_system_test.cpp.

#pragma once

namespace ndwxr {

// The TAWS system (1 or 2, 0 for none) from L:A32NX_WXR_TAWS_SYS_SELECTED and L:A32NX_TAWS_SYS_IN_USE.
//
// A380 FCOM PRO-ABN SURV TAWS 1(2) FAULT (a380_fcom.txt l.166816-166824): after an automatic reconfiguration "WXR
// surveillance function is on SYS 1(2), TAWS surveillance function is on SYS 2(1)". The systems host decides it
// (TawsSystemInUse.ts, EfisTawsBridge.ts) and writes the TAWS system in use; until it has written it (0) the selected
// WXR/TAWS system provides the TAWS.
inline int tawsSystemForTerrain(double wxrTawsSelected, double tawsSystemInUse) {
  const int inUse = static_cast<int>(tawsSystemInUse);
  if (inUse == 1 || inUse == 2) {
    return inUse;
  }
  const int selected = static_cast<int>(wxrTawsSelected);
  return selected == 1 || selected == 2 ? selected : 0;
}

}  // namespace ndwxr
