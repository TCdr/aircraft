// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument, RunwaySurfaceType, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  AwarenessRunway,
  AwarenessRunwayGeometry,
  NearbyRunwayProvider,
  ViewListenerUtils,
} from '@flybywiresim/fbw-sdk';

/**
 * A runway as the EGPWC terrain functions use it: its primary landing threshold, the true course from there, the
 * length from the threshold to the far end of the runway, and the threshold elevation.
 */
export interface EgpwcDatabaseRunway {
  latitude: number;
  longitude: number;
  elevationFt: number;
  trueHeadingDeg: number;
  lengthFt: number;
}

const METRES_PER_FOOT = 0.3048;
const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/**
 * DESIGN CHOICE: the surfaces of the hard runways of the real database. Ice strips, planks, steel mats and scenery
 * surfaces are not runways an airliner lands on, and every runway listed changes the alerts around it.
 */
const HARD_SURFACES: readonly RunwaySurfaceType[] = [
  RunwaySurfaceType.Asphalt,
  RunwaySurfaceType.Bituminous,
  RunwaySurfaceType.Brick,
  RunwaySurfaceType.Concrete,
  RunwaySurfaceType.Macadam,
  RunwaySurfaceType.Tarmac,
];

/** Whether the EGPWC database holds the runway: hard surface and long enough for the terrain functions */
export function isEgpwcDatabaseRunway(runway: AwarenessRunway): boolean {
  // DESIGN CHOICE: a source that gives no surface is taken as paved, so that its runways are not lost
  const hardSurface = runway.surface === undefined || HARD_SURFACES.includes(runway.surface);
  return hardSurface && runway.length >= EgpwcRunwayDatabase.MIN_RUNWAY_LENGTH_FT * METRES_PER_FOOT;
}

function roundTo(value: number, decimals: number): number {
  const scale = Math.pow(10, decimals);
  // Adding 0 turns a rounded -0 into 0
  return Math.round(value * scale) / scale + 0;
}

/** One entry per runway: the Rust side derives the opposite direction itself */
export function toEgpwcDatabaseRunway(runway: AwarenessRunway): EgpwcDatabaseRunway {
  const primary = runway.ends[0];
  const course = primary.course * DEG_TO_RAD;
  const metresAlongCourse = -runway.length / 2 + primary.displacedThreshold;
  const latitudeOffset = (metresAlongCourse * Math.cos(course)) / EARTH_RADIUS_M;
  const longitudeOffset =
    (metresAlongCourse * Math.sin(course)) / (EARTH_RADIUS_M * Math.cos(runway.latitude * DEG_TO_RAD));

  return {
    latitude: roundTo(runway.latitude + latitudeOffset / DEG_TO_RAD, 5),
    longitude: roundTo(runway.longitude + longitudeOffset / DEG_TO_RAD, 5),
    elevationFt: Math.round(primary.elevation / METRES_PER_FOOT),
    trueHeadingDeg: roundTo(primary.course, 1),
    lengthFt: Math.round((runway.length - primary.displacedThreshold) / METRES_PER_FOOT),
  };
}

/**
 * The runways for the message: the nearest ones only, in an order that does not depend on the order the provider
 * lists them in, so that the message changes only when the set of runways changes.
 */
export function egpwcDatabaseRunways(
  runways: readonly AwarenessRunway[],
  latitude: number,
  longitude: number,
): EgpwcDatabaseRunway[] {
  const longitudeScale = Math.cos(latitude * DEG_TO_RAD);
  const distanceToAircraft = (runway: AwarenessRunway) =>
    Math.hypot(runway.latitude - latitude, (runway.longitude - longitude) * longitudeScale);

  return runways
    .filter(isEgpwcDatabaseRunway)
    .sort((a, b) => distanceToAircraft(a) - distanceToAircraft(b))
    .slice(0, EgpwcRunwayDatabase.MAX_RUNWAYS)
    .sort((a, b) => {
      const keyA = AwarenessRunwayGeometry.key(a);
      const keyB = AwarenessRunwayGeometry.key(b);
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    })
    .map(toEgpwcDatabaseRunway);
}

/**
 * The runway database of the EGPWC: the hard surface runways of 3500 ft or more of the airports around the aircraft,
 * from the sim's airport database, sent to the systems WASM. The EGPWC needs them on any approach, also to an airport
 * that is not in the flight plan.
 */
export class EgpwcRunwayDatabase implements Instrument {
  private static readonly UPDATE_EVENT = 'FBW_EGPWC_RUNWAYS';

  private static readonly REQUEST_EVENT = 'FBW_EGPWC_RUNWAYS_REQUEST';

  /**
   * DESIGN CHOICE: the EGPWC phase and floor reach 15 NM from a runway, plus up to 2 NM between the airport reference
   * point and the runway ends, plus the 1 NM the aircraft moves between two searches.
   */
  private static readonly SEARCH_RADIUS_NM = 20;

  /** DESIGN CHOICE: enough for the busiest areas within the search radius */
  private static readonly MAX_AIRPORTS = 30;

  public static readonly MIN_RUNWAY_LENGTH_FT = 3_500;

  /** DESIGN CHOICE: the nearest runways sent, which keeps the message to a few kB */
  public static readonly MAX_RUNWAYS = 60;

  /** DESIGN CHOICE: the list is sent again this often in case the systems WASM missed it */
  private static readonly RESEND_INTERVAL_MS = 30_000;

  private readonly runwayProvider: NearbyRunwayProvider;

  private commBusReady = false;

  private sendRequested = false;

  private lastRunways: readonly AwarenessRunway[] | undefined;

  private message: string | undefined;

  private lastSendTime = -Infinity;

  constructor(bus: EventBus) {
    this.runwayProvider = new NearbyRunwayProvider(
      bus,
      EgpwcRunwayDatabase.SEARCH_RADIUS_NM,
      EgpwcRunwayDatabase.MAX_AIRPORTS,
      EgpwcRunwayDatabase.MIN_RUNWAY_LENGTH_FT * METRES_PER_FOOT,
    );
  }

  public init(): void {
    ViewListenerUtils.getListener('JS_LISTENER_COMM_BUS').then((commBus) => {
      commBus.on(EgpwcRunwayDatabase.REQUEST_EVENT, () => (this.sendRequested = true));
      this.commBusReady = true;
    });
  }

  public onUpdate(): void {
    const now = Date.now();
    // Not gated by the EGPWC power: the WASM keeps the latest list whatever the power, so it is ready at power-up
    const latitude = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
    const longitude = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
    this.runwayProvider.update(latitude, longitude, now);

    // The provider makes a new array for every search
    const runways = this.runwayProvider.runways;
    if (runways !== this.lastRunways) {
      this.lastRunways = runways;
      const message = JSON.stringify(egpwcDatabaseRunways(runways, latitude, longitude));
      if (message !== this.message) {
        this.message = message;
        this.sendRequested = true;
      }
    }

    const due = this.sendRequested || now - this.lastSendTime >= EgpwcRunwayDatabase.RESEND_INTERVAL_MS;
    if (this.commBusReady && due && this.message !== undefined) {
      Coherent.call('COMM_BUS_WASM_CALLBACK', EgpwcRunwayDatabase.UPDATE_EVENT, this.message);
      this.sendRequested = false;
      this.lastSendTime = now;
    }
  }
}
