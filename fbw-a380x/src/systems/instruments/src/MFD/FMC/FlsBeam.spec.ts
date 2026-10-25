// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { placeBearingDistance } from 'msfs-geo';
import { computeFlsBeam as computeFlsBeamGeometry, FlsBeamInputs } from '@fmgc/navigation/fls/FlsBeam';
import { vdFlsBeam } from './FlsBeam';

const threshold = { lat: 43.6, long: 1.37 };
const runwayBearing = 330;
/** a point on the extended centreline, a distance (NM) before the threshold (negative: beyond it) */
const onFinal = (distance: number) => placeBearingDistance(threshold, runwayBearing + 180, distance);

const vorApproach: FlsBeamInputs = {
  approachType: ApproachType.VorDme,
  finalCourse: runwayBearing,
  missedApproachPoint: {
    ident: 'RW33L',
    location: onFinal(0),
    altitude: 550,
    verticalAngle: -3,
  },
  runway: {
    ident: 'RW33L',
    airportIdent: 'LFBO',
    bearing: runwayBearing,
    thresholdLocation: threshold,
    thresholdElevation: 500,
    thresholdCrossingHeight: 50,
  },
  approachTemperature: null,
};

/** the VD view of the beam, the MAP 40 NM ahead along the flight plan */
const computeFlsBeam = (inputs: FlsBeamInputs) => {
  const beam = computeFlsBeamGeometry(inputs);
  return beam && vdFlsBeam(beam, 40, null);
};

describe('FLS beam', () => {
  it('is anchored on the runway threshold at the TCH when the MAP is on the threshold', () => {
    expect(computeFlsBeam(vorApproach)).toEqual({
      anchorDistance: 40,
      anchorAltitude: 550,
      slope: 3,
      ident: 'LFBO33L',
      anchorAtThreshold: true,
      approachQnh: null,
    });
  });

  it('takes threshold + 50 ft without a TCH in the database', () => {
    const beam = computeFlsBeam({ ...vorApproach, runway: { ...vorApproach.runway, thresholdCrossingHeight: 0 } });
    expect(beam?.anchorAltitude).toBe(550);
  });

  it('is anchored on a pseudo end point EPxxx when the MAP is before the threshold', () => {
    // MAP 2 NM before the threshold at 1500 ft: the 3° slope reaches 550 ft about 3 NM after the MAP
    const beam = computeFlsBeam({
      ...vorApproach,
      missedApproachPoint: {
        ...vorApproach.missedApproachPoint,
        ident: 'MAP33',
        location: onFinal(2),
        altitude: 1_500,
      },
    });
    expect(beam?.ident).toBe('EP33L');
    expect(beam?.anchorAtThreshold).toBe(false);
    expect(beam?.anchorDistance).toBeCloseTo(40 + 950 / Math.tan((3 * Math.PI) / 180) / 6076.12, 2);
  });

  it('takes the threshold ident when the end point is within 0.1 NM of the threshold', () => {
    const mapAltitude = 550 + 2 * 6076.12 * Math.tan((3 * Math.PI) / 180);
    const beam = computeFlsBeam({
      ...vorApproach,
      missedApproachPoint: { ...vorApproach.missedApproachPoint, location: onFinal(2), altitude: mapAltitude },
    });
    expect(beam?.ident).toBe('LFBO33L');
    expect(beam?.anchorAtThreshold).toBe(true);
  });

  it('is anchored on the MAP (final end point) when the MAP is beyond the threshold', () => {
    const beam = computeFlsBeam({
      ...vorApproach,
      missedApproachPoint: { ...vorApproach.missedApproachPoint, ident: 'EP33L', location: onFinal(-0.5) },
    });
    expect(beam).toMatchObject({ anchorDistance: 40, anchorAltitude: 550, ident: 'EP33L', anchorAtThreshold: false });
  });

  it('is not computed for an ILS, IGS, LDA or SDF approach, nor for a final course 50° off the runway', () => {
    for (const approachType of [ApproachType.Ils, ApproachType.Igs, ApproachType.Lda, ApproachType.Sdf]) {
      expect(computeFlsBeam({ ...vorApproach, approachType })).toBe(null);
    }
    expect(computeFlsBeam({ ...vorApproach, finalCourse: runwayBearing + 51 })).toBe(null);
    expect(computeFlsBeam({ ...vorApproach, finalCourse: runwayBearing + 45 })).not.toBe(null);
    expect(computeFlsBeam({ ...vorApproach, approachType: ApproachType.Rnav })).not.toBe(null);
    expect(computeFlsBeam({ ...vorApproach, approachType: ApproachType.LocBackcourse })).not.toBe(null);
    expect(computeFlsBeam({ ...vorApproach, approachType: ApproachType.Ndb })).not.toBe(null);
  });

  it('is corrected for a destination temperature below ISA (indicated heights above the threshold)', () => {
    // ISA at 500 ft is 14 °C: at -20 °C the indicated heights are about 13 % higher
    const beam = computeFlsBeam({ ...vorApproach, approachTemperature: -20 });
    const ratio = (288.15 - 0.0019812 * 500) / 253.15;
    expect(beam?.anchorAltitude).toBeCloseTo(500 + 50 * ratio, 3);
    expect(beam?.slope).toBeCloseTo((Math.atan(Math.tan((3 * Math.PI) / 180) * ratio) * 180) / Math.PI, 6);
    expect(computeFlsBeam({ ...vorApproach, approachTemperature: 30 })?.slope).toBe(3);
  });
});
