// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { EventBus, SimVarDefinition, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  AdirsSimVarDefinitions,
  AdirsSimVars,
  SwitchingPanelSimVarsDefinitions,
  SwitchingPanelVSimVars,
} from '../MsfsAvionicsCommon/SimVarTypes';
import { UpdatableSimVarPublisher } from '../MsfsAvionicsCommon/UpdatableSimVarPublisher';
import type { A320WxrPanelEvents } from '@flybywiresim/navigation-display';

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
  } & A320WxrPanelEvents;

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
  wxrA320GainKnob = 'L:A32NX_WXR_GAIN_KNOB',
  wxrA320MultiscanAuto = 'L:A32NX_RADAR_MULTISCAN_AUTO',
  wxrA320TiltKnob = 'L:A32NX_WXR_TILT_KNOB',
  wxrA320PwsAuto = 'L:A32NX_SWITCH_RADAR_PWS_Position',
  wxrA320RadioAltitude1 = 'L:A32NX_RA_1_RADIO_ALTITUDE',
  wxrA320RadioAltitude2 = 'L:A32NX_RA_2_RADIO_ALTITUDE',
  wxrA320Engine1State = 'L:A32NX_ENGINE_STATE:1',
  wxrA320Engine2State = 'L:A32NX_ENGINE_STATE:2',
  wxrA320GroundSpeed = 'A:GPS GROUND SPEED',
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
    ['wxrA320GainKnob', { name: NDVars.wxrA320GainKnob, type: SimVarValueType.Number }],
    ['wxrA320MultiscanAuto', { name: NDVars.wxrA320MultiscanAuto, type: SimVarValueType.Bool }],
    ['wxrA320TiltKnob', { name: NDVars.wxrA320TiltKnob, type: SimVarValueType.Number }],
    ['wxrA320PwsAuto', { name: NDVars.wxrA320PwsAuto, type: SimVarValueType.Bool }],
    ['wxrA320RadioAltitude1', { name: NDVars.wxrA320RadioAltitude1, type: SimVarValueType.Number }],
    ['wxrA320RadioAltitude2', { name: NDVars.wxrA320RadioAltitude2, type: SimVarValueType.Number }],
    ['wxrA320Engine1State', { name: NDVars.wxrA320Engine1State, type: SimVarValueType.Number }],
    ['wxrA320Engine2State', { name: NDVars.wxrA320Engine2State, type: SimVarValueType.Number }],
    ['wxrA320GroundSpeed', { name: NDVars.wxrA320GroundSpeed, type: SimVarValueType.Knots }],
  ]);

  public constructor(bus: EventBus) {
    super(NDSimvarPublisher.simvars, bus);
  }
}
