import { FlightPlanWindEntry } from '../data/wind';

interface BasePendingCruiseWind {
  levels: FlightPlanWindEntry[];
}

interface PendingWaypointCruiseWind extends BasePendingCruiseWind {
  type: 'waypoint';
  fixIdent: string;
}

interface PendingLatLonCruiseWind extends BasePendingCruiseWind {
  type: 'latlon';
  lat: number;
  long: number;
}

export type PendingCruiseWind = PendingWaypointCruiseWind | PendingLatLonCruiseWind;

enum PendingWindUplinkState {
  Idle,
  Requested,
  ReadyToInsert,
}

export class PendingWindUplink {
  climbWinds?: FlightPlanWindEntry[];
  cruiseWinds?: PendingCruiseWind[];
  descentWinds?: FlightPlanWindEntry[];
  alternateWind?: FlightPlanWindEntry;

  private state: PendingWindUplinkState = PendingWindUplinkState.Idle;

  /**
   * Takes the received winds and their state of another flight plan: a copy of the flight plan (revision, temporary
   * flight plan inserted) keeps the winds pending until the flight crew inserts or clears them.
   */
  copyFrom(other: PendingWindUplink): void {
    this.climbWinds = other.climbWinds;
    this.cruiseWinds = other.cruiseWinds;
    this.descentWinds = other.descentWinds;
    this.alternateWind = other.alternateWind;
    this.state = other.state;
  }

  onUplinkRequested() {
    this.state = PendingWindUplinkState.Requested;
  }

  onUplinkInserted() {
    this.state = PendingWindUplinkState.Idle;
  }

  onUplinkReadyToInsert() {
    this.state = PendingWindUplinkState.ReadyToInsert;
  }

  delete() {
    this.onUplinkInserted();
  }

  onUplinkAborted() {
    this.onUplinkInserted();
  }

  isWindUplinkInProgress(): boolean {
    return this.state === PendingWindUplinkState.Requested;
  }

  isWindUplinkReadyToInsert(): boolean {
    return this.state === PendingWindUplinkState.ReadyToInsert;
  }

  getAllCruiseWindAltitudes(): number[] {
    if (this.cruiseWinds === undefined) return [];

    const levels: number[] = [];
    for (const fix of this.cruiseWinds) {
      for (const level of fix.levels) {
        if (!levels.includes(level.altitude)) {
          levels.push(level.altitude);
        }
      }
    }

    return levels;
  }
}
