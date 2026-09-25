// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanInterface } from '@fmgc/flightplanning/FlightPlanInterface';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import {
  inboundPointIdent,
  outboundPointIdent,
  pposPointIDent,
  turningPointIdent,
} from '@fmgc/flightplanning/legs/FlightPlanLegNaming';
import { ReadonlyFlightPlanLeg } from '@fmgc/flightplanning/legs/ReadonlyFlightPlanLeg';
import { NavigationProvider } from '@fmgc/navigation/NavigationProvider';

/** Data recorded when a flight plan waypoint was sequenced (A380 FCOM DSC-22-FMS-20-30, POSITION / REPORT page). */
export interface SequencedWaypointRecord {
  ident: string;
  /** Simulator absolute time, in seconds */
  absoluteTimeSeconds: number;
  /** Baro corrected altitude, in feet */
  altitude: number | null;
  /** Static air temperature, in degrees Celsius */
  staticAirTemperature: number | null;
  /** True wind direction, in degrees */
  windDirection: number | null;
  /** Wind velocity, in knots */
  windSpeed: number | null;
  /** Fuel on board, in tonnes */
  fuelOnBoard: number | null;
}

/** Legs whose fix is not a navigation database or pilot stored waypoint (FCOM: "T-P, PPOS, IN-BND, etc") */
const nonWaypointIdents: ReadonlySet<string> = new Set([
  turningPointIdent,
  pposPointIDent,
  inboundPointIdent,
  outboundPointIdent,
]);

/**
 * Records the aircraft data at the moment the active flight plan sequences a waypoint, for the "last sequenced
 * waypoint" of the POSITION / REPORT page (A380 FCOM DSC-22-FMS-20-30: the last sequenced waypoint is the last
 * navigation database or pilot stored waypoint that has been sequenced, with the UTC time, altitude, SAT, true wind
 * and FOB recorded there).
 */
export class SequencedWaypointRecorder {
  private lastActiveLegIndex: number | null = null;

  private lastOriginIdent: string | undefined = undefined;

  private record: SequencedWaypointRecord | null = null;

  constructor(
    private readonly flightPlanInterface: FlightPlanInterface,
    private readonly navigation: NavigationProvider,
    private readonly getStaticAirTemperature: () => number | null,
    private readonly getWind: () => { direction: number | null; speed: number | null },
    private readonly getFuelOnBoardTonnes: () => number | null,
  ) {}

  /** The last sequenced waypoint and the data recorded there, null when nothing has been sequenced yet. */
  get lastSequencedWaypoint(): SequencedWaypointRecord | null {
    return this.record;
  }

  update(): void {
    if (!this.flightPlanInterface.hasActive) {
      this.reset();
      return;
    }

    const plan = this.flightPlanInterface.active;
    const originIdent = plan.originAirport?.ident;
    if (originIdent !== this.lastOriginIdent) {
      // A new flight plan: the record of the previous flight is not relevant any more
      this.reset();
      this.lastOriginIdent = originIdent;
    }

    const activeLegIndex = plan.activeLegIndex;
    if (this.lastActiveLegIndex !== null && activeLegIndex > this.lastActiveLegIndex) {
      // The legs between the previous and the new active leg were sequenced; the last waypoint among them is kept
      for (let i = activeLegIndex - 1; i >= this.lastActiveLegIndex; i--) {
        const leg = plan.maybeElementAt(i);
        if (isLeg(leg) && SequencedWaypointRecorder.isWaypointLeg(leg)) {
          this.record = this.recordNow(leg.ident);
          break;
        }
      }
    }
    this.lastActiveLegIndex = activeLegIndex;
  }

  private static isWaypointLeg(leg: ReadonlyFlightPlanLeg): boolean {
    return leg.isXF() && !nonWaypointIdents.has(leg.ident);
  }

  private recordNow(ident: string): SequencedWaypointRecord {
    const wind = this.getWind();
    return {
      ident,
      absoluteTimeSeconds: SimVar.GetGlobalVarValue('ABSOLUTE TIME', 'seconds'),
      altitude: this.navigation.getBaroCorrectedAltitude(),
      staticAirTemperature: this.getStaticAirTemperature(),
      windDirection: wind.direction,
      windSpeed: wind.speed,
      fuelOnBoard: this.getFuelOnBoardTonnes(),
    };
  }

  private reset(): void {
    this.record = null;
    this.lastActiveLegIndex = null;
  }
}
