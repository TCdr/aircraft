// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The weather radar indications of the A32NX ND (A320 FCOM DSC-34-SURV-30-30, the radar of the A32NX pedestal panel
 * with the GAIN and TILT knobs, MULTISCAN and GCS switches; a320_fcom.txt l.54752-54800). Pure logic, tested by
 * WxrA320Indications.spec.ts; WxrModeLabel draws the rows.
 */

/** The mode value the native radar publishes in L:A32NX_WXR_ND_{L,R}_MODE (see GenericWxrEvents). */
export enum A320WxrNdMode {
  None = 0,
  Wx = 1,
  WxTurb = 2,
  Turb = 3,
  Map = 4,
  Off = 5,
}

const MODE_TEXTS: Record<number, string> = {
  [A320WxrNdMode.Wx]: 'WX',
  [A320WxrNdMode.WxTurb]: 'WX+T',
  [A320WxrNdMode.Turb]: 'TURB',
  [A320WxrNdMode.Map]: 'MAP',
};

/** The GAIN knob is at CAL within this distance of 0 (same tolerance as the native radar, wxr_controls.h). */
const GAIN_KNOB_CAL_TOLERANCE = 0.01;

/**
 * PWS activation (A320 FCOM DSC-34-SURV-30-20 PREDICTIVE WINDSHEAR SYSTEM, a320_fcom.txt l.54208-54215): "operates
 * when the PWS switch is in the AUTO position, and the aircraft radio height is below 2 300 ft, and - Weather radar is
 * ON ..., or - Weather radar is OFF, and - At least one engine is running, and - Aircraft ground speed is greater than
 * 30 kt, or - Aircraft longitudinal acceleration is above a given threshold during at least 0.5 s."
 */
export const PWS_MAX_RADIO_HEIGHT_FT = 2300;
export const PWS_MIN_GROUND_SPEED_KT = 30;

export type A320WxrColour = 'Green' | 'Cyan' | 'White';

export interface A320WxrRow {
  text: string;
  colour: A320WxrColour;
}

/** What the A32NX radar panel and aircraft state give the ND. */
export interface A320WxrState {
  /** The native radar's mode value for this ND (A320WxrNdMode) */
  ndMode: number;
  /** L:A32NX_WXR_GAIN_KNOB: -1 (MIN) .. 0 (CAL) .. +1 (MAX) */
  gainKnob: number;
  /** L:A32NX_RADAR_MULTISCAN_AUTO */
  multiscanAuto: boolean;
  /** L:A32NX_WXR_TILT_KNOB, degrees */
  tiltKnobDegrees: number;
  /** The PWS function scans with the radar switched off (isA320PwsScanningWithRadarOff) */
  pwsScanning: boolean;
}

/** The rows on the right of the ND, top to bottom; null for an empty row. */
export interface A320WxrIndications {
  /** 1st row: Gain Mode */
  gain: A320WxrRow | null;
  /** 2nd row: Active Detection Mode */
  mode: A320WxrRow | null;
  /** 3rd row: Tilt Angle */
  tilt: A320WxrRow | null;
}

/**
 * Whether the PWS scans although the radar is switched off (the ND then shows PWS SCAN). Design choice: the
 * longitudinal acceleration case is not modelled (the FCOM gives no threshold), the ground speed one is.
 * @param pwsAuto the PWS switch is at AUTO
 * @param radioHeightFeet the radio height, null when no radio altimeter gives a valid one
 * @param anyEngineRunning at least one engine is running
 * @param groundSpeedKnots the ground speed
 */
export function isA320PwsScanningWithRadarOff(
  pwsAuto: boolean,
  radioHeightFeet: number | null,
  anyEngineRunning: boolean,
  groundSpeedKnots: number,
): boolean {
  return (
    pwsAuto &&
    radioHeightFeet !== null &&
    radioHeightFeet < PWS_MAX_RADIO_HEIGHT_FT &&
    anyEngineRunning &&
    groundSpeedKnots > PWS_MIN_GROUND_SPEED_KT
  );
}

/** The tilt angle "in degrees, and quarters of a degree" (l.54789-54790), signed. */
function formatTilt(tiltDegrees: number): string {
  const quarters = Math.round(tiltDegrees * 4) / 4;
  const sign = quarters < 0 ? '-' : '+';
  return `${sign}${Math.abs(quarters).toFixed(2)}°`;
}

/**
 * The A32NX ND radar rows (A320 FCOM DSC-34-SURV-30-30 (2) Weather Radar Indication, a320_fcom.txt l.54752-54800):
 * - 1st row: "MAN GAIN appears in cyan when the flight crew selects the manual gain mode" (GAIN knob out of CAL,
 *   l.54381-54386);
 * - 2nd row: WX, WX+T, TURB, MAP "In cyan if the manual mode is selected, In green if the automatic mode is selected"
 *   (the MULTISCAN switch), "PWS SCAN (only in green when the PWS function is active)", "WXR OFF (only in white)";
 *   l.54885-54888: "If only the PWS detection is active, the ND displays a PWS SCAN message";
 * - 3rd row: the tilt angle "In cyan, next to the "MAN" indication, when the flight crew sets the MULTISCAN sw to
 *   MAN". In AUTO the FCOM shows the average of the two multiscan beam tilts in green: MSFS has no beams to average, so
 *   the row stays empty (MSFS cannot tilt the radar either: the MAN value is the knob's, an indication only).
 * The 4th row (failure messages) needs a WXR failure, which the A32NX does not have.
 */
export function a320WxrIndications(state: A320WxrState): A320WxrIndications {
  const radarOn = state.ndMode >= A320WxrNdMode.Wx && state.ndMode <= A320WxrNdMode.Map;
  if (radarOn) {
    const manualGain = Math.abs(state.gainKnob) > GAIN_KNOB_CAL_TOLERANCE;
    return {
      gain: manualGain ? { text: 'MAN GAIN', colour: 'Cyan' } : null,
      mode: { text: MODE_TEXTS[state.ndMode], colour: state.multiscanAuto ? 'Green' : 'Cyan' },
      tilt: state.multiscanAuto ? null : { text: `MAN ${formatTilt(state.tiltKnobDegrees)}`, colour: 'Cyan' },
    };
  }
  if (state.ndMode === A320WxrNdMode.Off) {
    return {
      gain: null,
      mode: state.pwsScanning ? { text: 'PWS SCAN', colour: 'Green' } : { text: 'WXR OFF', colour: 'White' },
      tilt: null,
    };
  }
  return { gain: null, mode: null, tilt: null };
}
