// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  VD_PLOT_AREA,
  VdWxrElevnTiltLineInputs,
  VdWxrElevnTiltMode,
  WXR_SETTING_NO_ENTRY,
  vdWxrElevnTiltLine,
} from './VdWxrElevnTiltLine';

const FEET_PER_NM = 6076.12;

/** Cruise at FL350, 40 NM VD range, scale FL200..FL400 (the VD plot is x 150..690, y 800..1000) */
const inputs = (i: Partial<VdWxrElevnTiltLineInputs>): VdWxrElevnTiltLineInputs => ({
  wxrModeShownOnNd: true,
  mode: VdWxrElevnTiltMode.Elevn,
  elevnFeet: 30_000,
  tiltDegrees: 0,
  aircraftAltitudeFeet: 35_000,
  vdRangeNm: 40,
  verticalRange: [20_000, 40_000],
  plot: VD_PLOT_AREA,
  ...i,
});

describe('VD white line of the WXR ELEVN/TILT selection (A380 FCOM DSC-34-20-30-20)', () => {
  it('is not shown in the AUTO mode', () => {
    expect(vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Auto }))).toBeNull();
  });

  it('is not shown while the ND does not show the WX display function (WXR OFF, MAP, WX not selected)', () => {
    expect(vdWxrElevnTiltLine(inputs({ wxrModeShownOnNd: false }))).toBeNull();
    expect(vdWxrElevnTiltLine(inputs({ wxrModeShownOnNd: false, mode: VdWxrElevnTiltMode.Tilt }))).toBeNull();
  });

  it('is not shown while no value is entered', () => {
    expect(vdWxrElevnTiltLine(inputs({ elevnFeet: WXR_SETTING_NO_ENTRY }))).toBeNull();
    expect(vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: WXR_SETTING_NO_ENTRY }))).toBeNull();
  });

  describe('ELEVN mode', () => {
    it('is a horizontal line at the selected altitude, from the aircraft to the end of the VD range', () => {
      // 30 000 ft is half-way between 20 000 and 40 000 ft: y = 800 + 100
      expect(vdWxrElevnTiltLine(inputs({}))).toEqual({ x1: 150, y1: 900, x2: 690, y2: 900 });
    });

    it('follows the vertical scale', () => {
      const line = vdWxrElevnTiltLine(inputs({ elevnFeet: 35_000 }));
      expect(line?.y1).toBeCloseTo(850);
      expect(line?.y2).toBeCloseTo(850);
    });

    it('does not need the aircraft altitude', () => {
      expect(vdWxrElevnTiltLine(inputs({ aircraftAltitudeFeet: null }))).toEqual({
        x1: 150,
        y1: 900,
        x2: 690,
        y2: 900,
      });
    });

    it('is not shown when the selected altitude is off the vertical scale', () => {
      expect(vdWxrElevnTiltLine(inputs({ elevnFeet: 45_000 }))).toBeNull();
      expect(vdWxrElevnTiltLine(inputs({ elevnFeet: 10_000 }))).toBeNull();
    });

    it('is shown on the edges of the vertical scale', () => {
      expect(vdWxrElevnTiltLine(inputs({ elevnFeet: 40_000 }))?.y1).toBeCloseTo(800);
      expect(vdWxrElevnTiltLine(inputs({ elevnFeet: 20_000 }))?.y1).toBeCloseTo(1000);
    });
  });

  describe('TILT mode', () => {
    it('is a horizontal line at the aircraft altitude with a zero tilt (the horizon)', () => {
      const line = vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: 0 }));
      expect(line?.x1).toBeCloseTo(150);
      expect(line?.y1).toBeCloseTo(850);
      expect(line?.x2).toBeCloseTo(690);
      expect(line?.y2).toBeCloseTo(850);
    });

    it('starts at the aircraft and climbs along the selected tilt angle', () => {
      // +1° over 40 NM: 40 * 6076.12 * tan(1°) = 4242 ft higher, 42.4 px up on a 20 000 ft / 200 px scale
      const rise = 40 * FEET_PER_NM * Math.tan(Math.PI / 180);
      const line = vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: 1 }));
      expect(line?.x1).toBeCloseTo(150);
      expect(line?.y1).toBeCloseTo(850);
      expect(line?.x2).toBeCloseTo(690);
      expect(line?.y2).toBeCloseTo(850 - rise / 100);
    });

    it('goes down with a negative tilt', () => {
      const line = vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: -1 }));
      expect(line?.y2).toBeGreaterThan(850);
    });

    it('is clipped to the top of the plot', () => {
      // +5° reaches 40 000 ft (5 000 ft above) after 5 000 / (6076.12 * tan 5°) = 9.39 NM
      const line = vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: 5 }));
      const distanceToTop = 5_000 / (FEET_PER_NM * Math.tan((5 * Math.PI) / 180));
      expect(line?.x1).toBeCloseTo(150);
      expect(line?.y1).toBeCloseTo(850);
      expect(line?.x2).toBeCloseTo(150 + (distanceToTop / 40) * 540);
      expect(line?.y2).toBeCloseTo(800);
    });

    it('is clipped to the bottom of the plot', () => {
      const line = vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: -10 }));
      expect(line?.y2).toBeCloseTo(1000);
      expect(line?.x2).toBeLessThan(690);
    });

    it('is cut where it enters the plot when the aircraft is above the vertical scale', () => {
      // aircraft at 42 000 ft, -1°: down 4242 ft at 40 NM, enters the scale (40 000 ft) at 2 000 ft below
      const line = vdWxrElevnTiltLine(
        inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: -1, aircraftAltitudeFeet: 42_000 }),
      );
      const distanceIn = 2_000 / (FEET_PER_NM * Math.tan(Math.PI / 180));
      expect(line?.x1).toBeCloseTo(150 + (distanceIn / 40) * 540);
      expect(line?.y1).toBeCloseTo(800);
      expect(line?.x2).toBeCloseTo(690);
    });

    it('is not shown when it stays off the vertical scale', () => {
      expect(
        vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, tiltDegrees: 1, aircraftAltitudeFeet: 45_000 })),
      ).toBeNull();
    });

    it('is not shown without a valid aircraft altitude', () => {
      expect(vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, aircraftAltitudeFeet: null }))).toBeNull();
    });
  });

  it('is not shown without a usable VD scale', () => {
    expect(vdWxrElevnTiltLine(inputs({ verticalRange: [30_000, 30_000] }))).toBeNull();
    expect(vdWxrElevnTiltLine(inputs({ mode: VdWxrElevnTiltMode.Tilt, vdRangeNm: 0 }))).toBeNull();
  });
});
