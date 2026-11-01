// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
// loads the leg classes in their dependency order, as the guidance does
import '@fmgc/guidance/Geometry';
import { Fix, LegType, MathUtils, TurnDirection } from '@flybywiresim/fbw-sdk';
import { SegmentType } from '@fmgc/wtsdk';
import { LegMetadata } from '@fmgc/guidance/lnav/legs/index';
import { distanceTo, placeBearingDistance } from 'msfs-geo';
import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { maxBank } from '@fmgc/guidance/lnav/CommonGeometry';
import { TFLeg } from '@fmgc/guidance/lnav/legs/TF';
import { EntryState, HoldEntryTransition } from '@fmgc/guidance/lnav/transitions/HoldEntryTransition';
import { Guidable } from '@fmgc/guidance/Guidable';
import { HMLeg, HxLegGuidanceState } from './HX';

const TAS_KNOTS = 220;
const STEP_SECONDS = 1;
const HOLD_INBOUND_COURSE = 90;

const holdFix = { ident: 'ANTOV', location: { lat: 45, long: -73 } } as unknown as Fix;

/** A right hold at ANTOV, inbound course 090, 4 NM legs */
function holdAtAntov(): HMLeg {
  const metadata = {
    flightPlanLegDefinition: {
      type: LegType.HM,
      waypoint: holdFix,
      course: HOLD_INBOUND_COURSE,
      magVar: 0,
      turnDirection: TurnDirection.Right,
      length: 4,
    },
    turnDirection: TurnDirection.Right,
    isOverfly: false,
  } as unknown as LegMetadata;
  const leg = new HMLeg(holdFix, metadata, SegmentType.Arrival);
  leg.setPredictedTas(TAS_KNOTS);
  leg.updatePrediction();
  return leg;
}

/**
 * An aircraft flying the lateral guidance of the active guidable with the flight guidance path law (bank command plus
 * track angle and cross track corrections), and the LNAV sequencing condition of the hold leg
 */
class HoldFlight {
  sequenced = false;

  seconds = 0;

  constructor(
    private readonly leg: HMLeg,
    public ppos: { lat: number; long: number; alt: number },
    public track: number,
    private readonly activeGuidable: (ppos: Coordinates) => Guidable = () => leg,
  ) {}

  step(): void {
    let params: any;
    try {
      params = this.activeGuidable(this.ppos).getGuidanceParameters(this.ppos, this.track, TAS_KNOTS, TAS_KNOTS);
    } catch {
      // the direct turn entry has no guidance in the cycle it ends, the guidance takes the hold leg from the next one
      params = this.leg.getGuidanceParameters(this.ppos, this.track, TAS_KNOTS, TAS_KNOTS);
    }
    const limit = maxBank(TAS_KNOTS, true);
    const phi = Math.max(
      -limit,
      Math.min(limit, params.phiCommand + 1.5 * params.trackAngleError + 20 * params.crossTrackError),
    );

    const speedMetresPerSecond = TAS_KNOTS / 1.94384;
    const turnRateDegrees = ((9.81 * Math.tan((phi * Math.PI) / 180)) / speedMetresPerSecond) * (180 / Math.PI);
    this.track = MathUtils.normalise360(this.track + turnRateDegrees * STEP_SECONDS);
    const moved = placeBearingDistance(this.ppos, this.track, (TAS_KNOTS * STEP_SECONDS) / 3600);
    this.ppos = { lat: moved.lat, long: moved.long, alt: 10_000 };
    this.seconds += STEP_SECONDS;

    const withinSequencingArea = Math.abs(params.crossTrackError) < 7 && Math.abs(params.trackAngleError) < 90;
    if (!this.leg.disableAutomaticSequencing && withinSequencingArea && this.leg.getDistanceToGo(this.ppos) < 0.001) {
      this.sequenced = true;
    }
  }

  flyUntil(condition: () => boolean, maxSeconds = 1200): void {
    const end = this.seconds + maxSeconds;
    while (!condition() && this.seconds < end && !this.sequenced) {
      this.step();
    }
  }

  distanceToFix(): number {
    return distanceTo(this.ppos, holdFix.location);
  }
}

/** Flies one full pattern from the inbound leg, then on into the given state for some seconds */
function flyIntoPatternState(leg: HMLeg, state: HxLegGuidanceState, secondsInState: number): HoldFlight {
  const flight = new HoldFlight(leg, { lat: 45, long: -73.07, alt: 10_000 }, HOLD_INBOUND_COURSE);
  flight.flyUntil(() => leg.state === HxLegGuidanceState.Arc1);
  flight.flyUntil(() => leg.state === HxLegGuidanceState.Inbound);
  flight.flyUntil(() => leg.state === state);
  const end = flight.seconds + secondsInState;
  flight.flyUntil(() => flight.seconds >= end);
  return flight;
}

