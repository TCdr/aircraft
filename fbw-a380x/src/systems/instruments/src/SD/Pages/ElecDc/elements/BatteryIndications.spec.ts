// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  apuInStartSequence,
  batteryCurrentNormal,
  batteryVoltageNormal,
  batteryWireColour,
} from './BatteryIndications';

/* A380 FCOM DSC-24-20 BAT1(2)(ESS) INDICATIONS (a380_fcom.txt l.51348-51368), unchanged */
describe('SD ELEC DC BAT 1(2)(ESS) indications', () => {
  it('voltage is abnormal at or below 25 V while charging, or below 20 V', () => {
    expect(batteryVoltageNormal(false, 26, 5, false)).toBe(true);
    expect(batteryVoltageNormal(false, 25, 5, false)).toBe(false);
    expect(batteryVoltageNormal(false, 24, -2, false)).toBe(true);
    expect(batteryVoltageNormal(false, 19, -2, false)).toBe(false);
  });

  it('current is abnormal below -5 A, the wire is amber unless charging', () => {
    expect(batteryCurrentNormal(false, -6, false)).toBe(false);
    expect(batteryCurrentNormal(false, -4, false)).toBe(true);
    expect(batteryWireColour(false, 5, false)).toBe('Green');
    expect(batteryWireColour(false, -4, false)).toBe('Amber');
  });
});

/* A380 FCOM DSC-24-20 APU BAT INDICATIONS (l.51408-51426) */
describe('SD ELEC DC APU BAT indications', () => {
  it('voltage is abnormal at or below 25 V outside the APU start sequence', () => {
    expect(batteryVoltageNormal(true, 28, 0, false)).toBe(true);
    expect(batteryVoltageNormal(true, 25, 0, false)).toBe(false);
    expect(batteryVoltageNormal(true, 19, -200, true)).toBe(true);
  });

  it('current is abnormal below -5 A outside the APU start sequence', () => {
    expect(batteryCurrentNormal(true, -4, false)).toBe(true);
    expect(batteryCurrentNormal(true, -7, false)).toBe(false);
    expect(batteryCurrentNormal(true, -300, true)).toBe(true);
  });

  it('draws the discharge arrow amber, but green while discharging to start the APU', () => {
    expect(batteryWireColour(true, 10, false)).toBe('Green');
    expect(batteryWireColour(true, -4, false)).toBe('Amber');
    expect(batteryWireColour(true, -300, true)).toBe('Green');
  });

  it('the start sequence runs from the APU START pb ON until the APU is available', () => {
    expect(apuInStartSequence(true, false)).toBe(true);
    expect(apuInStartSequence(true, true)).toBe(false);
    expect(apuInStartSequence(false, false)).toBe(false);
  });
});
