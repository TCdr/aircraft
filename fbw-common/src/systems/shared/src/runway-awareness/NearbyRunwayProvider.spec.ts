// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AirportClassMask,
  AirportFacility,
  EventBus,
  FacilityLoader,
  ICAO,
  IcaoValue,
  NearestAirportSearchSession,
  NearestIcaoSearchSessionDataType,
  RunwaySurfaceType,
} from '@microsoft/msfs-sdk';
import { NearbyRunwayProvider } from './NearbyRunwayProvider';

const METRES_PER_NM = 1852;
const METRES_PER_DEGREE_LAT = 111_120;

/** An airport of the fake sim database */
interface FakeAirport {
  readonly icao: IcaoValue;
  readonly latitude: number;
  readonly longitude: number;
  /** Its AirportClassMask bit */
  readonly classBit: number;
  readonly longestRunwayM: number;
  readonly facility: AirportFacility;
}

function fakeAirport(ident: string, latitude: number, longitude: number, runwayLengthM: number | null): FakeAirport {
  const runways =
    runwayLengthM === null
      ? []
      : [
          {
            designation: '16-34',
            designatorCharPrimary: 0,
            designatorCharSecondary: 0,
            surface: RunwaySurfaceType.Asphalt,
            latitude,
            longitude,
            direction: 160,
            length: runwayLengthM,
            width: 60,
            primaryThresholdLength: 0,
            secondaryThresholdLength: 0,
            primaryElevation: 5,
            secondaryElevation: 5,
          },
        ];
  return {
    icao: ICAO.value('A', '', '', ident),
    latitude,
    longitude,
    classBit: runwayLengthM === null ? AirportClassMask.HeliportOnly : AirportClassMask.HardSurface,
    longestRunwayM: runwayLengthM ?? 0,
    facility: { icaoStruct: ICAO.value('A', '', '', ident), runways } as unknown as AirportFacility,
  };
}

/**
 * The sim's nearest airport search, as the facility loader hands it out: the closest maxItems airports within the
 * radius that pass the session filters, returned as the difference from the previous search of the session. A new
 * session has no filter (every airport class, any runway length).
 */
class FakeNearestAirportSession {
  private classMask = 0xffff;

  private minRunwayLengthM = 0;

  private lastResult = new Set<FakeAirport>();

  constructor(private readonly airports: readonly FakeAirport[]) {}

  public setAirportFilter(_showClosed: boolean, classMask: number): void {
    this.classMask = classMask;
  }

  public setExtendedAirportFilters(
    _surfaceTypeMask: number,
    _approachTypeMask: number,
    _toweredMask: number,
    minRunwayLength: number,
  ): void {
    this.minRunwayLengthM = minRunwayLength;
  }

  public async searchNearest(lat: number, lon: number, radiusM: number, maxItems: number) {
    const distanceM = (a: FakeAirport) =>
      Math.hypot(
        (a.latitude - lat) * METRES_PER_DEGREE_LAT,
        (a.longitude - lon) * METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180),
      );
    const result = new Set(
      this.airports
        .filter(
          (a) =>
            (a.classBit & this.classMask) !== 0 && a.longestRunwayM >= this.minRunwayLengthM && distanceM(a) <= radiusM,
        )
        .sort((a, b) => distanceM(a) - distanceM(b))
        .slice(0, maxItems),
    );
    const added = [...result].filter((a) => !this.lastResult.has(a)).map((a) => a.icao);
    const removed = [...this.lastResult].filter((a) => !result.has(a)).map((a) => a.icao);
    this.lastResult = result;
    return { sessionId: 1, searchId: 1, added, removed };
  }
}

/** Lets the pending promises of the provider (session start, search, facility loads) settle */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Starts the session of a provider (25 NM, 24 airports, as the A380X VD airports), then searches at a position */
async function runwayAirportsAt(airports: readonly FakeAirport[], latitude: number, longitude: number) {
  vi.spyOn(FacilityLoader.prototype, 'startNearestSearchSessionWithIcaoStructs').mockResolvedValue(
    new FakeNearestAirportSession(
      airports,
    ) as unknown as NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct>,
  );
  vi.spyOn(FacilityLoader.prototype, 'getFacility').mockImplementation(
    (async (_type: unknown, icao: IcaoValue) =>
      airports.find((a) => a.icao.ident === icao.ident).facility) as unknown as FacilityLoader['getFacility'],
  );

  const provider = new NearbyRunwayProvider(new EventBus(), 25, 24);
  provider.update(latitude, longitude, 0);
  await settle();
  provider.update(latitude, longitude, 0);
  await settle();

  return new Set(provider.runways.map((runway) => runway.airport));
}

// RJTT (Tokyo Haneda) and RJTA (Atsugi, about 17 NM west), with the heliports of the city all around
const RJTT = fakeAirport('RJTT', 35.553, 139.781, 3000);
const RJTA = fakeAirport('RJTA', 35.455, 139.45, 2438);

/** 30 heliports within 1.5 NM of a point */
function heliportsAround(latitude: number, longitude: number): FakeAirport[] {
  return Array.from({ length: 30 }, (_, i) =>
    fakeAirport(
      `H${i.toString().padStart(3, '0')}`,
      latitude + (((i % 6) - 2.5) * 0.25) / 60,
      longitude + ((Math.floor(i / 6) - 2) * 0.3) / 60,
      null,
    ),
  );
}

describe('NearbyRunwayProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the departure airport after take-off with more heliports than the list size closer to the aircraft', async () => {
    // 3 NM north of RJTT after take-off, over a city with 30 heliports within 1.5 NM (2026-10-11 sim test: the A380X
    // VD airport count went from 1 to 0 a few NM after take-off from RJTT)
    const latitude = RJTT.latitude + 3 / 60;
    const longitude = RJTT.longitude;

    const airports = await runwayAirportsAt([RJTT, RJTA, ...heliportsAround(latitude, longitude)], latitude, longitude);

    expect(airports.has('RJTT')).toBe(true);
    expect(airports.has('RJTA')).toBe(true);
  });

  it('finds the airports with runways within the radius on the ground among the heliports', async () => {
    const airports = await runwayAirportsAt(
      [RJTT, RJTA, ...heliportsAround(RJTT.latitude, RJTT.longitude)],
      RJTT.latitude,
      RJTT.longitude,
    );

    expect([...airports].sort()).toEqual(['RJTA', 'RJTT']);
  });
});
