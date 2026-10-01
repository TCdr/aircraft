// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { bearingTo, Coordinates, distanceTo } from 'msfs-geo';
import { DatabaseItem, Fix, isAirport, MagVar } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanLegFlags } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { DirectToInterceptCourse } from '@fmgc/flightplanning/plans/DirectTo';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { FmsDataInterface } from '@fmgc/flightplanning/interface/FmsDataInterface';
import { FmsDisplayInterface } from '@fmgc/flightplanning/interface/FmsDisplayInterface';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import {
  NdDirectToCourse,
  NdDirectToOption,
  NdInteractiveElement,
  NdInteractiveEvents,
  NdInteractiveRequest,
  NdInteractiveState,
} from '@shared/NdInteractive';
import { directToEtaSeconds } from './DirectToEta';

/** The waypoint entry functions of the FMS (the pilot-defined waypoints are stored, as for the MFD entries) */
export type NdWaypointEntryFms = Pick<
  FmsDataInterface,
  | 'createLatLonWaypoint'
  | 'createPlaceBearingDistWaypoint'
  | 'createPlaceBearingPlaceBearingWaypoint'
  | 'getStoredWaypointsByIdent'
>;

/** The FMS functions the interactive ND revisions use */
export interface NdInteractiveFms<P extends FlightPlanPerformanceData> {
  readonly flightPlanInterface: FlightPlanService<P>;
  readonly entry: NdWaypointEntryFms;
  /** The aircraft position, null when unknown */
  presentPosition(): Coordinates | null;
  /** The aircraft true track in degrees */
  trueTrack(): number;
  /** The aircraft ground speed in knots */
  groundSpeed(): number;
  setRevisedWaypoint(index: number, planIndex: number, isAltn: boolean): void;
  resetRevisedWaypoint(): void;
  showFmsErrorMessage(type: FmsErrorType): void;
}

/** The state is sent to the NDs this often, when it changes */
const STATE_INTERVAL_MS = 500;

/** A place of a KCCU entry is not unique in the database: the flight crew chooses on the DUPLICATE page of the ND */
class NdDuplicateEntry extends Error {
  constructor(public readonly items: Fix[]) {
    super('duplicate entry');
  }
}

/**
 * The FMS side of the interactive ND (A380 FCOM DSC-31-20-30-90): the revisions the flight crew makes on the NDs (DIR TO,
 * INSERT NEXT WPT, DELETE, INSERT / ERASE of the temporary flight plan), the waypoints the flight crew enters with the
 * KCCU, and the state of the temporary flight plan for the ND buttons and the DIRECT TO page.
 */
export class NdInteractiveRevisions<P extends FlightPlanPerformanceData> {
  private lastState = '';

