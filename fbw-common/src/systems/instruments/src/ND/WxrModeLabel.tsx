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
import { Arinc429Word, EfisNdMode, EfisSide } from '@flybywiresim/fbw-sdk';

import { A320WxrPanelEvents, GenericWxrEvents, GenericWxrManualSettingsEvents } from './types/GenericWxrEvents';
import { A320WxrRow, a320WxrIndications, isA320PwsScanningWithRadarOff } from './WxrA320Indications';

export interface WxrModeLabelProps {
  bus: EventBus;
  side: EfisSide;
  mode: Subscribable<EfisNdMode>;
  /** The A32NX radar rows (WxrA320Indications.ts) instead of the A380X ones */
  a320Indications?: boolean;
}

/** The radar's ND indications by the mode value the gauge publishes (see A32NX_WXR_ND_{L,R}_MODE). */
const LABELS = ['', 'WX', 'WX+T', 'TURB', 'MAP', 'WXR OFF'];
/** Mode 1: the WX display function */
const WX_MODE = 1;
/** Mode 5: the radar is switched off, WXR OFF shown in white. */
const WXR_OFF_MODE = 5;
/** ELEVN/TILT option list values (A380X SURV / CONTROLS page) */
const ELEVN_MODE = 1;
const TILT_MODE = 2;
/** Value of a manual setting that was never entered */
const NO_ENTRY = -9999;
/** Height between two lines of FontSmall text */
const LINE_HEIGHT = 27;
/** The y of the mode line (the A32NX 2nd row) */
const MODE_LINE_Y = 590;
/** L:A32NX_ENGINE_STATE of a running engine */
const ENGINE_STATE_ON = 1;

/**
 * The weather radar mode (WX, WX+T, TURB, MAP) on the right of the map pages (ROSE and ARC), in green (the
 * colour of the automatic mode) while the radar is on, and "WXR OFF" in white while it is switched off.
 *
 * With manual radar settings: "GAIN 53%" with the GAIN button at MAN,
 * "TILT -12.0°" or "ELEVN 12500FT" (FL with the STD baro reference) instead of WX with the ELEVN/TILT option list at
 * TILT or ELEVN, and WX only with the GAIN button and the ELEVN/TILT option list at AUTO. The manual settings are in
 * cyan. Design choice: the A380 colour is not published, so this uses the colour of the manual modes of the A320 radar
 * (same radar family).
 *
 * The A32NX (a320Indications) shows the rows of its own radar panel instead: MAN GAIN, the mode in green (MULTISCAN
 * AUTO) or cyan (MAN), PWS SCAN or WXR OFF, and the MAN tilt (see a320WxrIndications).
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

  private readonly a320Sub = this.props.bus.getSubscriber<A320WxrPanelEvents>();

  /** A32NX: the radar is switched off and the PWS scans on its own (PWS SCAN instead of WXR OFF) */
  private readonly a320PwsScanning = MappedSubject.create(
    ([pwsAuto, ra1, ra2, engine1, engine2, groundSpeed]) => {
      const ra1Word = new Arinc429Word(ra1);
      const ra2Word = new Arinc429Word(ra2);
      const radioHeight = ra1Word.isNormalOperation()
        ? ra1Word.value
        : ra2Word.isNormalOperation()
          ? ra2Word.value
          : null;
      // (a Bool simvar reads 1, not true)
      return isA320PwsScanningWithRadarOff(
        !!pwsAuto,
        radioHeight,
        engine1 === ENGINE_STATE_ON || engine2 === ENGINE_STATE_ON,
        groundSpeed,
      );
    },
    ConsumerSubject.create(this.a320Sub.on('wxrA320PwsAuto'), false),
    ConsumerSubject.create(this.a320Sub.on('wxrA320RadioAltitude1'), 0),
    ConsumerSubject.create(this.a320Sub.on('wxrA320RadioAltitude2'), 0),
    ConsumerSubject.create(this.a320Sub.on('wxrA320Engine1State'), 0),
    ConsumerSubject.create(this.a320Sub.on('wxrA320Engine2State'), 0),
    ConsumerSubject.create(this.a320Sub.on('wxrA320GroundSpeed'), 0),
  );

  /** A32NX: the three radar rows (see a320WxrIndications) */
  private readonly a320Rows = MappedSubject.create(
    ([ndMode, gainKnob, multiscanAuto, tiltKnobDegrees, pwsScanning]) =>
      a320WxrIndications({ ndMode, gainKnob, multiscanAuto: !!multiscanAuto, tiltKnobDegrees, pwsScanning }),
    this.radarMode,
    ConsumerSubject.create(this.a320Sub.on('wxrA320GainKnob'), 0),
    ConsumerSubject.create(this.a320Sub.on('wxrA320MultiscanAuto'), true),
    ConsumerSubject.create(this.a320Sub.on('wxrA320TiltKnob'), 0),
    this.a320PwsScanning,
  );

  /** One A32NX row: its text and colour; y is fixed (1st row above the mode line, 3rd row below it) */
  private renderA320Row(row: Subscribable<A320WxrRow | null>, y: number): VNode {
    return (
      <text x={744} y={y} class={row.map((it) => `${it?.colour ?? 'Green'} FontSmall`)} text-anchor="end">
        {row.map((it) => it?.text ?? '')}
      </text>
    );
  }

  render(): VNode | null {
    if (this.props.a320Indications) {
      return (
        <g visibility={this.visible.map((v) => (v ? 'inherit' : 'hidden'))}>
          {this.renderA320Row(
            this.a320Rows.map((rows) => rows.gain),
            MODE_LINE_Y - LINE_HEIGHT,
          )}
          {this.renderA320Row(
            this.a320Rows.map((rows) => rows.mode),
            MODE_LINE_Y,
          )}
          {this.renderA320Row(
            this.a320Rows.map((rows) => rows.tilt),
            MODE_LINE_Y + LINE_HEIGHT,
          )}
        </g>
      );
    }
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
