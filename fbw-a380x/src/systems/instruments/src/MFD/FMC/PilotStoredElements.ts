// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { Coordinates } from 'msfs-geo';
import type { Fix as CoRouteFix } from '@simbridge/Coroute/Fix';
import { PilotStoredElementsPersistence } from './PilotStoredElementsPersistence';

/**
 * Classes of a pilot stored NAVAID (A380 FCOM DSC-22-FMS-20-30, DATA / NAVAID page, NEW NAVAID function: VOR, DME,
 * LOC, ILS, GLS, NDB, VOR/DME).
 */
export enum PilotNavaidClass {
  Vor,
  Dme,
  Loc,
  Ils,
  Gls,
  Ndb,
  VorDme,
}

export const pilotNavaidClassLabels: readonly string[] = ['VOR', 'DME', 'LOC', 'ILS', 'GLS', 'NDB', 'VOR/DME'];

export function isLandingSystemClass(navaidClass: PilotNavaidClass): boolean {
  return (
    navaidClass === PilotNavaidClass.Loc || navaidClass === PilotNavaidClass.Ils || navaidClass === PilotNavaidClass.Gls
  );
}

/** ELEVATION is not displayed for VOR and NDB (FCOM). */
export function hasElevation(navaidClass: PilotNavaidClass): boolean {
  return navaidClass !== PilotNavaidClass.Vor && navaidClass !== PilotNavaidClass.Ndb;
}

/** STATION DEC is only displayed for VOR and VOR/DME (FCOM). */
export function hasStationDeclination(navaidClass: PilotNavaidClass): boolean {
  return navaidClass === PilotNavaidClass.Vor || navaidClass === PilotNavaidClass.VorDme;
}

/** A NAVAID created by the flight crew (FCOM DATA / NAVAID page, PILOT STORED NAVAIDS panel). */
export interface PilotStoredNavaid {
  ident: string;
  class: PilotNavaidClass;
  location: Coordinates;
  /** Feet, not for VOR and NDB */
  elevation?: number;
  /** Landing system NAVAIDs only */
  runwayIdent?: string;
  /** Degrees, positive east; VOR and VOR/DME only */
  stationDeclination?: number;
  /** MHz for VOR / DME / LOC / ILS, kHz for NDB */
  frequency?: number;
  /** GLS only */
  channel?: number;
  /** Approach category 1, 2 or 3; landing system NAVAIDs only */
  category?: number;
  /** 0 (40 NM), 1 (70 NM), 2 (130 NM) or 3 (250 NM) */
  figureOfMerit?: number;
  /** Degrees; landing system NAVAIDs only */
  course?: number;
  /** Whether the course is in true north reference */
  courseTrue?: boolean;
  /** Degrees, negative; GLS only */
  slope?: number;
}

/** A runway created by the flight crew (FCOM DATA / AIRPORT page, PILOT STORED RWYs panel, P 55-60). */
export interface PilotStoredRunway {
  /** Ident of the airport of the runway */
  airportIdent: string;
  /** Runway ident, e.g. 15R */
  ident: string;
  /** Runway threshold */
  location: Coordinates;
  /** Feet */
  elevation: number;
  /** Feet */
  length: number;
  /** Degrees */
  course: number;
  /** Ident of the landing system of the runway, if any */
  lsIdent?: string;
}

/** The procedures of a stored route, kept so an inserted route gets them back (idents for the summary, ids to select). */
export interface StoredRouteProcedures {
  originRunwayIdent?: string;
  departureIdent?: string;
  departureDatabaseId?: string;
  departureTransitionIdent?: string;
  departureTransitionDatabaseId?: string;
  arrivalTransitionIdent?: string;
  arrivalTransitionDatabaseId?: string;
  arrivalIdent?: string;
  arrivalDatabaseId?: string;
  approachViaIdent?: string;
  approachViaDatabaseId?: string;
  approachIdent?: string;
  approachDatabaseId?: string;
  /** First waypoint of the approach (FCOM: the summary shows the first waypoint and the name of the procedure) */
  approachFirstWaypointIdent?: string;
  destinationRunwayIdent?: string;
}

/**
 * A company route: either one of the navigation database (SimBridge company routes) or one stored by the flight crew
 * (FCOM DATA / ROUTE page, PILOT STORED RTEs panel). The en-route part uses the SimBridge navlog format so that both
 * kinds are inserted by the same uplink adapter.
 */
export interface StoredRoute {
  ident: string;
  originIcao: string;
  destinationIcao: string;
  alternateIcao?: string;
  /** En-route fixes with the airway they are reached by ("DCT" for a direct leg) */
  navlog: CoRouteFix[];
  procedures: StoredRouteProcedures;
}

/** The pilot stored routes database has a maximum of 5 routes (FCOM). */
export const maxPilotStoredRoutes = 5;

/** Each stored route has a maximum size of 30 flight plan elements (FCOM). */
export const maxStoredRouteElements = 30;

/** The pilot stored NAVAIDs database has a maximum of 20 NAVAIDs (FCOM). */
export const maxPilotStoredNavaids = 20;

/** The pilot stored runways database has a maximum of 10 runways (FCOM P 56). */
export const maxPilotStoredRunways = 10;

