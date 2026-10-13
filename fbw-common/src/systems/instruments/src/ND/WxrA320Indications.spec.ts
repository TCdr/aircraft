// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A320WxrNdMode, A320WxrState, a320WxrIndications, isA320PwsScanningWithRadarOff } from './WxrA320Indications';

/*
 * A320 FCOM DSC-34-SURV-30-30 (2) Weather Radar Indication (a320_fcom.txt l.54752-54800): MAN GAIN (cyan), the mode
 * in cyan with MULTISCAN MAN and green in AUTO, PWS SCAN / WXR OFF, the MAN tilt row. Before, the A32NX ND only showed
 * the mode in green (or WXR OFF) whatever the GAIN knob and the MULTISCAN switch.
 */
const AUTO_CAL: A320WxrState = {
  ndMode: A320WxrNdMode.Wx,
  gainKnob: 0,
  multiscanAuto: true,
  tiltKnobDegrees: 0,
  pwsScanning: false,
};

describe('A32NX ND weather radar rows', () => {
  it('MULTISCAN AUTO, GAIN at CAL: the mode in green and nothing else', () => {
    expect(a320WxrIndications(AUTO_CAL)).toEqual({ gain: null, mode: { text: 'WX', colour: 'Green' }, tilt: null });
    expect(a320WxrIndications({ ...AUTO_CAL, ndMode: A320WxrNdMode.WxTurb }).mode?.text).toBe('WX+T');
    expect(a320WxrIndications({ ...AUTO_CAL, ndMode: A320WxrNdMode.Turb }).mode?.text).toBe('TURB');
    expect(a320WxrIndications({ ...AUTO_CAL, ndMode: A320WxrNdMode.Map }).mode?.text).toBe('MAP');
  });

  it('GAIN out of CAL: MAN GAIN in cyan on the 1st row', () => {
    expect(a320WxrIndications({ ...AUTO_CAL, gainKnob: -0.3 }).gain).toEqual({ text: 'MAN GAIN', colour: 'Cyan' });
    expect(a320WxrIndications({ ...AUTO_CAL, gainKnob: 1 }).gain).toEqual({ text: 'MAN GAIN', colour: 'Cyan' });
    // the knob back at CAL after steps of 0.1 (rounding errors)
    expect(a320WxrIndications({ ...AUTO_CAL, gainKnob: 1e-9 }).gain).toBeNull();
  });

  it('MULTISCAN MAN: the mode in cyan and the MAN tilt in cyan, in degrees and quarters', () => {
    const rows = a320WxrIndications({ ...AUTO_CAL, multiscanAuto: false, tiltKnobDegrees: -1.25 });
    expect(rows.mode).toEqual({ text: 'WX', colour: 'Cyan' });
    expect(rows.tilt).toEqual({ text: 'MAN -1.25°', colour: 'Cyan' });
    expect(a320WxrIndications({ ...AUTO_CAL, multiscanAuto: false, tiltKnobDegrees: 2 }).tilt?.text).toBe('MAN +2.00°');
    expect(a320WxrIndications({ ...AUTO_CAL, multiscanAuto: false }).tilt?.text).toBe('MAN +0.00°');
  });

  it('MULTISCAN AUTO: no tilt row (MSFS has no multiscan beams to average)', () => {
    expect(a320WxrIndications({ ...AUTO_CAL, tiltKnobDegrees: -3 }).tilt).toBeNull();
  });

  it('radar switched off: WXR OFF in white only, or PWS SCAN in green while the PWS scans', () => {
    const off = { ...AUTO_CAL, ndMode: A320WxrNdMode.Off, gainKnob: 0.5, multiscanAuto: false };
    expect(a320WxrIndications(off)).toEqual({ gain: null, mode: { text: 'WXR OFF', colour: 'White' }, tilt: null });
    expect(a320WxrIndications({ ...off, pwsScanning: true }).mode).toEqual({ text: 'PWS SCAN', colour: 'Green' });
  });

  it('nothing while the ND shows no radar (terrain, PLAN)', () => {
    expect(a320WxrIndications({ ...AUTO_CAL, ndMode: A320WxrNdMode.None, pwsScanning: true })).toEqual({
      gain: null,
      mode: null,
      tilt: null,
    });
  });
});

/* A320 FCOM DSC-34-SURV-30-20 (a320_fcom.txt l.54208-54215): the PWS operates with the radar OFF when ... */
describe('A32NX PWS scanning with the radar off', () => {
  it('PWS AUTO, below 2 300 ft RA, an engine running, above 30 kt', () => {
    expect(isA320PwsScanningWithRadarOff(true, 0, true, 40)).toBe(true);
    expect(isA320PwsScanningWithRadarOff(true, 2299, true, 140)).toBe(true);
  });

  it('not with the PWS switch OFF, at or above 2 300 ft, without an engine, at 30 kt or below, without RA', () => {
    expect(isA320PwsScanningWithRadarOff(false, 0, true, 40)).toBe(false);
    expect(isA320PwsScanningWithRadarOff(true, 2300, true, 140)).toBe(false);
    expect(isA320PwsScanningWithRadarOff(true, 0, false, 40)).toBe(false);
    expect(isA320PwsScanningWithRadarOff(true, 0, true, 30)).toBe(false);
    expect(isA320PwsScanningWithRadarOff(true, null, true, 140)).toBe(false);
  });
});

describe('A32NX ND radar rows wiring', () => {
  it('the ND label draws the A32NX rows and the A32NX ND asks for them', () => {
    const label = readFileSync(resolve(__dirname, 'WxrModeLabel.tsx'), 'utf-8');
    expect(label).toContain('a320WxrIndications({');
    expect(label).toContain('isA320PwsScanningWithRadarOff(');
    const nd = readFileSync(resolve(__dirname, 'ND.tsx'), 'utf-8');
    expect(nd).toContain('a320Indications={this.props.a320WxrIndications}');
    const a32nxNd = readFileSync(
      resolve(__dirname, '../../../../../../fbw-a32nx/src/systems/instruments/src/ND/instrument.tsx'),
      'utf-8',
    );
    expect(a32nxNd).toMatch(/<NDComponent[\s\S]*a320WxrIndications[\s\S]*\/>/);
    const publisher = readFileSync(
      resolve(__dirname, '../../../../../../fbw-a32nx/src/systems/instruments/src/ND/NDSimvarPublisher.tsx'),
      'utf-8',
    );
    for (const variable of [
      'L:A32NX_WXR_GAIN_KNOB',
      'L:A32NX_RADAR_MULTISCAN_AUTO',
      'L:A32NX_WXR_TILT_KNOB',
      'L:A32NX_SWITCH_RADAR_PWS_Position',
    ]) {
      expect(publisher).toContain(variable);
    }
  });
});
