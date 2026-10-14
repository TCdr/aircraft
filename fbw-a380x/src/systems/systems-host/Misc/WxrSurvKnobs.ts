// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, HEvent, Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  WXR_MANUAL_SETTING_VARS,
  wxrManualDefaultOnSelection,
} from '../../instruments/src/MFD/pages/SURV/WxrManualSettings';

/** The two WXR knobs of the SURV panel with a function (VD AZIM is not part of this) */
export type WxrSurvKnob = 'GAIN' | 'ELEVN';

/** What the flight crew does with a knob: push, pull, turn clockwise (INC), turn anticlockwise (DEC) */
export type WxrSurvKnobAction = 'PUSH' | 'PULL' | 'INC' | 'DEC';

/** L:A380X_WXR_ELEVN_TILT_MODE (a380-simvars.md) */
export enum WxrElevnTiltMode {
  Auto = 0,
  Elevn = 1,
  Tilt = 2,
}

/** The WXR settings the knobs change, as the MFD SURV/CONTROLS page keeps them in L: variables */
export interface WxrSurvKnobState {
  /** WXR OFF (L:A380X_WXR_OFF) */
  wxrOff: boolean;
  /** MODE MAP (L:A380X_WXR_MODE_MAP) */
  modeMap: boolean;
  /** GAIN MAN (L:A380X_WXR_GAIN_MAN) */
  gainMan: boolean;
  /** The manual GAIN in %, WXR_NO_ENTRY when nothing is entered */
  gain: number;
  elevnTiltMode: WxrElevnTiltMode;
  /** The manual ELEVN in ft, WXR_NO_ENTRY when nothing is entered */
  elevn: number;
  /** The manual TILT in degrees, WXR_NO_ENTRY when nothing is entered */
  tilt: number;
  onGround: boolean;
  /** The aircraft altitude, for the default ELEVN value */
  altitudeFeet: number;
}

/** The settings a knob action changes (the others stay) */
export type WxrSurvKnobWrites = Partial<
  Pick<WxrSurvKnobState, 'gainMan' | 'gain' | 'elevnTiltMode' | 'elevn' | 'tilt'>
>;

/**
 * Design choices, the FCOM gives no knob resolution: per detent 1 % of GAIN, 100 ft of ELEVN and 0.1 degree of TILT,
 * the resolutions of the ND WXR messages ("GAIN 53%", "ELEVN 12500FT", "TILT -12.0", l.90086-90089)
 */
export const WXR_KNOB_STEPS = { gain: 1, elevn: 100, tilt: 0.1 };

/** The entry ranges of the SURV/CONTROLS page (DataEntryFormats WxrGainFormat, WxrElevationFormat, WxrTiltFormat) */
const RANGES = { gain: [0, 100], elevn: [0, 60000], tilt: [-15, 15] };

const clamp = (value: number, [min, max]: number[]) => Math.min(max, Math.max(min, value));

/**
 * The value of a manual setting, or its FCOM default when nothing is entered (wxrManualDefaultOnSelection).
 * @param setting the setting
 * @param stored the stored value
 * @param state the aircraft state
 * @returns the value
 */
function valueOrDefault(setting: 'gain' | 'elevn' | 'tilt', stored: number, state: WxrSurvKnobState): number {
  return wxrManualDefaultOnSelection(setting, stored, state) ?? stored;
}

/**
 * The ELEVN and GAIN knobs of the SURV panel (A380 FCOM DSC-34-20-30-20, a380_fcom.txt l.89693-89729):
 * - ELEVN knob: "When pushed, selects the AUTO mode", "When pulled: Selects the manual ELEVN mode - Selects the manual
 *   TILT mode, if the previous manual mode was ELEVN" (pulled two times for TILT, l.90092-90093), "When turned, adjusts
 *   the elevation or tilt value", with the default ELEVN value the current aircraft altitude and the default TILT +3.00
 *   degrees on ground, 0 in flight.
 * - GAIN knob: "When pushed, selects the AUTO GAIN mode", "When pulled, selects the manual GAIN mode", "When turned,
 *   adjusts the gain value in percentages", default 50 %.
 * The SURV/CONTROLS page follows them ("the ELEVN/TILT option list is automatically updated", "the GAIN button is
 * automatically updated"). With the WXR OFF the knobs do nothing (the option list is inhibited and the GAIN button is
 * not displayed, l.89820-89823); in MAP mode the ELEVN/TILT option list "is no longer available" (l.89943-89944).
 * Design choices: turning a knob changes the manual value only, in its manual mode; pulling the ELEVN knob in TILT
 * selects ELEVN again.
 * @param knob the knob
 * @param action what the flight crew does
 * @param state the WXR settings and the aircraft state
 * @returns the settings to change
 */
