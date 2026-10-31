// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Arinc429SignStatusMatrix, Arinc429Word, EfisNdMode } from '@flybywiresim/fbw-sdk';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { A320WxrPanelEvents, GenericWxrEvents } from './types/GenericWxrEvents';
import { WxrModeLabel } from './WxrModeLabel';
import { A320WxrNdMode, A320WxrState, a320WxrIndications, isA320PwsScanningWithRadarOff } from './WxrA320Indications';

// The A32NX ND radar rows: MAN GAIN (cyan), the mode in cyan with MULTISCAN MAN and green in AUTO, PWS SCAN / WXR OFF,
// the MAN tilt row
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

// The PWS also operates with the radar OFF, on the ground with an engine running and some ground speed
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
  /** The label of the left ND with the A32NX rows, and the texts of its first, second and third row */
  function renderLabel(ndMode: EfisNdMode = EfisNdMode.ARC) {
    const bus = new EventBus();
    const container = document.createElement('div');
    FSComponent.render(<WxrModeLabel bus={bus} side="L" mode={Subject.create(ndMode)} a320Indications />, container);
    const publisher = bus.getPublisher<GenericWxrEvents & A320WxrPanelEvents>();
    const rows = () => Array.from(container.querySelectorAll('text')).map((text) => text.textContent?.trim());
    return { container, publisher, rows };
  }

  it('the ND label draws the rows of the radar panel state: gain, mode and tilt', () => {
    const { publisher, rows } = renderLabel();
    publisher.pub('wxrNdModeLeft', A320WxrNdMode.Wx, false, false);
    publisher.pub('wxrA320GainKnob', 0.5, false, false);
    publisher.pub('wxrA320MultiscanAuto', false, false, false);
    publisher.pub('wxrA320TiltKnob', -1.25, false, false);
    expect(rows()).toEqual(['MAN GAIN', 'WX', 'MAN -1.25°']);
  });

  it('the ND label shows PWS SCAN with the radar off from the radio height, engine and ground speed', () => {
    const { container, publisher, rows } = renderLabel();
    publisher.pub('wxrNdModeLeft', A320WxrNdMode.Off, false, false);
    expect(rows()).toEqual(['', 'WXR OFF', '']);

    publisher.pub('wxrA320PwsAuto', true, false, false);
    publisher.pub(
      'wxrA320RadioAltitude1',
      Arinc429Word.getRawWord(100, Arinc429SignStatusMatrix.NormalOperation),
      false,
      false,
    );
    publisher.pub('wxrA320Engine1State', 1, false, false);
    publisher.pub('wxrA320GroundSpeed', 40, false, false);
    expect(rows()).toEqual(['', 'PWS SCAN', '']);
    expect(container.querySelectorAll('text')[1].getAttribute('class')).toContain('Green');
  });

  it('the ND label is hidden in PLAN mode', () => {
    const { container, publisher } = renderLabel(EfisNdMode.PLAN);
    publisher.pub('wxrNdModeLeft', A320WxrNdMode.Wx, false, false);
    expect(container.querySelector('g')?.getAttribute('visibility')).toBe('hidden');
  });

  it('the A32NX ND draws the rows (ND.tsx and the A32NX instrument)', () => {
    const nd = readFileSync(resolve(__dirname, 'ND.tsx'), 'utf-8');
    expect(nd).toContain('a320Indications={this.props.a320WxrIndications}');
    const a32nxNd = readFileSync(
      resolve(__dirname, '../../../../../../fbw-a32nx/src/systems/instruments/src/ND/instrument.tsx'),
      'utf-8',
    );
    expect(a32nxNd).toMatch(/<NDComponent[\s\S]*a320WxrIndications[\s\S]*\/>/);
  });
});
