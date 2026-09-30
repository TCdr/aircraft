// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Airway, Fix } from '@flybywiresim/fbw-sdk';
import { AtsuMessageDirection, CpdlcMessage, CpdlcMessagesUplink } from '@datalink/common';
import {
  latLongOf,
  REJECT_AWY_WPT_MISMATCH,
  REJECT_NOT_ALLOWED_IN_PHASE,
  REJECT_NOT_IN_DATABASE,
  resolveRouteClearance,
  RouteClearanceDatabase,
  routeClearanceOf,
  routeTokens,
} from './AtcRouteClearance';

/**
 * A test fix
 * @param ident its ident
 * @param lat its latitude
 * @param long its longitude
 * @returns the fix
 */
function fix(ident: string, lat: number, long: number): Fix {
  return { ident, icaoCode: 'LF', databaseId: `W    LF${ident}`, location: { lat, long } } as unknown as Fix;
}

const DIBAG = fix('DIBAG', 44.9, -0.9);
const TUDRA = fix('TUDRA', 45.8, 0.6);
const LACOU = fix('LACOU', 46.3, 1.2);
const AMB = fix('AMB', 47.4, 1.0);
/** Two waypoints named DOLIR: the route takes the one near the previous point */
const DOLIR_NEAR = fix('DOLIR', 47.6, 1.2);
const DOLIR_FAR = fix('DOLIR', -33.0, 151.0);

const AIRWAYS: Airway[] = [
  { ident: 'UT210', fixes: [DIBAG, fix('BALAN', 45.3, -0.2), TUDRA] } as unknown as Airway,
  { ident: 'UT158', fixes: [TUDRA, LACOU, AMB] } as unknown as Airway,
];

/** A navigation database with the fixes and airways above, LFBD departures and LFPG arrivals */
const db: RouteClearanceDatabase = {
  fixes: async (ident) => [DIBAG, TUDRA, LACOU, AMB, DOLIR_NEAR, DOLIR_FAR].filter((f) => f.ident === ident),
  // As the navigation database: the airways with this ident, whether or not they pass the fix
  airways: async (ident) => AIRWAYS.filter((a) => a.ident === ident),
  departures: async (airport) => (airport === 'LFBD' ? [{ ident: 'DIBA5B', databaseId: 'P    LFBDDIBA5B' }] : []),
  arrivals: async (airport) => (airport === 'LFPG' ? [{ ident: 'MOPA4W', databaseId: 'P    LFPGMOPA4W' }] : []),
  isAirport: async (ident) => ['LFBD', 'LFPG', 'LFPO'].includes(ident),
};

/**
 * An uplink route clearance
 * @param typeId UM79, UM80 or UM83
 * @param values the values of the message elements
 * @returns the message
 */
function uplink(typeId: string, ...values: string[]): CpdlcMessage {
  const message = new CpdlcMessage();
  message.Direction = AtsuMessageDirection.Uplink;
  const element = CpdlcMessagesUplink[typeId][1].deepCopy();
  values.forEach((value, i) => (element.Content[i].Value = value));
  message.Content.push(element);
  return message;
}

