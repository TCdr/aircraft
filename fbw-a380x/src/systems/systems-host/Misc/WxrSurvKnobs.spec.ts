// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus, HEvent } from '@microsoft/msfs-sdk';
import { WXR_NO_ENTRY } from '../../instruments/src/MFD/pages/SURV/WxrManualSettings';
import { WxrElevnTiltMode, WxrSurvKnobs, WxrSurvKnobState, wxrSurvKnobWrites } from './WxrSurvKnobs';

/** WXR on, AUTO everywhere, nothing entered, in flight at 12 340 ft */
const AUTO: WxrSurvKnobState = {
  wxrOff: false,
  modeMap: false,
  gainMan: false,
  gain: WXR_NO_ENTRY,
  elevnTiltMode: WxrElevnTiltMode.Auto,
  elevn: WXR_NO_ENTRY,
  tilt: WXR_NO_ENTRY,
  onGround: false,
  altitudeFeet: 12340,
};

describe('SURV panel GAIN knob', () => {
  it('pulled: manual GAIN, 50 % by default; pushed: AUTO GAIN', () => {
    expect(wxrSurvKnobWrites('GAIN', 'PULL', AUTO)).toEqual({ gainMan: true, gain: 50 });
    expect(wxrSurvKnobWrites('GAIN', 'PULL', { ...AUTO, gain: 70 })).toEqual({ gainMan: true, gain: 70 });
    expect(wxrSurvKnobWrites('GAIN', 'PUSH', { ...AUTO, gainMan: true, gain: 70 })).toEqual({ gainMan: false });
  });

  it('turned: adjusts the manual gain in percent, 0 to 100 %', () => {
    const man = { ...AUTO, gainMan: true, gain: 50 };
    expect(wxrSurvKnobWrites('GAIN', 'INC', man)).toEqual({ gain: 51 });
    expect(wxrSurvKnobWrites('GAIN', 'DEC', man)).toEqual({ gain: 49 });
    expect(wxrSurvKnobWrites('GAIN', 'INC', { ...man, gain: 100 })).toEqual({ gain: 100 });
    expect(wxrSurvKnobWrites('GAIN', 'DEC', { ...man, gain: 0 })).toEqual({ gain: 0 });
    // design choice: in AUTO GAIN turning does nothing
    expect(wxrSurvKnobWrites('GAIN', 'INC', AUTO)).toEqual({});
  });
});

describe('SURV panel ELEVN knob', () => {
  it('pulled once: manual ELEVN at the aircraft altitude; twice: manual TILT, 0 in flight, +3 on ground', () => {
    expect(wxrSurvKnobWrites('ELEVN', 'PULL', AUTO)).toEqual({ elevnTiltMode: WxrElevnTiltMode.Elevn, elevn: 12300 });
    const elevn = { ...AUTO, elevnTiltMode: WxrElevnTiltMode.Elevn, elevn: 12300 };
    expect(wxrSurvKnobWrites('ELEVN', 'PULL', elevn)).toEqual({ elevnTiltMode: WxrElevnTiltMode.Tilt, tilt: 0 });
    expect(wxrSurvKnobWrites('ELEVN', 'PULL', { ...elevn, onGround: true })).toEqual({
      elevnTiltMode: WxrElevnTiltMode.Tilt,
      tilt: 3,
    });
  });

  it('pushed: AUTO', () => {
    expect(wxrSurvKnobWrites('ELEVN', 'PUSH', { ...AUTO, elevnTiltMode: WxrElevnTiltMode.Tilt })).toEqual({
      elevnTiltMode: WxrElevnTiltMode.Auto,
    });
  });

  it('turned: adjusts the elevation (100 ft) or the tilt (0.1 degree), within the entry ranges', () => {
    const elevn = { ...AUTO, elevnTiltMode: WxrElevnTiltMode.Elevn, elevn: 12300 };
    expect(wxrSurvKnobWrites('ELEVN', 'INC', elevn)).toEqual({ elevn: 12400 });
    expect(wxrSurvKnobWrites('ELEVN', 'DEC', { ...elevn, elevn: 0 })).toEqual({ elevn: 0 });
    const tilt = { ...AUTO, elevnTiltMode: WxrElevnTiltMode.Tilt, tilt: -2.3 };
    expect(wxrSurvKnobWrites('ELEVN', 'DEC', tilt)).toEqual({ tilt: -2.4 });
    expect(wxrSurvKnobWrites('ELEVN', 'INC', { ...tilt, tilt: 15 })).toEqual({ tilt: 15 });
    expect(wxrSurvKnobWrites('ELEVN', 'INC', AUTO)).toEqual({});
  });

  it('does nothing in MAP mode (the ELEVN/TILT option list is not available)', () => {
    expect(wxrSurvKnobWrites('ELEVN', 'PULL', { ...AUTO, modeMap: true })).toEqual({});
  });
});

describe('SURV panel WXR knobs with the WXR OFF', () => {
  it('do nothing', () => {
    const off = { ...AUTO, wxrOff: true };
    expect(wxrSurvKnobWrites('GAIN', 'PULL', off)).toEqual({});
    expect(wxrSurvKnobWrites('ELEVN', 'PULL', off)).toEqual({});
  });
});

describe('SURV panel WXR knobs in the cockpit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the knob H events set the WXR L: variables the MFD SURV/CONTROLS page and the radar read', () => {
    const vars: Record<string, number> = {
      'L:A380X_WXR_GAIN': WXR_NO_ENTRY,
      'L:A380X_WXR_ELEVN': WXR_NO_ENTRY,
      'L:A380X_WXR_TILT': WXR_NO_ENTRY,
      'INDICATED ALTITUDE': 5000,
    };
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => vars[name] ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      vars[name] = Number(value);
      return Promise.resolve();
    });
    const bus = new EventBus();
    new WxrSurvKnobs(bus).init();
    const press = (event: string) => bus.getPublisher<HEvent>().pub('hEvent', event);

    press('A380X_WXR_GAIN_KNOB_PULL');
    press('A380X_WXR_GAIN_KNOB_INC');
    expect(vars['L:A380X_WXR_GAIN_MAN']).toBe(1);
    expect(vars['L:A380X_WXR_GAIN']).toBe(51);

    press('A380X_WXR_ELEVN_KNOB_PULL');
    expect(vars['L:A380X_WXR_ELEVN_TILT_MODE']).toBe(WxrElevnTiltMode.Elevn);
    expect(vars['L:A380X_WXR_ELEVN']).toBe(5000);
    press('A380X_WXR_ELEVN_KNOB_PUSH');
    expect(vars['L:A380X_WXR_ELEVN_TILT_MODE']).toBe(WxrElevnTiltMode.Auto);
  });

  it('the cockpit model sends them from the CAPT and F/O GAIN and ELEVN knobs', () => {
    const xml = readFileSync(
      resolve(
        __dirname,
        '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/pedestal/pedestal.xml',
      ),
      'utf-8',
    );
    for (const node of ['KNOB_CPT_WXR_GAIN', 'KNOB_FO_WXR_GAIN', 'KNOB_CPT_WXR_ELEV', 'KNOB_FO_WXR_ELEV']) {
      expect(xml).toContain(`<NODE_ID>${node}</NODE_ID>`);
    }
    for (const action of ['PUSH', 'PULL', 'INC', 'DEC']) {
      expect(xml).toContain(`(&gt;H:A380X_WXR_#KNOB#_KNOB_${action})`);
    }
    expect(xml).toContain('<KNOB>GAIN</KNOB>');
    expect(xml).toContain('<KNOB>ELEVN</KNOB>');
  });
});
