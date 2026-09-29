// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { sndBearing, sndDistance, sndLegGuidance, SndPoint } from './SndGeo';

/** Waypoints in the list at most (the FCOM gives no number) */
export const SND_MAX_WAYPOINTS = 10;

/** The TO waypoint is sequenced abeam, or within this distance, in NM */
const SEQUENCING_DISTANCE = 0.5;

/** The guidance to the TO waypoint, true bearings */
export interface SndGuidance {
  from: SndPoint;
  to: SndPoint;
  next: SndPoint | null;
  /** From the aircraft to the TO waypoint: true bearing (degrees) and distance (NM) */
  bearingToTo: number;
  distanceToTo: number;
  /** Desired track (true, degrees) and cross-track distance (NM, positive right of the track) */
  desiredTrack: number;
  crossTrack: number;
  /** From the TO to the NEXT waypoint: true bearing and distance */
  nextBearing: number | null;
  nextDistance: number | null;
}

/**
 * The waypoint list of the SND (FCOM DSC-34-10-20-30): waypoints entered by the flight crew in latitude / longitude, and
 * the navigation along them once a DIR TO activates it: from the FROM waypoint (the aircraft position at the DIR TO) to
 * the TO waypoint, then the NEXT one.
 */
export class SndNavigator {
  private readonly list: SndPoint[] = [];

  /** Navigation: the FROM point and the index of the TO waypoint in the list; null when not activated */
  private navigation: { from: SndPoint; to: number } | null = null;

  /** The FIX: one point, displayed at the end of the waypoint list, with its bearing and distance (FCOM, Fix) */
  private fixPoint: SndPoint | null = null;

  get fix(): SndPoint | null {
    return this.fixPoint;
  }

  /** INSERT FIX (a new FIX replaces the previous one) and EDIT WPT / FIX */
  setFix(point: SndPoint): void {
    this.fixPoint = point;
  }

  /** CLEAR WPT / FIX */
  clearFix(): void {
    this.fixPoint = null;
  }

  get waypoints(): readonly SndPoint[] {
    return this.list;
  }

  get isActive(): boolean {
    return this.navigation !== null;
  }

  /** Index of the TO waypoint, -1 when the navigation is not activated */
  get toIndex(): number {
    return this.navigation?.to ?? -1;
  }

  get fromPoint(): SndPoint | null {
    return this.navigation?.from ?? null;
  }

  /** Inserts a waypoint at the end of the list; false when the list is full */
  insert(point: SndPoint): boolean {
    if (this.list.length >= SND_MAX_WAYPOINTS) {
      return false;
    }
    this.list.push(point);
    return true;
  }

  edit(index: number, point: SndPoint): void {
    if (index >= 0 && index < this.list.length) {
      this.list[index] = point;
    }
  }

  clear(index: number): void {
    if (index < 0 || index >= this.list.length) {
      return;
    }
    this.list.splice(index, 1);
    if (this.navigation) {
      if (index < this.navigation.to) {
        this.navigation.to--;
      }
      if (this.navigation.to >= this.list.length) {
        this.navigation = null;
      }
    }
  }

  /** DIR TO a waypoint of the list, from the aircraft: activates the navigation */
  directTo(index: number, aircraft: SndPoint): void {
    if (index >= 0 && index < this.list.length) {
      this.navigation = { from: aircraft, to: index };
    }
  }

  /** DIR TO a new waypoint: it becomes the first one of the list, before the others */
  directToNew(point: SndPoint, aircraft: SndPoint): boolean {
    if (this.list.length >= SND_MAX_WAYPOINTS) {
      return false;
    }
    this.list.unshift(point);
    this.navigation = { from: aircraft, to: 0 };
    return true;
  }

  /** Sequences the TO waypoint when the aircraft passes it, and returns the guidance; null when not activated */
  update(aircraft: SndPoint): SndGuidance | null {
    if (!this.navigation) {
      return null;
    }
    let to = this.list[this.navigation.to];
    const legLength = sndDistance(this.navigation.from, to);
    const leg = sndLegGuidance(this.navigation.from, to, aircraft);
    const passed = sndDistance(aircraft, to) < SEQUENCING_DISTANCE || leg.alongTrack >= legLength;
    if (passed && this.navigation.to + 1 < this.list.length) {
      this.navigation = { from: to, to: this.navigation.to + 1 };
      to = this.list[this.navigation.to];
    }
    const from = this.navigation.from;
    const next = this.navigation.to + 1 < this.list.length ? this.list[this.navigation.to + 1] : null;
    const guidance = sndLegGuidance(from, to, aircraft);
    return {
      from,
      to,
      next,
      bearingToTo: sndBearing(aircraft, to),
      distanceToTo: sndDistance(aircraft, to),
      desiredTrack: guidance.desiredTrack,
      crossTrack: guidance.crossTrack,
      nextBearing: next ? sndBearing(to, next) : null,
      nextDistance: next ? sndDistance(to, next) : null,
    };
  }
}