/**
 * The hold leg with its entry, the aircraft 5 NM before the hold fix on the given course, the active guidable chosen
 * as the geometry does (the entry while the aircraft is in it)
 */
function flyToHoldOnCourse(courseToFix: number): { leg: HMLeg; entry: HoldEntryTransition; flight: HoldFlight } {
  const start = placeBearingDistance(holdFix.location, MathUtils.normalise360(courseToFix + 180), 5);
  const fromFix = { ident: 'START', location: start } as unknown as Fix;
  const tfMetadata = { flightPlanLegDefinition: { type: LegType.TF, waypoint: holdFix } } as unknown as LegMetadata;
  const toHoldFix = new TFLeg(fromFix, holdFix, tfMetadata, SegmentType.Arrival);

  const leg = holdAtAntov();
  const entry = new HoldEntryTransition(toHoldFix, leg);
  entry.recomputeWithParameters(false, TAS_KNOTS, TAS_KNOTS, start, courseToFix);

  let entryStarted = false;
  const flight = new HoldFlight(leg, { lat: start.lat, long: start.long, alt: 10_000 }, courseToFix, (ppos) => {
    if (entry.isAbeam(ppos)) {
      entryStarted = true;
      return entry;
    }
    return entryStarted ? leg : toHoldFix;
  });
  return { leg, entry, flight };
}

describe('HMLeg immediate exit', () => {
  beforeEach(() => {
    SimVar.SetSimVarValue('GPS GROUND SPEED', 'meters per second', TAS_KNOTS / 1.94384);
  });

  it('keeps flying the hold without an immediate exit', () => {
    const leg = holdAtAntov();
    const flight = new HoldFlight(leg, { lat: 45, long: -73.07, alt: 10_000 }, HOLD_INBOUND_COURSE);

    flight.flyUntil(() => false, 900);

    expect(flight.sequenced).toBe(false);
  });

  // The FMS returns at once to the hold fix, and the aircraft leaves the hold when it sequences that fix
  it.each([
    ['the turn after the fix', HxLegGuidanceState.Arc1, 10],
    ['the outbound leg', HxLegGuidanceState.Outbound, 30],
    ['the turn to inbound', HxLegGuidanceState.Arc2, 10],
    ['the inbound leg', HxLegGuidanceState.Inbound, 20],
  ])('leaves the hold at the next pass of the hold fix when IMMEDIATE EXIT is set in %s', (_name, state, seconds) => {
    const leg = holdAtAntov();
    const flight = flyIntoPatternState(leg, state, seconds);
    expect(flight.sequenced).toBe(false);

    leg.setImmediateExit(true, flight.ppos, TAS_KNOTS);
    // at most one pattern (about 6 minutes at 220 kt) to get back to the fix
    flight.flyUntil(() => false, 420);

    expect(flight.sequenced).toBe(true);
    expect(flight.distanceToFix()).toBeLessThan(1);
  });

  // The turning entries end over the hold fix: an IMMEDIATE EXIT set during the entry is taken there, without a further
  // pattern
  it.each([
    ['direct', 50],
    ['parallel', 270],
    ['teardrop', 230],
  ])('leaves the hold where a %s entry ends when IMMEDIATE EXIT is set early in it', (_name, courseToFix) => {
    const { leg, entry, flight } = flyToHoldOnCourse(courseToFix);
    flight.flyUntil(() => entry.isAbeam(flight.ppos));
    const end = flight.seconds + 5;
    flight.flyUntil(() => flight.seconds >= end);
    expect(entry.state).not.toBe(EntryState.Done);

    leg.setImmediateExit(true, flight.ppos, TAS_KNOTS);
    flight.flyUntil(() => entry.state === EntryState.Done);
    expect(entry.state).toBe(EntryState.Done);
    const entryEndSeconds = flight.seconds;
    flight.flyUntil(() => false, 300);

    expect(flight.sequenced).toBe(true);
    // a further pattern would take over 3 minutes at 220 kt
    expect(flight.seconds - entryEndSeconds).toBeLessThan(60);
    // the parallel entry joins the inbound course at an angle, abeam the fix
    expect(flight.distanceToFix()).toBeLessThan(1.5);
  });
});