/**
 * The pilot stored elements database of the FMS, except the waypoints (kept by the DataManager): NAVAIDs, runways and
 * company routes, persisted in the browser storage like the pilot stored waypoints, for the sim session (FCOM: deleted
 * when all the FMCs are shut down), or from one session to the next with the flypad setting (see
 * {@link PilotStoredElementsPersistence}).
 *
 * Stored NAVAIDs are not tunable and not usable as flight plan fixes yet, stored runways are not usable in the flight
 * plan yet; stored routes are inserted through the company route uplink adapter.
 */
export class PilotStoredElements {
  private static readonly navaidsStorageKey = 'A380X.PilotStoredNavaids';

  private static readonly routesStorageKey = 'A380X.PilotStoredRoutes';

  private static readonly runwaysStorageKey = 'A380X.PilotStoredRunways';

  private readonly _navaids: Subject<readonly PilotStoredNavaid[]>;

  private readonly _routes: Subject<readonly StoredRoute[]>;

  private readonly _runways: Subject<readonly PilotStoredRunway[]>;

  constructor() {
    // The elements kept from the previous sim session (flypad setting) are put back before they are read
    PilotStoredElementsPersistence.start();
    this._navaids = Subject.create<readonly PilotStoredNavaid[]>(
      PilotStoredElements.load<PilotStoredNavaid>(PilotStoredElements.navaidsStorageKey),
    );
    this._routes = Subject.create<readonly StoredRoute[]>(
      PilotStoredElements.load<StoredRoute>(PilotStoredElements.routesStorageKey),
    );
    this._runways = Subject.create<readonly PilotStoredRunway[]>(
      PilotStoredElements.load<PilotStoredRunway>(PilotStoredElements.runwaysStorageKey),
    );
  }

  get runways(): Subscribable<readonly PilotStoredRunway[]> {
    return this._runways;
  }

  get navaids(): Subscribable<readonly PilotStoredNavaid[]> {
    return this._navaids;
  }

  get routes(): Subscribable<readonly StoredRoute[]> {
    return this._routes;
  }

  findNavaid(ident: string): PilotStoredNavaid | undefined {
    return this._navaids.get().find((n) => n.ident === ident);
  }

  /**
   * Stores a NAVAID. When the database is full, the first created NAVAID is deleted (FCOM: "the first created NAVAID
   * that is not part of the flight plan is deleted"; stored NAVAIDs cannot be part of the flight plan yet).
   */
  storeNavaid(navaid: PilotStoredNavaid): void {
    const navaids = this._navaids.get().filter((n) => n.ident !== navaid.ident);
    while (navaids.length >= maxPilotStoredNavaids) {
      navaids.shift();
    }
    navaids.push(navaid);
    this.setNavaids(navaids);
  }

  deleteNavaid(index: number): void {
    this.setNavaids(this._navaids.get().filter((_, i) => i !== index));
  }

  deleteAllNavaids(): void {
    this.setNavaids([]);
  }

  /**
   * Stores a runway (a runway with the same airport and ident is replaced). When the database is full, the first
   * created runway is deleted (FCOM P 60: "the first created runway (that is not part of the flight plan)"; stored
   * runways cannot be part of the flight plan yet).
   */
  storeRunway(runway: PilotStoredRunway): void {
    const runways = this._runways
      .get()
      .filter((r) => r.airportIdent !== runway.airportIdent || r.ident !== runway.ident);
    while (runways.length >= maxPilotStoredRunways) {
      runways.shift();
    }
    runways.push(runway);
    this.setRunways(runways);
  }

  deleteRunway(runway: PilotStoredRunway): void {
    this.setRunways(this._runways.get().filter((r) => r !== runway));
  }

  deleteAllRunways(): void {
    this.setRunways([]);
  }

  findRoute(ident: string): StoredRoute | undefined {
    return this._routes.get().find((r) => r.ident === ident);
  }

  /** The stored routes of a city pair, for the ROUTE SELECTION page. */
  routesForCityPair(originIcao: string, destinationIcao: string): StoredRoute[] {
    return this._routes.get().filter((r) => r.originIcao === originIcao && r.destinationIcao === destinationIcao);
  }

  /** @returns false when the list is full (FCOM: PILOT RTEs LIST FULL) */
  storeRoute(route: StoredRoute): boolean {
    if (this._routes.get().length >= maxPilotStoredRoutes) {
      return false;
    }
    this.setRoutes([...this._routes.get(), route]);
    return true;
  }

  deleteRoute(index: number): void {
    this.setRoutes(this._routes.get().filter((_, i) => i !== index));
  }

  deleteAllRoutes(): void {
    this.setRoutes([]);
  }

  private setNavaids(navaids: PilotStoredNavaid[]): void {
    this._navaids.set(navaids);
    PilotStoredElements.save(PilotStoredElements.navaidsStorageKey, navaids);
  }

  private setRunways(runways: PilotStoredRunway[]): void {
    this._runways.set(runways);
    PilotStoredElements.save(PilotStoredElements.runwaysStorageKey, runways);
  }

  private setRoutes(routes: StoredRoute[]): void {
    this._routes.set(routes);
    PilotStoredElements.save(PilotStoredElements.routesStorageKey, routes);
  }

  private static load<T>(key: string): T[] {
    try {
      const stored = localStorage.getItem(key);
      const parsed = stored !== null ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (e) {
      console.warn(`[FMS] Could not read the pilot stored elements "${key}":`, e);
      return [];
    }
  }

  private static save(key: string, elements: readonly unknown[]): void {
    localStorage.setItem(key, JSON.stringify(elements));
  }
}
