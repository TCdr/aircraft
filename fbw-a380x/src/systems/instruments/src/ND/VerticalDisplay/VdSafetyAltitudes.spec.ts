// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { VdSafetyAltitudeInputs, drawVdSafetyAltitudes } from './VdSafetyAltitudes';
import { VD_PLOT_AREA } from './VdWxrElevnTiltLine';

/** 80 NM range, scale 0..20 000 ft (100 ft per pixel), aircraft at 15 000 ft, QNH */
const inputs = (i: Partial<VdSafetyAltitudeInputs>): VdSafetyAltitudeInputs => ({
  segments: [],
  vdRangeNm: 80,
  verticalRange: [0, 20000],
  baroStd: false,
  aircraftAltitudeFt: 15000,
  plot: VD_PLOT_AREA,
  ...i,
});

describe('VD safety altitudes', () => {
  it('QNH: the profile as segments over the VD range, joined where they meet', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        segments: [
          { startNm: 0, endNm: 40, altitudeFt: 5000, type: 'MORA' },
          { startNm: 40, endNm: 160, altitudeFt: 10000, type: 'MORA' },
        ],
      }),
    );
    // x: 150 + nm * 6.75; y: 800 + (20000 - ft) / 100
    expect(drawing.profilePath).toBe('M 150.0 950.0 H 420.0 V 900.0 H 690.0');
    expect(drawing.highest).toBeNull();
    expect(drawing.partlyDisplayed).toBe(false);
  });

  it('QNH: the type label above the plot, over the start of the profile and where the type changes', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        segments: [
          { startNm: 0, endNm: 20, altitudeFt: 4000, type: 'MSA' },
          { startNm: 20, endNm: 80, altitudeFt: 5000, type: 'MORA' },
        ],
      }),
    );
    expect(drawing.typeLabels).toEqual([
      { x: 150, anchor: 'end', text: 'MSA' },
      { x: 285, anchor: 'start', text: 'MORA' },
    ]);
  });

  it('no segment across a flight plan discontinuity', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        segments: [
          { startNm: 0, endNm: 30, altitudeFt: 5000, type: 'MORA' },
          { startNm: 50, endNm: 80, altitudeFt: 5000, type: 'MORA' },
        ],
      }),
    );
    expect(drawing.profilePath).toBe('M 150.0 950.0 H 352.5 M 487.5 950.0 H 690.0');
  });

  it('STD: only the highest safety altitude along the VD range, thousands then hundreds of feet', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        baroStd: true,
        aircraftAltitudeFt: 40000,
        segments: [
          { startNm: 0, endNm: 40, altitudeFt: 5000, type: 'MORA' },
          { startNm: 40, endNm: 70, altitudeFt: 8800, type: 'MORA' },
          // beyond the VD range
          { startNm: 90, endNm: 160, altitudeFt: 12000, type: 'MORA' },
        ],
      }),
    );
    expect(drawing.profilePath).toBe('');
    expect(drawing.typeLabels).toEqual([]);
    expect(drawing.highest).toEqual({ x: 420, upper: false, thousands: '8', hundreds: '8', type: 'MORA' });
  });

  it('the highest safety altitude in the upper part of the VD when the aircraft is below it', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        baroStd: true,
        aircraftAltitudeFt: 3000,
        segments: [{ startNm: 0, endNm: 80, altitudeFt: 25000, type: 'MSA' }],
      }),
    );
    expect(drawing.highest).toMatchObject({ upper: true, thousands: '25', hundreds: '0', type: 'MSA' });
  });

  it('QNH with the highest safety altitude above the vertical scale: the profile and the highest value', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({
        segments: [
          { startNm: 0, endNm: 40, altitudeFt: 5000, type: 'MSA' },
          { startNm: 40, endNm: 80, altitudeFt: 24500, type: 'MSA' },
        ],
      }),
    );
    expect(drawing.profilePath).toBe('M 150.0 950.0 H 420.0 V 755.0 H 690.0');
    expect(drawing.highest).toMatchObject({ x: 420, thousands: '24', hundreds: '5' });
  });

  it('QNH with no safety altitude within the vertical scale: only the highest value', () => {
    const drawing = drawVdSafetyAltitudes(
      inputs({ verticalRange: [30000, 50000], segments: [{ startNm: 0, endNm: 80, altitudeFt: 9000, type: 'MORA' }] }),
    );
    expect(drawing.profilePath).toBe('');
    expect(drawing.typeLabels).toEqual([]);
    expect(drawing.highest).toMatchObject({ thousands: '9', hundreds: '0' });
  });

  it('SAFETY ALTS PARTLY DISPLAYED when a part of the VD range has no value', () => {
    const partly = drawVdSafetyAltitudes(
      inputs({
        segments: [
          { startNm: 0, endNm: 60, altitudeFt: 5000, type: 'MORA' },
          { startNm: 60, endNm: 160, altitudeFt: null, type: 'MORA' },
        ],
      }),
    );
    expect(partly.partlyDisplayed).toBe(true);
    expect(partly.profilePath).toBe('M 150.0 950.0 H 555.0');
    // the part without value beyond the VD range does not count
    expect(
      drawVdSafetyAltitudes(
        inputs({
          vdRangeNm: 40,
          segments: [
            { startNm: 0, endNm: 60, altitudeFt: 5000, type: 'MORA' },
            { startNm: 60, endNm: 160, altitudeFt: null, type: 'MORA' },
          ],
        }),
      ).partlyDisplayed,
    ).toBe(false);
  });

  it('nothing without safety altitudes', () => {
    expect(drawVdSafetyAltitudes(inputs({}))).toEqual({
      profilePath: '',
      typeLabels: [],
      highest: null,
      partlyDisplayed: false,
    });
  });
});
