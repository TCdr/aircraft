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

/**
 * Manual radar settings of aircraft that have them (A380X SURV / CONTROLS page), shown with the mode text on the ND
 * (A380 FCOM DSC-34-20-30-20 P 17 "WXR MESSAGES"). Aircraft that do not publish them keep the automatic texts.
 */
export interface GenericWxrManualSettingsEvents {
  /** GAIN button set to MAN */
  wxrGainMan: boolean;
  /** Manual gain in percent */
  wxrGain: number;
  /** ELEVN/TILT option list: 0 = AUTO, 1 = ELEVN, 2 = TILT */
  wxrElevnTiltMode: number;
  /** Manual elevation in feet */
  wxrElevn: number;
  /** Manual tilt in degrees */
  wxrTilt: number;
  /** STD baro reference on the left (right) EFIS: the elevation is then a flight level */
  wxrBaroStdLeft: boolean;
  wxrBaroStdRight: boolean;
}
