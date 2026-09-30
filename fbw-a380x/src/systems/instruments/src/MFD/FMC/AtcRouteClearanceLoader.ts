// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { Coordinates } from 'msfs-geo';
import { Airway, Fix, WaypointConstraintType } from '@flybywiresim/fbw-sdk';
import { AtcFmsMessages, FmsAtcMessages } from '@datalink/atc';
import { CpdlcMessage, MailboxStatusMessage } from '@datalink/common';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanFlags } from '@fmgc/flightplanning/plans/FlightPlanFlags';
import { FlightPlan } from '@fmgc/flightplanning/plans/FlightPlan';
import { FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { PilotWaypoint } from '@fmgc/flightplanning/DataManager';
import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';
import { TimeConstraint } from './TimeConstraint';
import { AtcConstraintClearance, constraintClearanceOf } from './AtcConstraintClearance';
import {
  REJECT_AWY_WPT_MISMATCH,
  REJECT_NOT_ALLOWED_IN_PHASE,
  REJECT_NOT_IN_DATABASE,
  RejectedAtcElement,
  RouteClearance,
  RouteClearanceDatabase,
  resolveRouteClearance,
  routeClearanceOf,
} from './AtcRouteClearance';

/** An ATC flight plan can only be uploaded in the third secondary flight plan (A380 FCOM DSC-22-FMS-20-30 P 333) */
const ATC_SEC = 3;
const ATC_PLAN_INDEX = FlightPlanIndex.FirstSecondary + ATC_SEC - 1;

/** The error type of a position that is not in the flight plan (UM83 AT [position], a crossing constraint) */
const REJECT_NOT_IN_FPLN = 'NOT IN F-PLN';

/** The FMS, as the ATC flight plan upload needs it */
export interface AtcRouteClearanceFms<P extends FlightPlanPerformanceData> {
  readonly flightPlanInterface: FlightPlanService<P>;
  readonly enginesWereStarted: Subscribable<boolean>;
  createLatLonWaypoint(coordinates: Coordinates, stored: boolean, ident?: string): PilotWaypoint | null;
  addMessageToQueue(message: TypeIIMessage, isResolved: undefined, onClear: undefined): void;
  setSecondaryTimeConstraint(planIndex: number, rta: TimeConstraint | null): void;
}

/** The aircraft state the upload needs */
export interface AtcRouteClearanceAircraft {
  /** The aircraft position, null when unknown */
  presentPosition(): Coordinates | null;
  /** Whether an RTA can be created (FCOM DSC-22-FMS-20-30 P 344: not with an engine out, not in go around) */
  rtaAllowed(): boolean;
  /** Whether the aircraft has not reached the cruise yet (preflight to climb) */
  beforeCruise(): boolean;
}

/** The result of an upload: the number of loaded elements and the rejected ones */
interface UploadResult {
  loaded: number;
  rejected: RejectedAtcElement[];
}

/**
 * Loads the loadable messages of the ATC mailbox in the third secondary flight plan (LOAD-SEC3 button, A380 FCOM
 * DSC-22-FMS-10-40-70 "ATC flight plan upload", DSC-22-FMS-10-40-100 "Received ATC F-PLN clearance" and DSC-46-10-40
 * "How to manage a loadable message"): SEC 3 is replaced by a copy of the active flight plan in which the FMS inserts
 * the message.
 * - A route clearance joins the flight plan at its first waypoint when the flight plan has it (UM83: at the AT
 *   position), otherwise after the departure or the FROM waypoint; it goes to the clearance limit (UM79), after which the
 *   flight plan continues, or to the destination (UM80, UM83).
 * - A crossing constraint puts its altitude, speed and time (RTA) constraints on its waypoint, as the VERT REV page.
 * Unknown elements are rejected (REJECTED ATC INFO page) and the load goes on without them.
 */
export class AtcRouteClearanceLoader<P extends FlightPlanPerformanceData> {
  /** The elements of the last ATC flight plan that the FMS rejected, for the REJECTED ATC INFO page */
  public readonly rejectedElements = Subject.create<readonly RejectedAtcElement[]>([]);

  private readonly publisher = this.bus.getPublisher<FmsAtcMessages>();

  constructor(
    private readonly bus: EventBus,
    private readonly fms: AtcRouteClearanceFms<P>,
    private readonly aircraft: AtcRouteClearanceAircraft,
  ) {
    this.bus
      .getSubscriber<AtcFmsMessages>()
      .on('atcLoadRouteClearance')
      .handle(({ uid, message }) =>
        this.load(message).then((status) =>
          this.publisher.pub('atcRouteClearanceLoaded', { uid, status }, true, false),
        ),
      );
  }

  /**
   * Loads a route clearance or a crossing constraint in SEC 3, with the FMS message of the result (FCOM
   * DSC-22-FMS-20-110)
   * @param message the uplink message
   * @returns the mailbox indication: LOAD OK, LOAD PARTIAL, LOAD FAILED, or LOAD NOT AVAIL without a loadable element or
   * a navigation database
   */
  public async load(message: CpdlcMessage): Promise<MailboxStatusMessage> {
    const route = routeClearanceOf(message);
    const constraints = route === null ? constraintClearanceOf(message) : null;
    if ((route === null && constraints === null) || !NavigationDatabaseService.activeDatabase) {
      return MailboxStatusMessage.FlightplanLoadingUnavailable;
    }

    let result: UploadResult | null;
    try {
      if (route !== null) {
        result = await this.upload(route);
      } else {
        result = constraints !== null ? await this.uploadConstraints(constraints) : null;
      }
    } catch (e) {
      console.error('[AtcRouteClearanceLoader] ATC flight plan upload failed', e);
      result = null;
    }

    if (result === null || result.loaded === 0) {
      // Totally rejected: any data previously entered in SEC 3 is deleted
      const fps = this.fms.flightPlanInterface;
      if (fps.hasSecondary(ATC_SEC)) {
        await fps.secondaryDelete(ATC_SEC);
      }
      this.rejectedElements.set(result?.rejected ?? []);
      this.fms.addMessageToQueue(NXSystemMessages.receivedAtcMsgNotValid, undefined, undefined);
      return MailboxStatusMessage.FlightplanLoadFailed;
    }

    this.rejectedElements.set(result.rejected);
    if (result.rejected.length > 0) {
      this.fms.addMessageToQueue(NXSystemMessages.atcFplnInsertedSec3Rejected, undefined, undefined);
      return MailboxStatusMessage.FlightplanLoadPartial;
    }
    this.fms.addMessageToQueue(NXSystemMessages.atcFplnInsertedSec3, undefined, undefined);
    return MailboxStatusMessage.FlightplanLoadSecondary;
  }

  /**
   * Creates SEC 3 and inserts the route clearance
   * @param clearance the route clearance
   * @returns the loaded and rejected elements, or null when there is no flight plan to insert the clearance into
   */
  private async upload(clearance: RouteClearance): Promise<UploadResult | null> {
    const fps = this.fms.flightPlanInterface;
    const db = NavigationDatabaseService.activeDatabase;
    const plan = (): FlightPlan<P> => fps.secondary(ATC_SEC);

    const database: RouteClearanceDatabase = {
      fixes: (ident) => db.searchAllFix(ident),
      airways: (ident, from) => db.searchAirway(ident, from),
      departures: (airport) => db.backendDatabase.getDepartures(airport),
      arrivals: (airport) => db.backendDatabase.getArrivals(airport),
      isAirport: async (ident) => {
        const airport = await db.searchAirport(ident);
        return airport !== undefined;
      },
    };

    // An existing SEC 3 is deleted; SEC 3 is a copy of the active flight plan
    if (fps.hasSecondary(ATC_SEC)) {
      await fps.secondaryDelete(ATC_SEC);
    }
    const active = fps.hasActive ? fps.active : null;
    let origin = active?.originAirport?.ident ?? null;
    let destination = active?.destinationAirport?.ident ?? null;
    if (origin !== null) {
      await fps.secondaryCopyFromActive(ATC_SEC, !this.fms.enginesWereStarted.get());
    } else {
      // A flight plan initialization: the clearance starts at the origin and ends at the destination
      const first = clearance.tokens[0];
      const last = clearance.tokens[clearance.tokens.length - 1];
      if (first === undefined || first === last) {
        return null;
      }
      const firstIsAirport = await database.isAirport(first);
      const lastIsAirport = await database.isAirport(last);
      if (!firstIsAirport || !lastIsAirport) {
        return null;
      }
      await fps.secondaryInit(ATC_SEC);
      await fps.newCityPair(first, last, undefined, ATC_PLAN_INDEX);
      origin = first;
      destination = last;
    }

    // A SID only before the aircraft flies the departure (the first leg after the origin is still the active one)
    const sidAllowed = plan().activeLegIndex <= 1;
    const near = this.aircraft.presentPosition() ?? plan().originAirport?.location ?? null;
    const resolved = await resolveRouteClearance(clearance, origin, destination, near, sidAllowed, database);

    const rejected = resolved.rejected.slice();
    const items = resolved.items.slice();
    let loaded = 0;

    const sid = items[0]?.kind === 'sid' ? items.shift() : undefined;
    const star = items[items.length - 1]?.kind === 'star' ? items.pop() : undefined;
    if (sid?.kind === 'sid') {
      await fps.setDepartureProcedure(sid.databaseId, ATC_PLAN_INDEX);
      loaded++;
    }

    // Where the route starts: the AT position (UM83), the first waypoint of the route when the flight plan has it, or
    // the end of the departure (the FROM waypoint in flight)
    const startSearch = Math.max(plan().activeLegIndex - 1, plan().findLastDepartureLeg()[2], 0);
    let head: number;
    if (clearance.joinPosition !== null) {
      head = this.legIndex(plan(), clearance.joinPosition, Math.max(plan().activeLegIndex - 1, 0));
      if (head < 0) {
        rejected.unshift({
          description: 'EN RTE WPTS',
          value: clearance.joinPosition,
          at: null,
          error: REJECT_NOT_IN_FPLN,
        });
        return { loaded: 0, rejected };
      }
    } else {
      const first = items[0];
      const joinIndex = first?.kind === 'fix' ? this.legIndex(plan(), first.fix.ident, startSearch) : -1;
      if (joinIndex >= 0) {
        head = joinIndex;
        items.shift();
        loaded++;
      } else {
        head = startSearch;
      }
    }
    while (head > 0 && plan().elementAt(head).isDiscontinuity === true) {
      head--;
    }

    for (const item of items) {
      const headIdent = this.identAt(plan(), head);
      switch (item.kind) {
        case 'fix':
          // The first waypoint of the route can be the last one of the SID
          if (headIdent !== item.fix.ident) {
            await fps.nextWaypoint(head, item.fix, ATC_PLAN_INDEX);
            head = this.nextHead(plan(), item.fix.ident, head);
          }
          loaded++;
          break;
        case 'latlon': {
          const waypoint = this.fms.createLatLonWaypoint(item.location, true);
          if (waypoint === null) {
            rejected.push({
              description: 'EN RTE WPTS',
              value: item.ident,
              at: headIdent,
              error: REJECT_NOT_IN_DATABASE,
            });
            break;
          }
          await fps.nextWaypoint(head, waypoint.waypoint, ATC_PLAN_INDEX);
          head = this.nextHead(plan(), waypoint.waypoint.ident, head);
          loaded++;
          break;
        }
        case 'airway': {
          const p = plan();
          const element = p.elementAt(head);
          const onAirway =
            element.isDiscontinuity === false &&
            element.isXF() &&
            item.airway.fixes.some((fix) => fix.ident === headIdent);
          if (!onAirway || headIdent === null) {
            // The airway does not start at the previous waypoint: its end is joined direct
            rejected.push({
              description: 'AIRWAYS',
              value: item.airway.ident,
              at: headIdent,
              error: REJECT_AWY_WPT_MISMATCH,
            });
            await fps.nextWaypoint(head, item.to, ATC_PLAN_INDEX);
            head = this.nextHead(plan(), item.to.ident, head);
            break;
          }

          // An airway entry, as on the AIRWAYS page, from an en route waypoint
          let entered = false;
          if (p.segmentPositionForIndex(head)[0] === p.enrouteSegment) {
            await fps.startAirwayEntry(head, ATC_PLAN_INDEX);
            const viaAirway = await fps.continueAirwayEntryViaAirway(item.airway, ATC_PLAN_INDEX);
            if (viaAirway) {
              entered = await fps.continueAirwayEntryToFix(item.to, false, ATC_PLAN_INDEX);
            }
            if (entered) {
              await fps.finaliseAirwayEntry(ATC_PLAN_INDEX);
            } else {
              plan().pendingAirways = undefined;
            }
          }
          if (!entered) {
            // From the last waypoint of the SID (no airway entry out of the en route part): its waypoints one by one
            for (const fix of this.airwayFixes(item.airway, headIdent, item.to)) {
              await fps.nextWaypoint(head, fix, ATC_PLAN_INDEX);
              head = this.nextHead(plan(), fix.ident, head);
            }
          }
          head = this.nextHead(plan(), item.to.ident, head - 1);
          loaded++;
          break;
        }
        default:
          break;
      }
    }

    if (resolved.newDestination !== null) {
      await fps.newDest(head, resolved.newDestination, ATC_PLAN_INDEX);
      loaded++;
    } else if (clearance.typeId !== 'UM79' || clearance.clearanceLimit === destination) {
      // The route goes to the destination: the rest of the former en route part is replaced
      await this.deleteEnrouteAfter(fps, plan, head);
    }

    if (star?.kind === 'star') {
      await fps.setArrival(star.databaseId, ATC_PLAN_INDEX);
      loaded++;
    }

    this.markAtcFlightPlan(plan());
    return { loaded, rejected };
  }

  /**
   * Creates SEC 3 and puts the constraints of a crossing constraint message on its waypoint
   * @param clearance the constraints
   * @returns the loaded and rejected elements, or null when there is no active flight plan to copy
   */
  private async uploadConstraints(clearance: AtcConstraintClearance): Promise<UploadResult | null> {
    const fps = this.fms.flightPlanInterface;
    if (fps.hasSecondary(ATC_SEC)) {
      await fps.secondaryDelete(ATC_SEC);
    }
    if (!fps.hasActive || !fps.active.originAirport) {
      return null;
    }
    await fps.secondaryCopyFromActive(ATC_SEC, !this.fms.enginesWereStarted.get());
    const plan = fps.secondary(ATC_SEC);

    const rejected = clearance.rejected.slice();
    const { altitude, speed, time } = clearance.elements;

    // The waypoint, from the TO waypoint on
    const index = this.legIndex(plan, clearance.position, Math.max(plan.activeLegIndex, 0));
    if (index < 0) {
      for (const element of [altitude, speed, time]) {
        if (element) {
          rejected.push({ ...element, error: REJECT_NOT_IN_FPLN });
        }
      }
      return { loaded: 0, rejected };
    }

    const leg = plan.legElementAt(index);
    const isDescent = this.isDescentConstraint(plan, index);
    let loaded = 0;
    if (clearance.altitude) {
      await fps.setPilotEnteredAltitudeConstraintAt(index, isDescent, clearance.altitude, ATC_PLAN_INDEX);
      loaded++;
    }
    if (clearance.speed !== null) {
      await fps.setPilotEnteredSpeedConstraintAt(index, isDescent, clearance.speed, ATC_PLAN_INDEX);
      loaded++;
    }
    if (clearance.time) {
      if (this.aircraft.rtaAllowed() && leg.definition.waypoint) {
        this.fms.setSecondaryTimeConstraint(ATC_PLAN_INDEX, {
          ident: leg.ident,
          databaseId: leg.definition.waypoint.databaseId,
          type: clearance.time.type,
          utcSeconds: clearance.time.utcSeconds,
        });
        loaded++;
      } else if (time) {
        rejected.push({ ...time, error: REJECT_NOT_ALLOWED_IN_PHASE });
      }
    }

    this.markAtcFlightPlan(plan);
    return { loaded, rejected };
  }

  /**
   * Whether a constraint on a waypoint is a descent constraint: the type of the waypoint, or of its part of the flight
   * plan (departure: climb, arrival and approach: descent). The FMS cannot tell for an en route waypoint (the VERT REV
   * page then offers the CLB/DES option): a descent constraint once in cruise, and before the cruise one in the second
   * half of the en route waypoints.
   * @param plan the flight plan
   * @param index the index of the waypoint
   * @returns true for a descent constraint
   */
  private isDescentConstraint(plan: FlightPlan<P>, index: number): boolean {
    const leg = plan.legElementAt(index);
    const type =
      leg.constraintType === WaypointConstraintType.Unknown
        ? plan.autoConstraintTypeForLegIndex(index)
        : leg.constraintType;
    if (type !== WaypointConstraintType.Unknown) {
      return type === WaypointConstraintType.DES;
    }
    if (!this.aircraft.beforeCruise()) {
      return true;
    }
    const firstEnroute =
      plan.originSegment.allLegs.length +
      plan.departureRunwayTransitionSegment.allLegs.length +
      plan.departureSegment.allLegs.length +
      plan.departureEnrouteTransitionSegment.allLegs.length;
    return index - firstEnroute >= plan.enrouteSegment.allLegs.length / 2;
  }

  /** SEC INDEX: CREATED hh:mm (ATC F-PLN), REJECTED ATC INFO on the SEC 3 panel */
  private markAtcFlightPlan(sec: FlightPlan<P>): void {
    sec.flags = FlightPlanFlags.AtcFlightPlan;
    sec.wasModified = false;
    sec.incrementVersion();
  }

  /**
   * The index of a waypoint in a flight plan
   * @param plan the flight plan
   * @param ident the waypoint ident
   * @param from the first index to search
   * @returns the index of the first leg ending at the waypoint, or -1
   */
  private legIndex(plan: FlightPlan<P>, ident: string, from: number): number {
    const legs = plan.allLegs;
    for (let i = Math.max(0, from); i < legs.length; i++) {
      if (this.identAt(plan, i) === ident) {
        return i;
      }
    }
    return -1;
  }

  /** The waypoint ident at an index of a flight plan, null for a discontinuity or a leg without waypoint */
  private identAt(plan: FlightPlan<P>, index: number): string | null {
    const element = plan.maybeElementAt(index);
    if (!element || element.isDiscontinuity === true) {
      return null;
    }
    return element.terminationWaypoint()?.ident ?? null;
  }

  /**
   * The waypoints of an airway after a waypoint, up to another one, in the direction of flight
   * @param airway the airway
   * @param fromIdent the waypoint where the airway is joined
   * @param to the waypoint where the airway is left
   * @returns the waypoints after the first one, up to the last one included
   */
  private airwayFixes(airway: Airway, fromIdent: string, to: Fix): Fix[] {
    const from = airway.fixes.findIndex((fix) => fix.ident === fromIdent);
    const end = airway.fixes.findIndex((fix) => fix.ident === to.ident);
    if (from < 0 || end < 0 || from === end) {
      return [to];
    }
    return from < end ? airway.fixes.slice(from + 1, end + 1) : airway.fixes.slice(end, from).reverse();
  }

  /** The index of the waypoint just inserted after the head (the head moves along the inserted route) */
  private nextHead(plan: FlightPlan<P>, ident: string, head: number): number {
    const index = this.legIndex(plan, ident, head + 1);
    return index >= 0 ? index : head + 1;
  }

  /** Deletes the en route elements after an index, up to the arrival */
  private async deleteEnrouteAfter(fps: FlightPlanService<P>, plan: () => FlightPlan<P>, head: number): Promise<void> {
    // Bounded: each pass deletes one element
    for (let pass = 0; pass < 500; pass++) {
      const p = plan();
      const lastEnrouteIndex =
        p.originSegment.allLegs.length +
        p.departureRunwayTransitionSegment.allLegs.length +
        p.departureSegment.allLegs.length +
        p.departureEnrouteTransitionSegment.allLegs.length +
        p.enrouteSegment.allLegs.length -
        1;
      if (head + 1 > lastEnrouteIndex) {
        return;
      }
      const count = p.allLegs.length;
      await fps.deleteElementAt(head + 1, false, ATC_PLAN_INDEX);
      if (plan().allLegs.length >= count) {
        return;
      }
    }
  }
}
