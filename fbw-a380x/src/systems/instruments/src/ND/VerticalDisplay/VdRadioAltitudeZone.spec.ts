// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { VD_PLOT_AREA } from './VdWxrElevnTiltLine';
import { VD_RADIO_ALTITUDE_ZONE_WIDTH, VdRadioAltitudeZoneInputs, vdRadioAltitudeZone } from './VdRadioAltitudeZone';

/** Approach at 3 000 ft, scale 0..4 000 ft (20 ft per pixel, the VD plot is x 150..690, y 800..1000) */
const inputs = (i: Partial<VdRadioAltitudeZoneInputs>): VdRadioAltitudeZoneInputs => ({
  aircraftAltitudeFeet: 3000,
  radioHeightFeet: 2000,
  verticalRange: [0, 4000],
  plot: VD_PLOT_AREA,
  ...i,
});

/* The amber zone comes from the radio altitude, only below 5 000 ft RA */
describe('VD amber radio altitude zone', () => {
  it('from the ground under the aircraft (altitude minus RA) down to the bottom of the VD, on the 0 NM line', () => {
    // ground at 1 000 ft: y = 800 + (4000 - 1000) / 20 = 950
    expect(vdRadioAltitudeZone(inputs({}))).toEqual({
      x: 150 - VD_RADIO_ALTITUDE_ZONE_WIDTH / 2,
      y: 950,
      width: VD_RADIO_ALTITUDE_ZONE_WIDTH,
      height: 50,
    });
  });

  it('only below 5 000 ft RA', () => {
    expect(vdRadioAltitudeZone(inputs({ aircraftAltitudeFeet: 6000, radioHeightFeet: 4990 }))).not.toBeNull();
    expect(vdRadioAltitudeZone(inputs({ aircraftAltitudeFeet: 6000, radioHeightFeet: 5000 }))).toBeNull();
  });

  it('not without a valid RA or altitude', () => {
    expect(vdRadioAltitudeZone(inputs({ radioHeightFeet: null }))).toBeNull();
    expect(vdRadioAltitudeZone(inputs({ aircraftAltitudeFeet: null }))).toBeNull();
  });

  it('ground below the scale: nothing; ground above the scale: the whole plot height', () => {
    expect(vdRadioAltitudeZone(inputs({ verticalRange: [2000, 6000] }))).toBeNull();
    expect(vdRadioAltitudeZone(inputs({ aircraftAltitudeFeet: 9000, radioHeightFeet: 100 }))?.y).toBe(800);
  });
});
