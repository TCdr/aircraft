// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { AltitudeConstraint, LegType, TurnDirection } from '@flybywiresim/fbw-sdk';
import { FlightPlanLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FmgcFlightPhase } from '@shared/flightphase';
import { MfdFmsFpln } from './MfdFmsFpln';
import { anything, withStandIns } from './PageStandIns';

// The MSFS Utils global, used by the dropdown menus
(window as any).Utils = anything();

interface CruiseLeg {
  ident: string;
  type: LegType;
  /** cumulative distance from the start of the flight plan, in NM */
  distance: number;
  long: number;
  altitudeConstraint?: AltitudeConstraint;
  /** null when VNAV predicts no altitude there; FL250 when absent */
  predictedAltitude?: number | null;
}

/**
 * A flight plan leg with the fields the F-PLN page reads, its constraints as plain values
 * @param leg the leg
 * @returns the leg
 */
function flightPlanLeg(leg: CruiseLeg): FlightPlanLeg {
  const isHold = leg.type === LegType.HM;
  return Object.setPrototypeOf(
    {
      ident: leg.ident,
      type: leg.type,
      flags: 0,
      annotation: '',
      isDiscontinuity: false,
      definition: {
        waypoint: { databaseId: `W    ${leg.ident}`, location: { lat: 47, long: leg.long } },
        overfly: false,
        turnDirection: isHold ? TurnDirection.Right : TurnDirection.Either,
        length: isHold ? 4 : undefined,
        verticalAngle: undefined,
      },
      calculated: { cumulativeDistanceWithTransitions: leg.distance, endsInTooSteepPath: false },
      segment: { class: SegmentClass.Enroute },
      altitudeConstraint: leg.altitudeConstraint,
      speedConstraint: undefined,
      modifiedHold: isHold ? { inboundMagneticCourse: 81 } : undefined,
      defaultHold: undefined,
      constantMachSegment: undefined,
      cruiseStep: undefined,
      holdImmExit: false,
      isXF: () => !isHold,
    },
    FlightPlanLeg.prototype,
  );
}

/**
 * Builds the F-PLN page of the captain's MFD in cruise at FL250, the TO waypoint ANTOV followed by a pilot hold at
 * ANTOV whose deceleration has started (the hold exit line is shown), with its predictions
 * @param legs the legs after the FROM waypoint MOBAL
 * @returns the page
 */
