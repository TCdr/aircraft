// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  WXR_MANUAL_SETTING_VARS,
  WXR_NO_ENTRY,
  WxrManualSetting,
  initWxrManualSettings,
  wxrManualDefaultOnSelection,
} from './WxrManualSettings';

/** The sim's L:vars: one nobody has written reads 0 */
function lvars() {
  const values = new Map<string, number>();
  return {
    read: (name: string) => values.get(name) ?? 0,
    write: (name: string, value: number) => values.set(name, value),
  };
}

const onGround = { onGround: true, altitudeFeet: 118 };
const inFlight = { onGround: false, altitudeFeet: 12_480 };

/** The first manual selection of a setting after the MFD power-up, as the SURV/CONTROLS page does it */
function firstSelection(setting: WxrManualSetting, aircraft: { onGround: boolean; altitudeFeet: number }) {
  const sim = lvars();
  initWxrManualSettings(sim.write);
  const name = WXR_MANUAL_SETTING_VARS[setting];
  const value = wxrManualDefaultOnSelection(setting, sim.read(name), aircraft);
  if (value !== null) {
    sim.write(name, value);
  }
  return sim.read(name);
}

describe('WXR manual settings (A380 FCOM DSC-34-20-30-20-10)', () => {
  it('has no GAIN, TILT or ELEVN entered at power-up', () => {
    const sim = lvars();
    initWxrManualSettings(sim.write);
    Object.values(WXR_MANUAL_SETTING_VARS).forEach((name) => expect(sim.read(name)).toBe(WXR_NO_ENTRY));
  });

  // In-sim 2026-10-02: the first selection kept 0 (the unset L:var) instead of the default
  it('gives GAIN 50 % at the first GAIN MAN selection', () => {
    expect(firstSelection('gain', onGround)).toBe(50);
  });

  it('gives TILT +3.00° on ground and 0° in flight at the first TILT selection', () => {
    expect(firstSelection('tilt', onGround)).toBe(3);
    expect(firstSelection('tilt', inFlight)).toBe(0);
  });

  it('gives the current altitude (hundreds of feet) at the first ELEVN selection', () => {
    expect(firstSelection('elevn', inFlight)).toBe(12_500);
    expect(firstSelection('elevn', onGround)).toBe(100);
  });

  it('keeps a value the flight crew has entered, 0 included', () => {
    expect(wxrManualDefaultOnSelection('tilt', 0, onGround)).toBeNull();
    expect(wxrManualDefaultOnSelection('gain', 70, onGround)).toBeNull();
  });
});
