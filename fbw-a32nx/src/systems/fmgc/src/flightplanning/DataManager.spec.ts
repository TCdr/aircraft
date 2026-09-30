// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { DataManager, LatLonFormatType } from './DataManager';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';

describe('pilot-stored waypoints database', () => {
  beforeEach(() => localStorage.clear());

  /** A database of 3 waypoints, the idents in inUse used by a flight plan */
  function database(inUse: string[]): DataManager {
    return new DataManager(
      new EventBus(),
      { isWaypointInUse: async (wp) => inUse.includes(wp.ident) },
      {
        latLonFormat: LatLonFormatType.ShortFormat,
        storedWaypointLimit: { max: 3, inUse: (wp) => inUse.includes(wp.ident) },
      },
    );
  }

  it('deletes the first created waypoint that the flight plans do not use when it is full', () => {
    const inUse = ['A'];
    const db = database(inUse);
    db.createLatLonWaypoint({ lat: 1, long: 1 }, true, 'A');
    db.createLatLonWaypoint({ lat: 2, long: 2 }, true, 'B');
    db.createLatLonWaypoint({ lat: 3, long: 3 }, true, 'C');
    expect(db.numberOfStoredWaypoints()).toBe(3);

    // Full: A is used, B is the first created unused one
    const d = db.createLatLonWaypoint({ lat: 4, long: 4 }, true, 'D');
    expect(db.numberOfStoredWaypoints()).toBe(3);
    expect(d.storedIndex).toBe(1);
    expect([0, 1, 2].map((i) => db.getStoredWaypoint(i)?.waypoint.ident)).toEqual(['A', 'D', 'C']);

    // Then C, then D (A still used)
    db.createLatLonWaypoint({ lat: 5, long: 5 }, true, 'E');
    expect([0, 1, 2].map((i) => db.getStoredWaypoint(i)?.waypoint.ident)).toEqual(['A', 'D', 'E']);
  });

  it('rejects the creation when all the waypoints are used', () => {
    const db = database(['A', 'B', 'C']);
    db.createLatLonWaypoint({ lat: 1, long: 1 }, true, 'A');
    db.createLatLonWaypoint({ lat: 2, long: 2 }, true, 'B');
    db.createLatLonWaypoint({ lat: 3, long: 3 }, true, 'C');
    let error: unknown = null;
    try {
      db.createLatLonWaypoint({ lat: 4, long: 4 }, true, 'D');
    } catch (e) {
      error = e;
    }
    expect(error instanceof FmsError && error.type === FmsErrorType.ListOf99InUse).toBe(true);
  });
});
