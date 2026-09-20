// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * The mode text the native weather radar (ndwxr) wants on the ND: 0 = none, 1 = WX, 2 = WX+T, 3 = TURB, 4 = MAP.
 * It is 0 unless the radar is selected and shown on that ND.
 */
export interface GenericWxrEvents {
  wxrNdModeLeft: number;
  wxrNdModeRight: number;
}
