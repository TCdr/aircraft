// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AnsuIndex } from './AnsuLogic';

/** The busbars that can supply the NSS AVNCS routers (ARU 1 and 2) and the secure interface router (SIRU). */
export interface RouterSupplies {
  ac1: boolean;
  ac2: boolean;
  /** The A380 AC EMER busbar (491XP), the AC_ESS variable. */
  acEmer: boolean;
  dc1: boolean;
  dc2: boolean;
}

/**
 * Whether an NSS AVNCS router (ARU) is supplied, from both of its busbars:
 * - ARU 1: AC 2 and DC 2,
 * - ARU 2: AC 1 or AC EMER, and DC 1.
 *
 * Design choice: "and" is read as both busbars needed. A DC busbar is fed from the AC network through its
 * transformer-rectifier, so the router goes with the loss of either of them (a failed TR as well as a lost AC bus).
 * @param index the router number
 * @param supplies the state of the busbars
 * @returns whether the router has its supply
 */
export function isAvncsRouterSupplied(index: AnsuIndex, supplies: RouterSupplies): boolean {
  return index === 1 ? supplies.ac2 && supplies.dc2 : (supplies.ac1 || supplies.acEmer) && supplies.dc1;
}

/**
 * Whether the secure interface router (SIRU) is supplied: AC 1 and DC 1.
 * @param supplies the state of the busbars
 * @returns whether the SIRU has its supply
 */
export function isSiruSupplied(supplies: RouterSupplies): boolean {
  return supplies.ac1 && supplies.dc1;
}

/**
 * Keeps a router running through a short loss of its supply, so that a source change of the electrical network (engine
 * generators, APU, external power) does not restart it: a restart costs the full ARU start time.
 *
 * Design choice: the same 10 s as the ANSUs (NssAutoShutdown) before the loss counts.
 */
export class SupplyHoldUp {
  public static readonly HOLD_MS = 10_000;

  private lostSinceMs: number | null = null;

  /** The unit has had its supply and has not been without it for HOLD_MS since */
  private wasSupplied = false;

  /** The supply was present at least once since the flight was loaded */
  private everSupplied = false;

  /**
   * @param supplied whether the supply is present now
   * @param nowMs the current time, ms; 0 is the clock subject before its first event, not a time
   * @param supplyAssumed whether the unit counts as supplied until its busbars report: they report late in a flight
   * loaded with the aircraft powered (AC ESS about 69 s after the load), and the unit must not wait for them. Ignored
   * once the supply has been present, so that a real loss still stops the unit.
   * @returns whether the unit still counts as supplied
   */
  public update(supplied: boolean, nowMs: number, supplyAssumed = false): boolean {
    if (supplied) {
      this.wasSupplied = true;
      this.everSupplied = true;
      this.lostSinceMs = null;
      return true;
    }
    if (!this.wasSupplied) {
      return supplyAssumed && !this.everSupplied;
    }
    // The clock before its first event cannot time the loss, and starting the timer from it would count the whole sim
    // clock as time without supply at the next frame.
    if (nowMs <= 0) {
      return true;
    }
    if (this.lostSinceMs === null) {
      this.lostSinceMs = nowMs;
    }
    if (nowMs - this.lostSinceMs >= SupplyHoldUp.HOLD_MS) {
      this.wasSupplied = false;
      return false;
    }
    return true;
  }
}

/** What an NSS router shows on the NSS AVNCS units page */
export type NssRouterState = 'off' | 'starting' | 'operating';

/**
 * @param powered the unit has its supply
 * @param operating the unit finished its start
 * @returns the state of the unit
 */
export function nssRouterState(powered: boolean, operating: boolean): NssRouterState {
  if (!powered) {
    return 'off';
  }
  return operating ? 'operating' : 'starting';
}

/**
 * @param state the state of a router
 * @returns the word the NSS AVNCS units page shows
 */
export function nssRouterStateLabel(state: NssRouterState): string {
  switch (state) {
    case 'operating':
      return 'OPERATING';
    case 'starting':
      return 'STARTING';
    default:
      return 'OFF';
  }
}
