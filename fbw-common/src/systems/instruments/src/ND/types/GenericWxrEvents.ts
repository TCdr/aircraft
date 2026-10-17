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
 * Manual radar settings of aircraft that have them (A380X SURV / CONTROLS page), shown with the mode text on the ND.
 * Aircraft that do not publish them keep the automatic texts.
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

/**
 * The A32NX weather radar control panel and the inputs of the PWS activation, for the A32NX ND radar rows
 * (WxrA320Indications.ts). Only the A32NX publishes them.
 */
export interface A320WxrPanelEvents {
  /** L:A32NX_WXR_GAIN_KNOB: -1 (MIN) .. 0 (CAL) .. +1 (MAX) */
  wxrA320GainKnob: number;
  /** L:A32NX_RADAR_MULTISCAN_AUTO */
  wxrA320MultiscanAuto: boolean;
  /** L:A32NX_WXR_TILT_KNOB, degrees */
  wxrA320TiltKnob: number;
  /** L:A32NX_SWITCH_RADAR_PWS_Position: 1 = AUTO */
  wxrA320PwsAuto: boolean;
  /** Radio altimeters 1 and 2 (ARINC 429 words) */
  wxrA320RadioAltitude1: number;
  wxrA320RadioAltitude2: number;
  /** L:A32NX_ENGINE_STATE:1 and :2 (1 = ON) */
  wxrA320Engine1State: number;
  wxrA320Engine2State: number;
  /** Ground speed in knots */
  wxrA320GroundSpeed: number;
}
