// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { TimeConstraintType } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { FmgcFlightPhase } from '@shared/flightphase';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { MfdSimvars } from '../../../shared/MFDSimvarPublisher';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { MfdFmsFplnVertRev } from './MfdFmsFplnVertRev';

/**
 * A stand-in for the FMC and display services: every property and call returns another stand-in, so that the page
 * builds without a running FMS
 * @returns the stand-in
 */
function anything(): any {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) {
        return () => 0;
      }
      if (property === Symbol.iterator) {
        return [][Symbol.iterator].bind([]);
      }
      if (property === 'then') {
        return undefined;
      }
      return anything();
    },
    apply: () => anything(),
  });
}

// The MSFS Utils global, used by the dropdown menus
(window as any).Utils = anything();

/**
 * Adds stand-ins for every property the given object does not define
 * @param known the properties the test needs
 * @returns the object with stand-ins for the rest
 */
function withStandIns<T extends object>(known: T): T {
  return new Proxy(known, { get: (target: any, property) => (property in target ? target[property] : anything()) });
}

/**
 * A flight plan in climb: FROM waypoint, then the TO waypoint DET, then further waypoints
 * @returns the flight plan
 */
function climbFlightPlan(): any {
  const legs = ['1570', 'DET', 'DVR', 'KONAN', 'KOK', 'DENOX', 'MATUG'].map((ident) =>
    withStandIns({
      ident,
      isDiscontinuity: false,
      isXF: () => true,
      cruiseStep: undefined,
      segment: { class: SegmentClass.Enroute },
      definition: withStandIns({ waypoint: withStandIns({ databaseId: `W    ${ident}` }) }),
    }),
  );
  return withStandIns({
    legs,
    allLegs: legs,
    legCount: legs.length,
    activeLegIndex: 1,
    originLegIndex: 0,
    firstMissedApproachLegIndex: legs.length,
    version: 1,
    maybeElementAt: (index: number) => legs[index],
    legElementAt: (index: number) => legs[index],
    elementAt: (index: number) => legs[index],
  });
}

interface RevisedWaypoint {
  /** the leg whose prediction or revisions menu opened the page */
  legIndex: number;
  /** whether a temporary flight plan exists (the page then loads it) */
  temporary: boolean;
}

/**
 * Builds the VERT REV page as the MFD does when it navigates to it
 * @param tab the tab of the page URI (rta, cms, spd, alt, step-alts)
 * @param revised the revised waypoint, in the flight plan of climbFlightPlan; stand-ins for everything when absent
 * @returns the page, and the calls of the FMC that create an RTA or queue a message
 */
function renderVertRev(tab: string, revised?: RevisedWaypoint) {
  const uiService = new Proxy(
    {
      activeUri: Subject.create({
        uri: `fms/active/f-pln-vert-rev/${tab}`,
        sys: 'fms',
        category: 'active',
        page: 'f-pln-vert-rev',
        extra: tab,
      }),
      captOrFo: 'CAPT',
    },
    { get: (service: any, property) => (property in service ? service[property] : anything()) },
  );
  const mfd = new Proxy({}, { get: (_mfd, property) => (property === 'uiService' ? uiService : anything()) });

  const plan = climbFlightPlan();
  const flightPlanInterface = withStandIns({
    hasActive: true,
    hasTemporary: revised?.temporary ?? false,
    activeOrTemporary: plan,
    active: plan,
    get: () => withStandIns({ alternateFlightPlan: null }),
  });
  const setTimeConstraint = vi.fn();
  const addMessageToQueue = vi.fn();
  const fmcService = withStandIns({
    master: withStandIns({
      revisedLegIndex: Subject.create<number | null>(revised?.legIndex ?? null),
      revisedLegIsAltn: Subject.create<boolean | null>(false),
      flightPlanInterface,
      fmgc: withStandIns({ data: withStandIns({ engineOut: Subject.create(false) }) }),
      acInterface: withStandIns({ getHoldDecelReached: () => false }),
      guidanceController: undefined,
      timeConstraintOf: () => null,
      engineOutActive: () => false,
      setTimeConstraint,
      addMessageToQueue,
    }),
  });

  const bus = new EventBus();
  const page = FSComponent.createRef<MfdFmsFplnVertRev>();
  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(
    <MfdFmsFplnVertRev
      ref={page}
      pageTitle="VERT REV"
      bus={bus}
      mfd={mfd as any}
      fmcService={revised ? fmcService : anything()}
      flightPlanInterface={revised ? flightPlanInterface : anything()}
    />,
    container,
  );
  bus.getPublisher<MfdSimvars>().pub('flightPhase', FmgcFlightPhase.Climb);

  const internals = page.instance as any;
  return {
    internals,
    setTimeConstraint,
    addMessageToQueue,
    /** the waypoint ident selected in the waypoint dropdown of the page */
    selectedWaypoint(): string | null {
      const selectedIndex: number | null = internals.dropdownMenuSelectedWaypointIndex.get();
      return selectedIndex === null ? null : internals.availableWaypoints.get(selectedIndex);
    },
  };
}

describe('MfdFmsFplnVertRev', () => {
  // A throw while the page builds leaves the whole MFD black (header and page are rebuilt on each navigation)
  for (const tab of ['rta', 'cms', 'spd', 'alt', 'step-alts']) {
    it(`builds with the ${tab} tab selected`, () => {
      expect(() => renderVertRev(tab)).not.toThrow();
    });
  }

  // The vertical revision applies to the waypoint whose prediction was clicked, not to the TO waypoint
  for (const tab of ['rta', 'cms', 'spd', 'alt', 'step-alts']) {
    it(`selects the revised waypoint on the ${tab} tab`, () => {
      expect(renderVertRev(tab, { legIndex: 5, temporary: false }).selectedWaypoint()).toBe('DENOX');
    });
  }

  it('offers the revised waypoint as the start waypoint of a new step', () => {
    const page = renderVertRev('step-alts', { legIndex: 5, temporary: false });

    const newStepWaypointIndex: number | null = page.internals.stepAltsWptIndices[0].get();
    expect(newStepWaypointIndex === null ? null : page.internals.availableWaypoints.get(newStepWaypointIndex)).toBe(
      'DENOX',
    );
  });

  it('offers the revised waypoint as the start waypoint of a new CMS', () => {
    const page = renderVertRev('cms', { legIndex: 5, temporary: false });

    const cmsPanel = page.internals.cmsPanelRef.instance;
    const startIndex: number | null = cmsPanel.startSelectedIndex.get();
    expect(startIndex === null ? null : cmsPanel.startValues.get(startIndex)).toBe('DENOX');
  });

  // Entering an RTA on the active flight plan creates the temporary flight plan, which the page then loads: the next
  // entry (e.g. the time after the RTA type) goes to that temporary flight plan
  it('accepts an RTA entered while the temporary flight plan is loaded', () => {
    const page = renderVertRev('rta', { legIndex: 5, temporary: true });
    page.internals.setRta(TimeConstraintType.At, 21 * 3600 + 36 * 60);

    const queuedTexts = page.addMessageToQueue.mock.calls.map(([message]) => message.text);
    expect(queuedTexts).not.toContain(NXSystemMessages.notAllowed.text);
    expect(page.setTimeConstraint).toHaveBeenCalledWith(
      FlightPlanIndex.Temporary,
      expect.objectContaining({ ident: 'DENOX', type: TimeConstraintType.At, utcSeconds: 77_760 }),
    );
  });
});
