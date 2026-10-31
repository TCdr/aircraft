// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AutoThrustMode, VerticalMode } from '@shared/autopilot';
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
  moreDragInputsFromSources,
  MoreDragSources,
} from './MoreDragMessage';

const desIdle: MoreDragInputs = {
  desModeEngaged: true,
  thrustIdle: true,
  aboveProfile: false,
  interceptMarginToNextAltitudeConstraintNm: null,
  speedAuto: true,
  inSpeedbrakeDecelerationSegment: false,
};

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

describe('MORE DRAG inputs from the guidance', () => {
  const desIdleSources: MoreDragSources = {
    fcuVerticalMode: VerticalMode.DES,
    autoThrustMode: AutoThrustMode.THR_IDLE,
    linearDeviation: 0,
    fcuSpeedManaged: true,
    ndProfile: undefined,
    descentProfile: undefined,
    aircraftToDescentProfileRelation: { isValid: true, distanceFromStart: 150 },
  };

  const descentProfile = {
    speedbrakeDecelerationSegments: [{ startDistanceFromStart: 150, endDistanceFromStart: 158 }],
  };

  it('takes DES engaged and the A/THR in THR IDLE', () => {
    const inputs = moreDragInputsFromSources(desIdleSources);
    expect(inputs.desModeEngaged).toBe(true);
    expect(inputs.thrustIdle).toBe(true);
    expect(moreDragInputsFromSources({ ...desIdleSources, fcuVerticalMode: VerticalMode.OP_DES }).desModeEngaged).toBe(
      false,
    );
    expect(moreDragInputsFromSources({ ...desIdleSources, autoThrustMode: AutoThrustMode.SPEED }).thrustIdle).toBe(
      false,
    );
  });

  it('is above the profile for a positive linear deviation only', () => {
    expect(moreDragInputsFromSources({ ...desIdleSources, linearDeviation: 50 }).aboveProfile).toBe(true);
    expect(moreDragInputsFromSources({ ...desIdleSources, linearDeviation: 0 }).aboveProfile).toBe(false);
    expect(moreDragInputsFromSources({ ...desIdleSources, linearDeviation: -50 }).aboveProfile).toBe(false);
    expect(moreDragInputsFromSources({ ...desIdleSources, linearDeviation: undefined }).aboveProfile).toBe(false);
  });

  it('takes managed speed from the FCU', () => {
    expect(moreDragInputsFromSources({ ...desIdleSources, fcuSpeedManaged: true }).speedAuto).toBe(true);
    expect(moreDragInputsFromSources({ ...desIdleSources, fcuSpeedManaged: false }).speedAuto).toBe(false);
    expect(moreDragInputsFromSources({ ...desIdleSources, fcuSpeedManaged: undefined }).speedAuto).toBe(false);
  });

  it('takes the intercept margin from the ND profile, null without one', () => {
    const ndProfile = {
      checkpoints: [
        checkpoint(VerticalCheckpointReason.InterceptDescentProfileManaged, 118.5),
        checkpoint(VerticalCheckpointReason.AltitudeConstraint, 120),
      ],
      descentAltitudeConstraints: [constraint(120)],
      distanceToPresentPosition: 100,
    };
    expect(moreDragInputsFromSources({ ...desIdleSources, ndProfile }).interceptMarginToNextAltitudeConstraintNm).toBe(
      1.5,
    );
    expect(moreDragInputsFromSources(desIdleSources).interceptMarginToNextAltitudeConstraintNm).toBe(null);
  });

  it('is in a speedbrake decelerating segment of a valid relation to the descent profile only', () => {
    const inSegment = (sources: Partial<MoreDragSources>) =>
      moreDragInputsFromSources({ ...desIdleSources, descentProfile, ...sources }).inSpeedbrakeDecelerationSegment;
    expect(inSegment({})).toBe(true);
    expect(inSegment({ aircraftToDescentProfileRelation: { isValid: true, distanceFromStart: 140 } })).toBe(false);
    expect(inSegment({ aircraftToDescentProfileRelation: { isValid: false, distanceFromStart: 152 } })).toBe(false);
    expect(inSegment({ descentProfile: undefined })).toBe(false);
  });

  it('gives MORE DRAG for DES at idle in managed speed inside a speedbrake decelerating segment', () => {
    expect(isMoreDragMessageActive(moreDragInputsFromSources({ ...desIdleSources, descentProfile }))).toBe(true);
    expect(
      isMoreDragMessageActive(
        moreDragInputsFromSources({ ...desIdleSources, descentProfile, autoThrustMode: AutoThrustMode.SPEED }),
      ),
    ).toBe(false);
  });
});