  /** The course of the DIR TO temporary flight plan (CRS IN or CRS OUT), for the CRS field of the ND */
  private directToCourse: NdDirectToCourse | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly fms: NdInteractiveFms<P>,
  ) {
    this.bus
      .getSubscriber<NdInteractiveEvents>()
      .on('nd_interactive_request')
      .handle((request) =>
        this.handle(request).catch((e) => console.error('[NdInteractiveRevisions] revision failed', e)),
      );
    setInterval(() => this.publishState(), STATE_INTERVAL_MS);
  }

  private async handle(request: NdInteractiveRequest): Promise<void> {
    const fps = this.fms.flightPlanInterface;
    switch (request.kind) {
      case 'directTo':
        await this.directTo(request.target, request.option, request.course);
        break;
      case 'delete': {
        // A revision of the temporary flight plan when there is one, else a new temporary flight plan
        const planIndex = fps.hasTemporary ? FlightPlanIndex.Temporary : FlightPlanIndex.Active;
        const index = this.legIndexOf(request.element, planIndex, false);
        if (index !== null) {
          await fps.deleteElementAt(index, false, planIndex);
        }
        break;
      }
      case 'insertNextWpt': {
        // The revised waypoint may be the FROM waypoint (FCOM P 16)
        const planIndex = fps.hasTemporary ? FlightPlanIndex.Temporary : FlightPlanIndex.Active;
        const index = this.legIndexOf(request.revised, planIndex, true);
        if (index === null) {
          break;
        }
        const next = await this.fixOfElement(request.next);
        if (next) {
          await fps.nextWaypoint(index, next, planIndex);
        }
        break;
      }
      case 'insertTmpy':
        if (fps.hasTemporary) {
          await fps.temporaryInsert();
          this.fms.resetRevisedWaypoint();
        }
        break;
      case 'eraseTmpy':
        if (fps.hasTemporary) {
          await fps.temporaryDelete();
          this.fms.resetRevisedWaypoint();
        }
        break;
      case 'resolve':
        await this.resolve(request.side, request.requestId, request.text, request.chosen);
        break;
      case 'error':
        this.fms.showFmsErrorMessage(
          request.error === 'format' ? FmsErrorType.FormatError : FmsErrorType.EntryOutOfRange,
        );
        break;
      default:
        // DATA is handled by the MFD of the side
        break;
    }
    this.publishState();
  }

  // ------------------------------------------------------------------------------------------ DIR TO

  /**
   * DIR TO a target: a flight plan waypoint as a DIR TO its leg, else the database (or pilot) element; a new temporary
   * flight plan for each target or option (as the MFD DIRECT TO page)
   */
  private async directTo(
    target: NdInteractiveElement,
    option: NdDirectToOption,
    enteredCourse: NdDirectToCourse | undefined,
  ): Promise<void> {
    const fps = this.fms.flightPlanInterface;
    const ppos = this.fms.presentPosition();
    if (!fps.hasActive || ppos === null) {
      return;
    }
    if (fps.hasTemporary) {
      await fps.temporaryDelete();
      this.fms.resetRevisedWaypoint();
    }
    this.directToCourse = null;
    const withAbeam = option === NdDirectToOption.DirectWithAbeam;
    const withCourse = option === NdDirectToOption.CrsIn || option === NdDirectToOption.CrsOut;
    const legIndex = this.legIndexOf(target, FlightPlanIndex.Active, false);
    let interceptCourse: DirectToInterceptCourse | undefined;
    if (withCourse) {
      const course = enteredCourse ?? (legIndex !== null ? this.defaultCourse(legIndex, option) : null);
      if (!course) {
        // No DIR TO until the flight crew enters the course
        return;
      }
      interceptCourse = { course: course.course, isTrue: course.isTrue, inbound: option === NdDirectToOption.CrsIn };
      this.directToCourse = course;
    }
    if (legIndex !== null) {
      this.fms.setRevisedWaypoint(legIndex, FlightPlanIndex.Active, false);
      await fps.directToLeg(ppos, this.fms.trueTrack(), legIndex, withAbeam, FlightPlanIndex.Active, interceptCourse);
      return;
    }
    const fix = await this.fixOfElement(target);
    if (fix) {
      await fps.directToWaypoint(ppos, this.fms.trueTrack(), fix, withAbeam, FlightPlanIndex.Active, interceptCourse);
    }
  }

  /**
   * The default course of CRS IN (from the preceding flight plan waypoint to the target) or CRS OUT (from the target to
   * the following one), magnetic (FCOM DSC-31-20-30-90 P 11)
   */
  private defaultCourse(legIndex: number, option: NdDirectToOption): NdDirectToCourse | null {
    const plan = this.fms.flightPlanInterface.active;
    const fixAt = (index: number) => {
      const leg = plan.maybeElementAt(index);
      return leg && leg.isDiscontinuity === false ? leg.terminationWaypoint() : null;
    };
    const target = fixAt(legIndex);
    const other = option === NdDirectToOption.CrsIn ? fixAt(legIndex - 1) : fixAt(legIndex + 1);
    if (!target || !other) {
      return null;
    }
    const trueCourse =
      option === NdDirectToOption.CrsIn
        ? (bearingTo(target.location, other.location) + 180) % 360
        : bearingTo(target.location, other.location);
    const magVar = MagVar.getForFix(target);
    const course = magVar !== null ? MagVar.trueToMagnetic(trueCourse, magVar) : trueCourse;
    return { course: Math.round(course) % 360, isTrue: magVar === null };
  }

  // ------------------------------------------------------------------------------------------ elements and entries

  /**
   * The index of the flight plan leg that ends at the element, from the active leg (or the FROM leg) up to the missed
   * approach
   * @returns the index, or null when the element is not in the flight plan
   */
  private legIndexOf(element: { databaseId: string }, planIndex: FlightPlanIndex, withFromLeg: boolean): number | null {
    const fps = this.fms.flightPlanInterface;
    if (!fps.has(planIndex)) {
      return null;
    }
    const plan = fps.get(planIndex);
    const first = Math.max(plan.activeLegIndex - (withFromLeg ? 1 : 0), 0);
    for (let i = first; i < plan.firstMissedApproachLegIndex; i++) {
      const leg = plan.maybeElementAt(i);
      if (leg && leg.isDiscontinuity === false && leg.terminationWaypoint()?.databaseId === element.databaseId) {
        return i;
      }
    }
    return null;
  }

  /**
   * The fix of an ND element: the database or stored waypoint with its database id, else the nearest one of its ident
   */
  private async fixOfElement(element: NdInteractiveElement): Promise<Fix | undefined> {
    const db = NavigationDatabaseService.activeDatabase;
    const fixes: Fix[] = this.fms.entry.getStoredWaypointsByIdent(element.ident).map((stored) => stored.waypoint);
    if (element.airport) {
      const airport = await db.searchAirport(element.ident);
      if (airport) {
        fixes.push(airport);
      }
    } else {
      const found = await db.searchAllFix(element.ident);
      fixes.push(...found);
    }
    const same = fixes.find((f) => f.databaseId === element.databaseId);
    if (same) {
      return same;
    }
    let nearest: Fix | undefined;
    let nearestDistance = Infinity;
    for (const fix of fixes) {
      const d = Math.hypot(fix.location.lat - element.location.lat, fix.location.long - element.location.long);
      if (d < nearestDistance) {
        nearest = fix;
        nearestDistance = d;
      }
    }
    return nearest;
  }

  private static elementOf(fix: Fix, flightPlan: boolean): NdInteractiveElement {
    return {
      databaseId: fix.databaseId,
      ident: fix.ident,
      location: { lat: fix.location.lat, long: fix.location.long },
      flightPlan,
      airport: isAirport(fix),
    };
  }

  /**
   * A KCCU entry of a waypoint field (FCOM P 10, P 17): the same entry formats as the MFD (WaypointEntryUtils). The
   * DUPLICATE page of the ND chooses among the places that are not unique; a wrong entry shows the FMS message.
   */
  private async resolve(side: 'L' | 'R', requestId: number, text: string, chosen: string[]): Promise<void> {
    let candidates: Fix[] = [];
    try {
      const fix = await WaypointEntryUtils.getOrCreateWaypoint(this.entryFms(chosen), text.trim().toUpperCase(), true);
      if (fix) {
        candidates = [fix];
      }
    } catch (e) {
      if (e instanceof NdDuplicateEntry) {
        candidates = e.items;
      } else if (e instanceof FmsError) {
        this.fms.showFmsErrorMessage(e.type);
      } else {
        throw e;
      }
    }
    const ppos = this.fms.presentPosition();
    this.bus.getPublisher<NdInteractiveEvents>().pub(
      'nd_interactive_resolved',
      {
        side,
        requestId,
        candidates: candidates.map((fix) =>
          NdInteractiveRevisions.elementOf(fix, this.legIndexOf(fix, FlightPlanIndex.Active, false) !== null),
        ),
        distances: candidates.map((fix) => (ppos ? distanceTo(ppos, fix.location) : null)),
      },
      true,
    );
  }

  /**
   * The FMS the entry parser works with: the FMS waypoint functions, and the choice among duplicate places made on the
   * ND (an entry with an unresolved duplicate place is answered with the places to choose from)
   */
  private entryFms(chosen: string[]): FmsDataInterface & FmsDisplayInterface {
    const entry = this.fms.entry;
    const shim: NdWaypointEntryFms &
      Pick<FmsDisplayInterface, 'showFmsErrorMessage' | 'deduplicateFacilities' | 'createNewWaypoint'> = {
      createLatLonWaypoint: (coordinates, stored, ident) => entry.createLatLonWaypoint(coordinates, stored, ident),
      createPlaceBearingDistWaypoint: (place, bearing, distance, stored, ident) =>
        entry.createPlaceBearingDistWaypoint(place, bearing, distance, stored, ident),
      createPlaceBearingPlaceBearingWaypoint: (place1, bearing1, place2, bearing2, stored, ident) =>
        entry.createPlaceBearingPlaceBearingWaypoint(place1, bearing1, place2, bearing2, stored, ident),
      getStoredWaypointsByIdent: (ident) => entry.getStoredWaypointsByIdent(ident),
      showFmsErrorMessage: (type) => this.fms.showFmsErrorMessage(type),
      // NOT IN DATABASE: no NEW WAYPOINT page from the ND
      createNewWaypoint: async () => undefined,
      deduplicateFacilities: async <T extends DatabaseItem<any>>(items: T[]): Promise<T | undefined> => {
        if (items.length === 1) {
          return items[0];
        }
        const choice = items.find((item) => chosen.includes(item.databaseId));
        if (choice) {
          return choice;
        }
        throw new NdDuplicateEntry(items as unknown as Fix[]);
      },
    };
    return shim as unknown as FmsDataInterface & FmsDisplayInterface;
  }

  // ------------------------------------------------------------------------------------------ state

  /** The waypoints of the active flight plan for the DIRECT TO list: the XF legs from the active leg to the missed approach */
  private directToWaypoints(): NdInteractiveElement[] {
    const fps = this.fms.flightPlanInterface;
    if (!fps.hasActive) {
      return [];
    }
    const plan = fps.active;
    const list: NdInteractiveElement[] = [];
    for (let i = Math.max(plan.activeLegIndex, 0); i < plan.firstMissedApproachLegIndex; i++) {
      const leg = plan.maybeElementAt(i);
      if (!leg || leg.isDiscontinuity === true || !leg.isXF() || leg.flags & FlightPlanLegFlags.DirectToTurningPoint) {
        continue;
      }
      const fix = leg.terminationWaypoint();
      if (fix) {
        list.push(NdInteractiveRevisions.elementOf(fix, true));
      }
    }
    return list;
  }

  private publishState(): void {
    const fps = this.fms.flightPlanInterface;
    const tmpy = fps.hasTemporary;
    let directTo = false;
    let directToTarget: string | null = null;
    let directToDistance: number | null = null;
    if (tmpy) {
      const plan = fps.temporary;
      const fromLeg = plan.maybeElementAt(plan.fromLegIndex);
      directTo =
        fromLeg !== undefined &&
        fromLeg.isDiscontinuity === false &&
        (fromLeg.flags & FlightPlanLegFlags.DirectToTurningPoint) !== 0;
      const activeLeg = plan.maybeElementAt(plan.activeLegIndex);
      if (directTo && activeLeg && activeLeg.isDiscontinuity === false) {
        directToTarget = activeLeg.ident;
        // The leg distance once the guidance computed it, else the great circle distance from the aircraft
        const ppos = this.fms.presentPosition();
        const targetFix = activeLeg.terminationWaypoint();
        const legDistance = activeLeg.calculated?.cumulativeDistance;
        if (legDistance) {
          directToDistance = legDistance;
        } else if (ppos && targetFix) {
          directToDistance = distanceTo(ppos, targetFix.location);
        }
      }
    }
    const state: NdInteractiveState = {
      tmpy,
      directTo,
      directToTarget,
      directToDistance,
      directToUtc: directTo
        ? directToEtaSeconds(directToDistance, this.fms.groundSpeed(), SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'))
        : null,
      directToCourse: directTo ? this.directToCourse : null,
      waypoints: this.directToWaypoints(),
    };
    const serialized = JSON.stringify(state);
    if (serialized !== this.lastState) {
      this.lastState = serialized;
      this.bus.getPublisher<NdInteractiveEvents>().pub('nd_interactive_state', state, true);
    }
  }
}
