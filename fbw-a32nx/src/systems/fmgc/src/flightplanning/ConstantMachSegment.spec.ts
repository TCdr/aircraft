// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { ReadonlyFlightPlanElement } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import {
  A320AnnouncedConstantMachDeletions,
  A320ConstantMachLimits,
  A380AnnouncedConstantMachDeletions,
  A380ConstantMachLimits,
  ConstantMachSegmentDeletionReason,
  ConstantMachSegmentMarker,
  constantMachWaypointChoices,
  findConstantMachSegment,
  isConstantMachSegmentEntryAllowed,
  isCruisePhaseExit,
  isLegInConstantMachSegment,
  parseConstantMachEntry,
} from './ConstantMachSegment';

function leg(
  ident: string,
  marker?: ConstantMachSegmentMarker,
  segmentClass = SegmentClass.Enroute,
  isXF = true,
): ReadonlyFlightPlanElement {
  return {
    isDiscontinuity: false,
    ident,
    constantMachSegment: marker,
    segment: { class: segmentClass },
    isXF: () => isXF,
  } as unknown as ReadonlyFlightPlanElement;
}

const discontinuity = { isDiscontinuity: true } as ReadonlyFlightPlanElement;

describe('the constant Mach segment of a flight plan', () => {
  it('runs from the start marker to the end marker', () => {
    const legs = [
      leg('ORIG', undefined, SegmentClass.Departure),
      leg('AMB', { kind: 'start', mach: 0.83, endsAtTopOfDescent: false }),
      leg('DOMOD'),
      leg('CDN', { kind: 'end' }),
      leg('DEST', undefined, SegmentClass.Arrival),
    ];

    expect(findConstantMachSegment(legs)).toEqual({ mach: 0.83, startLegIndex: 1, endLegIndex: 3 });
  });

  it('runs to the top of descent without an end waypoint', () => {
    const legs = [leg('AMB'), leg('DOMOD', { kind: 'start', mach: 0.8, endsAtTopOfDescent: true }), leg('CDN')];

    expect(findConstantMachSegment(legs)).toEqual({ mach: 0.8, startLegIndex: 1, endLegIndex: null });
  });

  it('is dropped when its end waypoint was removed from the flight plan', () => {
    const legs = [leg('AMB', { kind: 'start', mach: 0.8, endsAtTopOfDescent: false }), discontinuity, leg('CDN')];

    expect(findConstantMachSegment(legs)).toBeNull();
  });

  it('is dropped when its start waypoint was removed from the flight plan', () => {
    const legs = [leg('AMB'), leg('DOMOD'), leg('CDN', { kind: 'end' })];

    expect(findConstantMachSegment(legs)).toBeNull();
  });

  it('holds the legs after the start, up to and including the end', () => {
    const segment = { mach: 0.82, startLegIndex: 2, endLegIndex: 4 };

    expect([1, 2, 3, 4, 5].map((i) => isLegInConstantMachSegment(segment, i))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(isLegInConstantMachSegment({ ...segment, endLegIndex: null }, 40)).toBe(true);
    expect(isLegInConstantMachSegment(null, 3)).toBe(false);
  });
});

describe('the constant Mach entry', () => {
  it('takes .NN and 0.NN', () => {
    expect(parseConstantMachEntry('.82', A320ConstantMachLimits)).toEqual({ mach: 0.82 });
    expect(parseConstantMachEntry('0.78', A320ConstantMachLimits)).toEqual({ mach: 0.78 });
  });

  it('refuses other formats', () => {
    for (const entry of ['82', '0.825', '.8.2', 'M82', '']) {
      expect(parseConstantMachEntry(entry, A320ConstantMachLimits)).toEqual({ error: 'format' });
    }
  });

  it('is limited to the MMO of the A320', () => {
    expect(parseConstantMachEntry('.83', A320ConstantMachLimits)).toEqual({ error: 'range' });
    expect(parseConstantMachEntry('.10', A320ConstantMachLimits)).toEqual({ error: 'range' });
  });

  it('is limited to 0.30 - (MMO - delta MMO) on the A380', () => {
    expect(parseConstantMachEntry('.29', A380ConstantMachLimits)).toEqual({ error: 'range' });
    expect(parseConstantMachEntry('.30', A380ConstantMachLimits)).toEqual({ mach: 0.3 });
    expect(parseConstantMachEntry('.87', A380ConstantMachLimits)).toEqual({ mach: 0.87 });
    expect(parseConstantMachEntry('.88', A380ConstantMachLimits)).toEqual({ error: 'range' });
  });

  it('is allowed up to the cruise phase, not with an engine out', () => {
    expect(isConstantMachSegmentEntryAllowed(FmgcFlightPhase.Preflight, false)).toBe(true);
    expect(isConstantMachSegmentEntryAllowed(FmgcFlightPhase.Cruise, false)).toBe(true);
    expect(isConstantMachSegmentEntryAllowed(FmgcFlightPhase.Descent, false)).toBe(false);
    expect(isConstantMachSegmentEntryAllowed(FmgcFlightPhase.Cruise, true)).toBe(false);
  });

  it('is allowed at any time in a secondary flight plan', () => {
    expect(isConstantMachSegmentEntryAllowed(FmgcFlightPhase.Descent, false, true)).toBe(true);
  });
});

describe('the waypoints selectable as the constant Mach start or end', () => {
  const legs = [
    leg('ORIG', undefined, SegmentClass.Departure),
    leg('SID1', undefined, SegmentClass.Departure),
    leg('TOU'),
    leg('AMB'),
    discontinuity,
    leg('MANUAL', undefined, SegmentClass.Enroute, false),
    leg('DOMOD'),
    leg('CDN'),
    leg('STAR1', undefined, SegmentClass.Arrival),
  ];
  const noPredictions = () => undefined;

  it('are the en-route fix waypoints down path of the aircraft', () => {
    const choices = constantMachWaypointChoices(legs, 3, null, null, noPredictions);

    expect(choices.map((c) => c.ident)).toEqual(['AMB', 'DOMOD', 'CDN']);
  });

  it('exclude the waypoints predicted in the climb', () => {
    const choices = constantMachWaypointChoices(legs, 0, null, null, (i) => i > 2);

    expect(choices.map((c) => c.ident)).toEqual(['AMB', 'DOMOD', 'CDN']);
  });

  it('start before the end and end after the start', () => {
    const choices = constantMachWaypointChoices(legs, 2, 3, 7, noPredictions);

    expect(choices.map((c) => [c.ident, c.canBeStart, c.canBeEnd])).toEqual([
      ['TOU', true, false],
      ['AMB', false, false],
      ['DOMOD', true, true],
      ['CDN', false, false],
    ]);
  });

  it('may all be the start of a segment ending at the top of descent', () => {
    const choices = constantMachWaypointChoices(legs, 2, 6, null, noPredictions);

    expect(choices.map((c) => c.canBeStart)).toEqual([true, true, false, true]);
    expect(choices.map((c) => c.canBeEnd)).toEqual([false, false, false, true]);
  });
});

describe('the automatic deletion of the constant Mach segment', () => {
  it('happens when the flight phase changes from cruise to another one', () => {
    expect(isCruisePhaseExit(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent)).toBe(true);
    expect(isCruisePhaseExit(FmgcFlightPhase.Cruise, FmgcFlightPhase.Climb)).toBe(true);
    expect(isCruisePhaseExit(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise)).toBe(false);
    expect(isCruisePhaseExit(FmgcFlightPhase.Descent, FmgcFlightPhase.Approach)).toBe(false);
  });

  it('is announced on the A320 for every reason, on the A380 only at the end of the cruise', () => {
    for (const reason of [
      ConstantMachSegmentDeletionReason.CruisePhaseExit,
      ConstantMachSegmentDeletionReason.EngineOut,
      ConstantMachSegmentDeletionReason.AlternateEnabled,
      ConstantMachSegmentDeletionReason.SecondaryActivated,
    ]) {
      expect(A320AnnouncedConstantMachDeletions).toContain(reason);
    }
    expect(A380AnnouncedConstantMachDeletions).toEqual([ConstantMachSegmentDeletionReason.CruisePhaseExit]);
  });
});
