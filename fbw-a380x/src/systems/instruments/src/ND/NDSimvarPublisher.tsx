// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, SimVarDefinition, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  AdirsSimVarDefinitions,
  AdirsSimVars,
  SwitchingPanelSimVarsDefinitions,
  SwitchingPanelVSimVars,
} from '../MsfsAvionicsCommon/SimVarTypes';
import { UpdatableSimVarPublisher } from '../MsfsAvionicsCommon/UpdatableSimVarPublisher';

export type NDSimvars = AdirsSimVars &
  SwitchingPanelVSimVars & {
    elec: boolean;
    elecFo: boolean;
    potentiometerCaptain: number;
    potentiometerFo: number;
    ilsCourse: number;
    selectedHeading: Degrees;
    showSelectedHeading: boolean;
    absoluteTime: Seconds;
    wxrNdModeLeft: number;
    wxrNdModeRight: number;
    wxrGainMan: boolean;
    wxrGain: number;
    wxrElevnTiltMode: number;
    wxrElevn: number;
    wxrTilt: number;
    wxrBaroStdLeft: boolean;
    wxrBaroStdRight: boolean;
    kccuOnL: boolean;
    kccuOnR: boolean;
    kccuCcdOnL: boolean;
    kccuCcdOnR: boolean;
    /** The three radio altimeters (ARINC 429 words), for the amber radio altitude zone of the VD */
    radioAltitude1: number;
    radioAltitude2: number;
    radioAltitude3: number;
  };

export enum NDVars {
  elec = 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED',
  elecFo = 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED',
  potentiometerCaptain = 'LIGHT POTENTIOMETER:89',
  potentiometerFo = 'LIGHT POTENTIOMETER:91',
  ilsCourse = 'L:A32NX_FM_LS_COURSE',
  selectedHeading = 'L:A32NX_FCU_HEADING_SELECTED',
  showSelectedHeading = 'L:A320_FCU_SHOW_SELECTED_HEADING',
  absoluteTime = 'E:ABSOLUTE TIME',
  wxrNdModeLeft = 'L:A32NX_WXR_ND_L_MODE',
  wxrNdModeRight = 'L:A32NX_WXR_ND_R_MODE',
  wxrGainMan = 'L:A380X_WXR_GAIN_MAN',
  wxrGain = 'L:A380X_WXR_GAIN',
  wxrElevnTiltMode = 'L:A380X_WXR_ELEVN_TILT_MODE',
  wxrElevn = 'L:A380X_WXR_ELEVN',
  wxrTilt = 'L:A380X_WXR_TILT',
  wxrBaroStdLeft = 'L:A32NX_FCU_EFIS_L_DISPLAY_BARO_IS_STD',
  wxrBaroStdRight = 'L:A32NX_FCU_EFIS_R_DISPLAY_BARO_IS_STD',
  kccuOnL = 'L:A32NX_KCCU_L_KBD_ON_OFF',
  kccuOnR = 'L:A32NX_KCCU_R_KBD_ON_OFF',
  kccuCcdOnL = 'L:A32NX_KCCU_L_CCD_ON_OFF',
  kccuCcdOnR = 'L:A32NX_KCCU_R_CCD_ON_OFF',
  radioAltitude1 = 'L:A32NX_RA_1_RADIO_ALTITUDE',
  radioAltitude2 = 'L:A32NX_RA_2_RADIO_ALTITUDE',
  radioAltitude3 = 'L:A32NX_RA_3_RADIO_ALTITUDE',
}

/** A publisher to poll and publish nav/com simvars. */
export class NDSimvarPublisher extends UpdatableSimVarPublisher<NDSimvars> {
  private static simvars = new Map<keyof NDSimvars, SimVarDefinition>([
    ...AdirsSimVarDefinitions,
    ...SwitchingPanelSimVarsDefinitions,
    ['elec', { name: NDVars.elec, type: SimVarValueType.Bool }],
    ['elecFo', { name: NDVars.elecFo, type: SimVarValueType.Bool }],
    ['potentiometerCaptain', { name: NDVars.potentiometerCaptain, type: SimVarValueType.Number }],
    ['potentiometerFo', { name: NDVars.potentiometerFo, type: SimVarValueType.Number }],
    ['ilsCourse', { name: NDVars.ilsCourse, type: SimVarValueType.Number }],
    ['selectedHeading', { name: NDVars.selectedHeading, type: SimVarValueType.Degree }],
    ['showSelectedHeading', { name: NDVars.showSelectedHeading, type: SimVarValueType.Bool }],
    ['absoluteTime', { name: NDVars.absoluteTime, type: SimVarValueType.Seconds }],
    ['wxrNdModeLeft', { name: NDVars.wxrNdModeLeft, type: SimVarValueType.Number }],
    ['wxrNdModeRight', { name: NDVars.wxrNdModeRight, type: SimVarValueType.Number }],
    ['wxrGainMan', { name: NDVars.wxrGainMan, type: SimVarValueType.Bool }],
    ['wxrGain', { name: NDVars.wxrGain, type: SimVarValueType.Number }],
    ['wxrElevnTiltMode', { name: NDVars.wxrElevnTiltMode, type: SimVarValueType.Enum }],
    ['wxrElevn', { name: NDVars.wxrElevn, type: SimVarValueType.Number }],
    ['wxrTilt', { name: NDVars.wxrTilt, type: SimVarValueType.Number }],
    ['wxrBaroStdLeft', { name: NDVars.wxrBaroStdLeft, type: SimVarValueType.Bool }],
    ['wxrBaroStdRight', { name: NDVars.wxrBaroStdRight, type: SimVarValueType.Bool }],
    ['kccuOnL', { name: NDVars.kccuOnL, type: SimVarValueType.Bool }],
    ['kccuOnR', { name: NDVars.kccuOnR, type: SimVarValueType.Bool }],
    ['kccuCcdOnL', { name: NDVars.kccuCcdOnL, type: SimVarValueType.Bool }],
    ['kccuCcdOnR', { name: NDVars.kccuCcdOnR, type: SimVarValueType.Bool }],
    ['radioAltitude1', { name: NDVars.radioAltitude1, type: SimVarValueType.Number }],
    ['radioAltitude2', { name: NDVars.radioAltitude2, type: SimVarValueType.Number }],
    ['radioAltitude3', { name: NDVars.radioAltitude3, type: SimVarValueType.Number }],
  ]);

  public constructor(bus: EventBus) {
    super(NDSimvarPublisher.simvars, bus);
  }
}
