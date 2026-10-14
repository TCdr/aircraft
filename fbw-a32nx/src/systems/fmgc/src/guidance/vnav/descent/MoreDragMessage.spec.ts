// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  DescentAltitudeConstraint,
  VerticalCheckpoint,
  VerticalCheckpointReason,
} from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  interceptMarginToNextAltitudeConstraintNm,
  isInSpeedbrakeDecelerationSegment,
  isMoreDragMessageActive,
  MoreDragInputs,
} from './MoreDragMessage';

const desIdle: MoreDragInputs = {
  desModeEngaged: true,
  thrustIdle: true,
  aboveProfile: false,
  interceptMarginToNextAltitudeConstraintNm: null,
  speedAuto: true,
  inSpeedbrakeDecelerationSegment: false,
};

/* A320 FCOM DSC-22_30-100 FMA MORE DRAG (a320_fcom.txt l.33617-33623) */
describe('FMA MORE DRAG', () => {
  it('is off in DES at idle on the profile without a speedbrake segment', () => {
    expect(isMoreDragMessageActive(desIdle)).toBe(false);
  });

  it('comes on above the profile when the predicted intercept is less than 2 NM before the next ALT CSTR', () => {
    expect(
      isMoreDragMessageActive({ ...desIdle, aboveProfile: true, interceptMarginToNextAltitudeConstraintNm: 1.5 }),
    ).toBe(true);
    expect(
      isMoreDragMessageActive({ ...desIdle, aboveProfile: true, interceptMarginToNextAltitudeConstraintNm: 2.5 }),
    ).toBe(false);
  });

  it('comes on above the profile when the predicted intercept is beyond the next ALT CSTR', () => {
    expect(
      isMoreDragMessageActive({ ...desIdle, aboveProfile: true, interceptMarginToNextAltitudeConstraintNm: -3 }),
    ).toBe(true);
  });

  it('comes on in managed speed inside a speedbrake decelerating segment', () => {
    expect(isMoreDragMessageActive({ ...desIdle, inSpeedbrakeDecelerationSegment: true })).toBe(true);
    expect(isMoreDragMessageActive({ ...desIdle, inSpeedbrakeDecelerationSegment: true, speedAuto: false })).toBe(
      false,
    );
  });

  it('needs DES and idle thrust', () => {
    const moreDrag: MoreDragInputs = {
      ...desIdle,
      aboveProfile: true,
      interceptMarginToNextAltitudeConstraintNm: 1,
      inSpeedbrakeDecelerationSegment: true,
    };
    expect(isMoreDragMessageActive(moreDrag)).toBe(true);
    expect(isMoreDragMessageActive({ ...moreDrag, desModeEngaged: false })).toBe(false);
    expect(isMoreDragMessageActive({ ...moreDrag, thrustIdle: false })).toBe(false);
  });

  it('is off below the profile whatever the intercept', () => {
    expect(isMoreDragMessageActive({ ...desIdle, interceptMarginToNextAltitudeConstraintNm: 1 })).toBe(false);
  });
});

const checkpoint = (reason: VerticalCheckpointReason, distanceFromStart: number) =>
  ({ reason, distanceFromStart }) as VerticalCheckpoint;
const constraint = (distanceFromStart: number) => ({ distanceFromStart }) as DescentAltitudeConstraint;

describe('MORE DRAG predicted intercept margin', () => {
  const checkpoints = [
    checkpoint(VerticalCheckpointReason.PresentPosition, 100),
    checkpoint(VerticalCheckpointReason.InterceptDescentProfileManaged, 118.5),
    checkpoint(VerticalCheckpointReason.AltitudeConstraint, 120),
  ];

  it('is the next ALT CSTR ahead minus the intercept distance', () => {
    expect(interceptMarginToNextAltitudeConstraintNm(checkpoints, [constraint(80), constraint(120)], 100)).toBe(1.5);
  });

  it('takes the nearest constraint ahead', () => {
    expect(
      interceptMarginToNextAltitudeConstraintNm(checkpoints, [constraint(140), constraint(116), constraint(120)], 100),
    ).toBe(-2.5);
  });

  it('is null without an intercept or without a constraint ahead', () => {
    expect(
      interceptMarginToNextAltitudeConstraintNm(
        [checkpoint(VerticalCheckpointReason.PresentPosition, 100)],
        [constraint(120)],
        100,
      ),
    ).toBe(null);
    expect(interceptMarginToNextAltitudeConstraintNm(checkpoints, [constraint(80)], 100)).toBe(null);
  });
});

describe('MORE DRAG speedbrake decelerating segment', () => {
  const segments = [{ startDistanceFromStart: 150, endDistanceFromStart: 158 }];

  it('contains the aircraft between its ends only', () => {
    expect(isInSpeedbrakeDecelerationSegment(segments, 149)).toBe(false);
    expect(isInSpeedbrakeDecelerationSegment(segments, 152)).toBe(true);
    expect(isInSpeedbrakeDecelerationSegment(segments, 158.5)).toBe(false);
    expect(isInSpeedbrakeDecelerationSegment([], 152)).toBe(false);
  });
});

describe('MORE DRAG wiring', () => {
  it('is computed by the VNAV driver and shown by the FMA', () => {
    const vnav = readFileSync(resolve(__dirname, '../VnavDriver.ts'), 'utf-8');
    const fma = readFileSync(resolve(__dirname, '../../../../../instruments/src/PFD/FMA.tsx'), 'utf-8');
    expect(vnav).toContain('isMoreDragMessageActive(');
    expect(vnav).toContain('L:A32NX_PFD_MSG_MORE_DRAG');
    expect(fma).not.toMatch(/else if \(false\) \{\s*text = 'MORE DRAG'/);
    expect(fma).toMatch(/else if \(moreDrag\) \{[^}]*text = 'MORE DRAG'/);
    expect(fma).toContain("sub.on('moreDrag')");
  });

  it('records the speedbrake decelerations of the descent and approach paths', () => {
    expect(readFileSync(resolve(__dirname, 'GeometricPathBuilder.ts'), 'utf-8')).toContain(
      'profile.speedbrakeDecelerationSegments.push(',
    );
    expect(readFileSync(resolve(__dirname, 'ApproachPathBuilder.ts'), 'utf-8')).toContain(
      'profile.speedbrakeDecelerationSegments.push(',
    );
  });
});
