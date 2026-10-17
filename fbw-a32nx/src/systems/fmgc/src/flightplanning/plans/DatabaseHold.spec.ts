// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AltitudeDescriptor, Fix, LegType, ProcedureLeg, TurnDirection, WaypointArea } from '@flybywiresim/fbw-sdk';
import { HoldType } from '@fmgc/flightplanning/data/flightplan';
import { holdAirportIdents, holdVerticalDistanceFromAltitude, selectDatabaseHold } from './DatabaseHold';

/** A database hold as the MSFS backend maps it (Mapping.mapHolds): the inbound course is in `course` */
function hold(databaseId: string, course: number, extra: Partial<ProcedureLeg> = {}): ProcedureLeg {
  return {
    type: LegType.HM,
    procedureIdent: 'HOLD',
    overfly: true,
    waypoint: { databaseId, ident: 'BIG' } as Fix,
    course,
    turnDirection: TurnDirection.Left,
    lengthTime: 1,
    ...extra,
  } as ProcedureLeg;
}

describe('database hold of a hold fix', () => {
  it('measures how far an altitude is outside the altitude window of the hold', () => {
    const between = { altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2, altitude1: 14000, altitude2: 7000 };
    expect(holdVerticalDistanceFromAltitude(10000, between)).toBe(0);
    expect(holdVerticalDistanceFromAltitude(15000, between)).toBe(1000);
    expect(holdVerticalDistanceFromAltitude(5000, between)).toBe(2000);
    expect(
      holdVerticalDistanceFromAltitude(5000, { altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 6000 }),
    ).toBe(1000);
    expect(
      holdVerticalDistanceFromAltitude(9000, { altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 6000 }),
    ).toBe(3000);
    expect(holdVerticalDistanceFromAltitude(9000, {})).toBe(0);
  });

  it('takes the inbound course, turn side and leg size of the database hold', () => {
    expect(selectDatabaseHold([hold('W1', 263)], 'W1', 8000, 250)).toEqual({
      inboundMagneticCourse: 263,
      turnDirection: TurnDirection.Left,
      time: 1,
      distance: undefined,
      type: HoldType.Database,
    });
  });

  it('keeps a distance leg size', () => {
    const selected = selectDatabaseHold([hold('W1', 90, { lengthTime: undefined, length: 4 })], 'W1', 8000, 90);
    expect(selected?.distance).toBe(4);
    expect(selected?.time).toBe(undefined);
  });

  it('ignores the holds of another fix with the same ident', () => {
    expect(selectDatabaseHold([hold('OTHER', 263)], 'W1', 8000, 250)).toBe(undefined);
    expect(selectDatabaseHold([], 'W1', 8000, 250)).toBe(undefined);
  });

  it('prefers the hold whose altitude window suits the predicted altitude, then the closest inbound course', () => {
    const high = hold('W1', 250, { altitudeDescriptor: AltitudeDescriptor.AtOrAboveAlt1, altitude1: 15000 });
    const low = hold('W1', 70, { altitudeDescriptor: AltitudeDescriptor.AtOrBelowAlt1, altitude1: 14000 });
    expect(selectDatabaseHold([high, low], 'W1', 8000, 250)?.inboundMagneticCourse).toBe(70);
    expect(selectDatabaseHold([low, high], 'W1', 20000, 70)?.inboundMagneticCourse).toBe(250);
    expect(selectDatabaseHold([hold('W1', 70), hold('W1', 240)], 'W1', 8000, 250)?.inboundMagneticCourse).toBe(240);
  });

  it('looks the holds up at the origin, the destination and the airport of a terminal fix, once each', () => {
    const terminal = { area: WaypointArea.Terminal, airportIdent: 'EGLL', ident: 'BIG', databaseId: 'W1' } as Fix;
    const enroute = { area: WaypointArea.Enroute, ident: 'BIG', databaseId: 'W1' } as Fix;
    expect(holdAirportIdents(terminal, 'LFPG', 'EGLL')).toEqual(['LFPG', 'EGLL']);
    expect(holdAirportIdents(terminal, undefined, 'EGKK')).toEqual(['EGKK', 'EGLL']);
    expect(holdAirportIdents(enroute, 'LFPG', undefined)).toEqual(['LFPG']);
  });
});
