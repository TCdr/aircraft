// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { EfisNdMode, EfisSide } from '@flybywiresim/fbw-sdk';

import { GenericWxrEvents, GenericWxrManualSettingsEvents } from './types/GenericWxrEvents';

export interface WxrModeLabelProps {
  bus: EventBus;
  side: EfisSide;
  mode: Subscribable<EfisNdMode>;
}

/** The radar's ND indications by the mode value the gauge publishes (see A32NX_WXR_ND_{L,R}_MODE). */
const LABELS = ['', 'WX', 'WX+T', 'TURB', 'MAP', 'WXR OFF'];
/** Mode 1: the WX display function */
const WX_MODE = 1;
/** Mode 5: the radar is switched off, shown in white (A320 FCOM DSC-34-SURV-30-30, "WXR OFF (only in white)"). */
const WXR_OFF_MODE = 5;
/** ELEVN/TILT option list values (A380X SURV / CONTROLS page) */
const ELEVN_MODE = 1;
const TILT_MODE = 2;
/** Value of a manual setting that was never entered */
const NO_ENTRY = -9999;
/** Height between two lines of FontSmall text */
const LINE_HEIGHT = 27;

/**
 * The weather radar mode (WX, WX+T, TURB, MAP) on the right of the map pages (ROSE and ARC), in green (the
 * colour of the automatic mode) while the radar is on, and "WXR OFF" in white while it is switched off.
 *
 * With manual radar settings (A380 FCOM DSC-34-20-30-20 P 17 "WXR MESSAGES"): "GAIN 53%" with the GAIN button at MAN,
 * "TILT -12.0°" or "ELEVN 12500FT" (FL with the STD baro reference) instead of WX with the ELEVN/TILT option list at
 * TILT or ELEVN, and WX only with the GAIN button and the ELEVN/TILT option list at AUTO. The manual settings are in
 * cyan, the colour of the manual modes (A320 FCOM DSC-34-SURV-30-30 P 10, same radar family; the A380 FCOM gives no
 * colour).
 */
export class WxrModeLabel extends DisplayComponent<WxrModeLabelProps> {
  private readonly sub = this.props.bus.getSubscriber<GenericWxrEvents & GenericWxrManualSettingsEvents>();

  private readonly radarMode = ConsumerSubject.create(
    this.props.side === 'L' ? this.sub.on('wxrNdModeLeft') : this.sub.on('wxrNdModeRight'),
    0,
  );

  private readonly gainMan = ConsumerSubject.create(this.sub.on('wxrGainMan'), false);

  private readonly gain = ConsumerSubject.create(this.sub.on('wxrGain'), NO_ENTRY);

  private readonly elevnTiltMode = ConsumerSubject.create(this.sub.on('wxrElevnTiltMode'), 0);

  private readonly elevn = ConsumerSubject.create(this.sub.on('wxrElevn'), NO_ENTRY);

  private readonly tilt = ConsumerSubject.create(this.sub.on('wxrTilt'), NO_ENTRY);

  private readonly baroStd = ConsumerSubject.create(
    this.props.side === 'L' ? this.sub.on('wxrBaroStdLeft') : this.sub.on('wxrBaroStdRight'),
    false,
  );

  private readonly visible = MappedSubject.create(
    ([radarMode, ndMode]) => radarMode !== 0 && ndMode !== EfisNdMode.PLAN,
    this.radarMode,
    this.props.mode,
  );

  /** The GAIN line, only with the radar on and the GAIN button at MAN */
  private readonly gainText = MappedSubject.create(
    ([radarMode, gainMan, gain]) =>
      radarMode !== WXR_OFF_MODE && gainMan ? `GAIN ${gain === NO_ENTRY ? '---' : gain.toFixed(0)}%` : '',
    this.radarMode,
    this.gainMan,
    this.gain,
  );

  /** The mode line: MAP, WXR OFF, the manual TILT or ELEVN, or WX in the automatic mode */
  private readonly modeText = MappedSubject.create(
    ([radarMode, gainMan, elevnTiltMode, elevn, tilt, baroStd]) => {
      if (radarMode !== WX_MODE) {
        return LABELS[radarMode] ?? '';
      }
      if (elevnTiltMode === TILT_MODE) {
        return tilt === NO_ENTRY ? 'TILT ---.-°' : `TILT ${tilt < 0 ? '-' : '+'}${Math.abs(tilt).toFixed(1)}°`;
      }
      if (elevnTiltMode === ELEVN_MODE) {
        if (elevn === NO_ENTRY) {
          return baroStd ? 'ELEVN FL---' : 'ELEVN -----FT';
        }
        return baroStd ? `ELEVN FL${(elevn / 100).toFixed(0).padStart(3, '0')}` : `ELEVN ${elevn.toFixed(0)}FT`;
      }
      return gainMan ? '' : LABELS[WX_MODE];
    },
    this.radarMode,
    this.gainMan,
    this.elevnTiltMode,
    this.elevn,
    this.tilt,
    this.baroStd,
  );

  private readonly modeTextIsManual = MappedSubject.create(
    ([radarMode, elevnTiltMode]) =>
      radarMode === WX_MODE && (elevnTiltMode === ELEVN_MODE || elevnTiltMode === TILT_MODE),
    this.radarMode,
    this.elevnTiltMode,
  );

  private readonly modeColorClass = MappedSubject.create(
    ([radarMode, manual]) =>
      radarMode === WXR_OFF_MODE ? 'White FontSmall' : manual ? 'Cyan FontSmall' : 'Green FontSmall',
    this.radarMode,
    this.modeTextIsManual,
  );

  /** The GAIN line sits above the mode line, or on it when the mode line is empty */
  private readonly gainY = this.modeText.map((text) => (text === '' ? 590 : 590 - LINE_HEIGHT));

  render(): VNode | null {
    return (
      <g visibility={this.visible.map((v) => (v ? 'inherit' : 'hidden'))}>
        <text x={744} y={this.gainY} class="Cyan FontSmall" text-anchor="end">
          {this.gainText}
        </text>
        <text x={744} y={590} class={this.modeColorClass} text-anchor="end">
          {this.modeText}
        </text>
      </g>
    );
  }
}