function renderCruiseWithHold(legs: CruiseLeg[]) {
  const uiService = new Proxy(
    {
      activeUri: Subject.create({ uri: 'fms/active/f-pln', sys: 'fms', category: 'active', page: 'f-pln', extra: '' }),
      captOrFo: 'CAPT',
    },
    { get: (service: any, property) => (property in service ? service[property] : anything()) },
  );
  const mfd = new Proxy({}, { get: (_mfd, property) => (property === 'uiService' ? uiService : anything()) });

  const allLegsSpec: CruiseLeg[] = [{ ident: 'MOBAL', type: LegType.TF, distance: 100, long: -50 }, ...legs];
  const allLegs = allLegsSpec.map(flightPlanLeg);
  const plan = withStandIns({
    index: 0,
    legs: allLegs,
    allLegs,
    legCount: allLegs.length,
    activeLegIndex: 1,
    firstMissedApproachLegIndex: allLegs.length,
    lastEnrouteLegIndex: allLegs.length,
    version: 1,
    originRunway: undefined,
    destinationAirport: { ident: 'EGLL' },
    destinationRunway: undefined,
    performanceData: withStandIns({
      transitionAltitude: Subject.create(18_000),
      transitionLevel: Subject.create(180),
      timeConstraint: Subject.create(null),
      cruiseFlightLevel: Subject.create(250),
    }),
    maybeElementAt: (index: number) => allLegs[index],
    legElementAt: (index: number) => allLegs[index],
    elementAt: (index: number) => allLegs[index],
  });
  const alternateFlightPlan = withStandIns({ allLegs: [], legCount: 0, firstMissedApproachLegIndex: 0 });
  const flightPlanInterface = withStandIns({
    hasActive: true,
    hasTemporary: false,
    activeOrTemporary: plan,
    active: plan,
    get: () => withStandIns({ alternateFlightPlan }),
  });

  // 7 NM before ANTOV
  const aircraftDistanceFromStart = 105;
  const predictions = new Map<number, any>(
    allLegs.map((leg, index): [number, any] => [
      index,
      {
        waypointIndex: index,
        distanceFromStart: leg.calculated!.cumulativeDistanceWithTransitions,
        distanceFromAircraft: leg.calculated!.cumulativeDistanceWithTransitions - aircraftDistanceFromStart,
        secondsFromPresent: 60 * index,
        altitude: allLegsSpec[index].predictedAltitude === undefined ? 25_000 : allLegsSpec[index].predictedAltitude,
        speed: 0.78,
        isAltitudeConstraintMet: true,
        isSpeedConstraintMet: true,
        estimatedFuelOnBoard: 200_000,
        windPrediction: null,
        profilePhase: ProfilePhase.Cruise,
      },
    ]),
  );
  const fmcService = withStandIns({
    master: withStandIns({
      flightPlanInterface,
      fmgc: withStandIns({
        data: withStandIns({ engineOut: Subject.create(false), destEfobBelowMinInActive: Subject.create(false) }),
        getFlightPhase: () => FmgcFlightPhase.Cruise,
        getWaypointPredictions: () => predictions,
        getDestinationPrediction: () => ({ secondsFromPresent: 6 * 3600, estimatedFuelOnBoard: 25_000 }),
      }),
      guidanceController: withStandIns({
        pseudoWaypoints: { pseudoWaypoints: [] },
        getAlongTrackDistanceToDestination: () => 2760,
        vnavDriver: withStandIns({
          getDestinationPrediction: () => ({ secondsFromPresent: 6 * 3600, estimatedFuelOnBoard: 25_000 }),
        }),
      }),
      acInterface: withStandIns({ getHoldDecelReached: () => true, getLegHoldingSpeed: () => 236 }),
    }),
  });

  const page = FSComponent.createRef<MfdFmsFpln>();
  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(
    <MfdFmsFpln
      ref={page}
      pageTitle="F-PLN"
      bus={new EventBus()}
      mfd={mfd as any}
      fmcService={fmcService as any}
      flightPlanInterface={flightPlanInterface as any}
    />,
    container,
  );

  const internals = page.instance as any;
  return {
    /** the text of the F-PLN lines, top to bottom, without the idents */
    linesText: (): string => internals.linesDivRef.instance.textContent,
    /** the idents of the waypoint and hold lines, top to bottom (set as innerText, which jsdom keeps as a property) */
    idents: (): string[] =>
      Array.from(internals.linesDivRef.instance.querySelectorAll('.mfd-fms-fpln-line-ident')).map(
        (ident: any) => ident.innerText,
      ),
    destination: (): string => internals.destButtonLabel.get(),
  };
}

const holdAtAntovThenRoute: CruiseLeg[] = [
  { ident: 'ANTOV', type: LegType.TF, distance: 112, long: -49 },
  { ident: 'ANTOV', type: LegType.HM, distance: 112, long: -49 },
  { ident: 'MIILS', type: LegType.TF, distance: 300, long: -45 },
  { ident: 'TUDEP', type: LegType.TF, distance: 700, long: -40 },
  { ident: 'N52W050', type: LegType.TF, distance: 900, long: -35 },
];

describe('MfdFmsFpln', () => {
  // The F-PLN page opened while the hold exit line was due threw while it drew the HOLD line: the lines below it and
  // the destination line stayed empty, and the page never refreshed again
  it('draws the lines below a hold whose exit line is shown, and the destination', () => {
    const page = renderCruiseWithHold(holdAtAntovThenRoute);

    expect(page.idents()).toEqual(['MOBAL', 'ANTOV', 'HOLD R', 'ANTOV', 'MIILS', 'TUDEP', 'N52W050']);
    expect(page.linesText()).toContain('C081°');
    expect(page.linesText()).toContain('IMMEDIATE');
    expect(page.linesText()).not.toContain('[object Object]');
    expect(page.destination()).toBe('EGLL');
  });

  it('draws the lines below a line that fails to draw, and the destination', () => {
    const unreadableConstraint = {
      get altitude1(): number {
        throw new Error('unreadable constraint');
      },
    } as unknown as AltitudeConstraint;
    const route = holdAtAntovThenRoute.map((leg) =>
      leg.ident === 'MIILS' ? { ...leg, altitudeConstraint: unreadableConstraint, predictedAltitude: null } : leg,
    );

    const page = renderCruiseWithHold(route);

    expect(page.idents()).toEqual(expect.arrayContaining(['TUDEP', 'N52W050']));
    expect(page.destination()).toBe('EGLL');
  });
});