describe('ATC route clearance', () => {
  it('reads the route of UM79, UM80 and UM83, ending UM79 at its clearance limit', () => {
    expect(routeClearanceOf(uplink('UM79', 'AMB', 'DIBAG UT210 TUDRA UT158 AMB'))).toEqual({
      typeId: 'UM79',
      clearanceLimit: 'AMB',
      joinPosition: null,
      tokens: ['DIBAG', 'UT210', 'TUDRA', 'UT158', 'AMB'],
    });
    expect(routeClearanceOf(uplink('UM79', 'AMB', 'DIBAG UT210 TUDRA'))?.tokens).toEqual([
      'DIBAG',
      'UT210',
      'TUDRA',
      'AMB',
    ]);
    expect(routeClearanceOf(uplink('UM80', 'LFBD DIBA5B DIBAG UT210 TUDRA LFPG'))?.tokens[1]).toBe('DIBA5B');
    expect(routeClearanceOf(uplink('UM83', 'TUDRA', 'LACOU DCT AMB'))?.joinPosition).toBe('TUDRA');
    expect(routeClearanceOf(uplink('UM20', 'FL340'))).toBeNull();
  });

  it('leaves out DCT, the speed / level groups and the dots of an ICAO route', () => {
    expect(routeTokens('dibag/N0480F350 DCT tudra.UT158.amb')).toEqual(['DIBAG', 'TUDRA', 'UT158', 'AMB']);
  });

  it('reads the ICAO lat/long points', () => {
    expect(latLongOf('45N073W')).toEqual({ lat: 45, long: -73 });
    expect(latLongOf('4530S07330E')).toEqual({ lat: -45.5, long: 73.5 });
    expect(latLongOf('TUDRA')).toBeNull();
  });

  it('follows the airways between their waypoints (FCOM example CLEARED TO AMB VIA DIBAG UT210 TUDRA UT158 AMB)', async () => {
    const clearance = routeClearanceOf(uplink('UM79', 'AMB', 'DIBAG UT210 TUDRA UT158 AMB'))!;
    const resolved = await resolveRouteClearance(clearance, 'LFBD', 'LFPG', DIBAG.location, false, db);
    expect(resolved.rejected).toEqual([]);
    expect(resolved.newDestination).toBeNull();
    expect(
      resolved.items.map((item) =>
        item.kind === 'airway'
          ? `${item.airway.ident}>${item.to.ident}`
          : item.kind === 'fix'
            ? item.fix.ident
            : item.kind,
      ),
    ).toEqual(['DIBAG', 'UT210>TUDRA', 'UT158>AMB']);
  });

  it('takes the SID and the STAR of the origin and the destination, and a new destination', async () => {
    const clearance = routeClearanceOf(uplink('UM80', 'LFBD DIBA5B DIBAG UT210 TUDRA MOPA4W LFPG'))!;
    const resolved = await resolveRouteClearance(clearance, 'LFBD', 'LFPG', null, true, db);
    expect(resolved.items.map((item) => item.kind)).toEqual(['sid', 'fix', 'airway', 'star']);
    expect(resolved.newDestination).toBeNull();

    const diverted = await resolveRouteClearance(
      routeClearanceOf(uplink('UM80', 'TUDRA LFPO'))!,
      'LFBD',
      'LFPG',
      null,
      true,
      db,
    );
    expect(diverted.newDestination).toBe('LFPO');
    expect(diverted.items.map((item) => item.kind)).toEqual(['fix']);
  });

  it('rejects a SID once airborne, unknown waypoints and airways that do not start at the previous waypoint', async () => {
    const clearance = routeClearanceOf(uplink('UM80', 'DIBA5B DIBAG UT158 TUDRA XYZZY AMB'))!;
    const resolved = await resolveRouteClearance(clearance, 'LFBD', 'LFPG', null, false, db);
    expect(resolved.rejected).toEqual([
      { description: 'SID', value: 'DIBA5B', at: 'LFBD', error: REJECT_NOT_ALLOWED_IN_PHASE },
      { description: 'AIRWAYS', value: 'UT158', at: 'DIBAG', error: REJECT_AWY_WPT_MISMATCH },
      { description: 'EN RTE WPTS', value: 'XYZZY', at: 'TUDRA', error: REJECT_NOT_IN_DATABASE },
    ]);
    // The route goes on direct: DIBAG, TUDRA, AMB
    expect(resolved.items.map((item) => (item.kind === 'fix' ? item.fix.ident : item.kind))).toEqual([
      'DIBAG',
      'TUDRA',
      'AMB',
    ]);
  });

  it('takes the waypoint near the previous point when several have the same ident', async () => {
    const resolved = await resolveRouteClearance(
      routeClearanceOf(uplink('UM80', 'AMB DOLIR'))!,
      null,
      null,
      null,
      true,
      db,
    );
    const last = resolved.items[1];
    expect(last.kind === 'fix' && last.fix).toBe(DOLIR_NEAR);
  });
});
