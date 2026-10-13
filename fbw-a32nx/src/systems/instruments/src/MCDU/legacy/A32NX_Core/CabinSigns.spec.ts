// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { NoSmokingSignsInputs, NoSmokingSwitchPosition, areNoSmokingSignsOn } from './CabinSigns';

/** Cruise: switch AUTO, gear up, flaps lever 0, cabin at 8000 ft, NO SMOKING signs */
const CRUISE: NoSmokingSignsInputs = {
  switchPosition: NoSmokingSwitchPosition.auto,
  gearPositionsPercent: [0, 0, 0],
  flapsLeverIndex: 0,
  cabinAltitudeFt: 8000,
  portableDevicesSigns: false,
};

const signsOn = (changes: Partial<NoSmokingSignsInputs>) => areNoSmokingSignsOn({ ...CRUISE, ...changes });

/* A320 FCOM DSC-33-40-10 Signs (a320_fcom.txt l.52357-52388) */
describe('NO SMOKING cabin signs', () => {
  it('are off in AUTO with the gear up and the flaps lever at 0', () => {
    expect(signsOn({})).toBe(false);
  });

  it('are on with the switch ON and off with the switch OFF', () => {
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.on })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, flapsLeverIndex: 3 })).toBe(false);
  });

  it('are on in AUTO with a landing gear extended, any of the three', () => {
    expect(signsOn({ gearPositionsPercent: [0, 0, 100] })).toBe(true);
    expect(signsOn({ gearPositionsPercent: [100, 0, 0] })).toBe(true);
  });

  it('are on in AUTO with the flaps/slats lever in 1, 2, 3 or FULL, gear up', () => {
    for (const lever of [1, 2, 3, 4]) {
      expect(signsOn({ flapsLeverIndex: lever })).toBe(true);
    }
  });

  it('come on above 11 300 ft cabin altitude whatever the switch position', () => {
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 11_400 })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.auto, cabinAltitudeFt: 12_000 })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 11_300 })).toBe(false);
  });

  it('do not come on with the cabin altitude for the NO PORTABLE ELEC DEVICE signs', () => {
    expect(
      signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 14_000, portableDevicesSigns: true }),
    ).toBe(false);
  });

  it('drive the NO SMOKING memo L:var', () => {
    const updater = readFileSync(resolve(__dirname, 'A32NX_LocalVarUpdater.ts'), 'utf-8');
    const selector = updater.slice(
      updater.indexOf('_noSmokingMemoSelector() {'),
      updater.indexOf('_flapsInMotionSelector() {'),
    );
    expect(selector).toContain('areNoSmokingSignsOn(');
    expect(selector).toContain('L:A32NX_FLAPS_HANDLE_INDEX');
    expect(selector).toContain('L:A32NX_PRESS_MAN_CABIN_ALTITUDE');
  });
});