export function wxrSurvKnobWrites(
  knob: WxrSurvKnob,
  action: WxrSurvKnobAction,
  state: WxrSurvKnobState,
): WxrSurvKnobWrites {
  if (state.wxrOff) {
    return {};
  }
  const turn = action === 'INC' ? 1 : action === 'DEC' ? -1 : 0;

  if (knob === 'GAIN') {
    switch (action) {
      case 'PUSH':
        return { gainMan: false };
      case 'PULL':
        return { gainMan: true, gain: valueOrDefault('gain', state.gain, state) };
      default:
        return state.gainMan
          ? { gain: clamp(valueOrDefault('gain', state.gain, state) + turn * WXR_KNOB_STEPS.gain, RANGES.gain) }
          : {};
    }
  }

  if (state.modeMap) {
    return {};
  }
  switch (action) {
    case 'PUSH':
      return { elevnTiltMode: WxrElevnTiltMode.Auto };
    case 'PULL':
      return state.elevnTiltMode === WxrElevnTiltMode.Elevn
        ? { elevnTiltMode: WxrElevnTiltMode.Tilt, tilt: valueOrDefault('tilt', state.tilt, state) }
        : { elevnTiltMode: WxrElevnTiltMode.Elevn, elevn: valueOrDefault('elevn', state.elevn, state) };
    default:
      if (state.elevnTiltMode === WxrElevnTiltMode.Elevn) {
        return {
          elevn: clamp(valueOrDefault('elevn', state.elevn, state) + turn * WXR_KNOB_STEPS.elevn, RANGES.elevn),
        };
      }
      if (state.elevnTiltMode === WxrElevnTiltMode.Tilt) {
        // rounded to the 0.1 degree of the TILT entry (no floating point residue of the steps)
        const tilt = valueOrDefault('tilt', state.tilt, state) + turn * WXR_KNOB_STEPS.tilt;
        return { tilt: clamp(Math.round(tilt * 10) / 10, RANGES.tilt) };
      }
      return {};
  }
}

/** The H event of a knob action: A380X_WXR_<GAIN|ELEVN>_KNOB_<PUSH|PULL|INC|DEC> (both sides of the SURV panel) */
const KNOB_EVENT = /^A380X_WXR_(GAIN|ELEVN)_KNOB_(PUSH|PULL|INC|DEC)$/;

/** The SURV panel ELEVN and GAIN knobs: H events of the cockpit model -> the WXR settings L: variables */
export class WxrSurvKnobs implements Instrument {
  constructor(private readonly bus: EventBus) {}

  /** @inheritdoc */
  public init(): void {
    this.bus
      .getSubscriber<HEvent>()
      .on('hEvent')
      .handle((event) => {
        const match = KNOB_EVENT.exec(event);
        if (match) {
          this.apply(match[1] as WxrSurvKnob, match[2] as WxrSurvKnobAction);
        }
      });
  }

  /** @inheritdoc */
  public onUpdate(): void {}

  private apply(knob: WxrSurvKnob, action: WxrSurvKnobAction): void {
    const read = (name: string, type = SimVarValueType.Number) => SimVar.GetSimVarValue(name, type);
    // the ELEVN altitude reference of the SURV/CONTROLS page: STD (pressure altitude) or QNH (indicated)
    const baroStd = read('L:A32NX_FCU_EFIS_L_DISPLAY_BARO_IS_STD', SimVarValueType.Bool) > 0;
    const writes = wxrSurvKnobWrites(knob, action, {
      wxrOff: read('L:A380X_WXR_OFF', SimVarValueType.Bool) > 0,
      modeMap: read('L:A380X_WXR_MODE_MAP', SimVarValueType.Bool) > 0,
      gainMan: read('L:A380X_WXR_GAIN_MAN', SimVarValueType.Bool) > 0,
      gain: read(WXR_MANUAL_SETTING_VARS.gain),
      elevnTiltMode: read('L:A380X_WXR_ELEVN_TILT_MODE', SimVarValueType.Enum),
      elevn: read(WXR_MANUAL_SETTING_VARS.elevn),
      tilt: read(WXR_MANUAL_SETTING_VARS.tilt),
      onGround: SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0,
      altitudeFeet: SimVar.GetSimVarValue(baroStd ? 'PRESSURE ALTITUDE' : 'INDICATED ALTITUDE', 'feet'),
    });
    if (writes.gainMan !== undefined) {
      SimVar.SetSimVarValue('L:A380X_WXR_GAIN_MAN', SimVarValueType.Bool, writes.gainMan);
    }
    if (writes.elevnTiltMode !== undefined) {
      SimVar.SetSimVarValue('L:A380X_WXR_ELEVN_TILT_MODE', SimVarValueType.Enum, writes.elevnTiltMode);
    }
    if (writes.gain !== undefined) {
      SimVar.SetSimVarValue(WXR_MANUAL_SETTING_VARS.gain, SimVarValueType.Number, writes.gain);
    }
    if (writes.elevn !== undefined) {
      SimVar.SetSimVarValue(WXR_MANUAL_SETTING_VARS.elevn, SimVarValueType.Number, writes.elevn);
    }
    if (writes.tilt !== undefined) {
      SimVar.SetSimVarValue(WXR_MANUAL_SETTING_VARS.tilt, SimVarValueType.Number, writes.tilt);
    }
  }
}
