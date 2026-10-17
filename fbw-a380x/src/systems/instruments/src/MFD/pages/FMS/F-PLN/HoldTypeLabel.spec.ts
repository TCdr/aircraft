// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { TurnDirection } from '@flybywiresim/fbw-sdk';
import { HoldData, HoldType } from '@fmgc/flightplanning/data/flightplan';
import { holdRevisionTarget, holdTypeLabel } from './HoldTypeLabel';

const hold = (type: HoldType): HoldData => ({
  type,
  inboundMagneticCourse: 90,
  turnDirection: TurnDirection.Right,
  time: 1,
});

describe('HOLD page hold type label', () => {
  it('shows DATABASE once the flight crew selects the database hold', () => {
    expect(holdTypeLabel(hold(HoldType.Database), hold(HoldType.Computed))).toBe('DATABASE HOLD AT ');
  });

  it('shows COMPUTED for the computed hold', () => {
    expect(holdTypeLabel(undefined, hold(HoldType.Computed))).toBe('COMPUTED HOLD AT ');
    expect(holdTypeLabel(hold(HoldType.Computed), hold(HoldType.Database))).toBe('COMPUTED HOLD AT ');
  });

  it('shows MODIFIED once the flight crew changes a parameter', () => {
    expect(holdTypeLabel(hold(HoldType.Pilot), hold(HoldType.Computed))).toBe('MODIFIED HOLD AT ');
  });

  it('is blank for a hold of a procedure, or without a hold', () => {
    expect(holdTypeLabel(undefined, hold(HoldType.Database))).toBe('');
    expect(holdTypeLabel(undefined, undefined)).toBe('');
  });
});

describe('HOLD page revision target (the revised leg and plan of the HOLD page buttons)', () => {
  it('accepts the active flight plan (index 0)', () => {
    expect(holdRevisionTarget(3, 0, true)).toEqual({ legIndex: 3, planIndex: 0 });
  });

  it('accepts the first leg (index 0)', () => {
    expect(holdRevisionTarget(0, 1, true)).toEqual({ legIndex: 0, planIndex: 1 });
  });

  it('refuses a missing leg, a missing plan or no revised waypoint', () => {
    expect(holdRevisionTarget(null, 0, true)).toBeNull();
    expect(holdRevisionTarget(3, null, true)).toBeNull();
    expect(holdRevisionTarget(3, 0, false)).toBeNull();
  });
});
