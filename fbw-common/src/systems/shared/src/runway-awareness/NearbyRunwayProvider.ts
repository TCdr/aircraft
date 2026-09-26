// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AirportFacility,
  AirportRunway,
  EventBus,
  FacilityLoader,
  FacilityRepository,
  FacilitySearchType,
  FacilityType,
  ICAO,
  IcaoValue,
  NearestAirportSearchSession,
  NearestIcaoSearchSessionDataType,
  RunwaySurfaceType,
  RunwayUtils,
} from '@microsoft/msfs-sdk';
import { AwarenessRunway, AwarenessRunwayEnd } from './AwarenessRunway';

/**
 * The runways of the airports around the aircraft, from the sim's own airport database: runway centre, true
 * direction, length, width, displaced thresholds and threshold elevations. No airport map (AMDB) is needed.
 */
export class NearbyRunwayProvider {
  private static readonly SEARCH_INTERVAL_MS = 10_000;

  private static readonly SEARCH_MOVE_M = 1_852;

  private static readonly WATER_SURFACES = [
    RunwaySurfaceType.WaterFSX,
    RunwaySurfaceType.Water,
    RunwaySurfaceType.WasteWater,
  ];

  private readonly loader: FacilityLoader;

  private session: NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct> | undefined;

  private sessionStarting = false;

  private searching = false;

  private lastSearchTime = -Infinity;

  private lastSearchLat = 0;

  private lastSearchLon = 0;

  private readonly airportRunways = new Map<string, readonly AwarenessRunway[]>();

  private runwayList: readonly AwarenessRunway[] = [];

  /**
   * @param bus the instrument's event bus
   * @param radiusNm the search radius around the aircraft, in nautical miles
   * @param maxAirports the most airports kept
   */
  constructor(
    bus: EventBus,
    private readonly radiusNm = 8,
    private readonly maxAirports = 20,
  ) {
    this.loader = new FacilityLoader(FacilityRepository.getRepository(bus));
  }

  /** The runways of the airports around the aircraft at the last search */
  public get runways(): readonly AwarenessRunway[] {
    return this.runwayList;
  }

  /**
   * Searches the airports again every 10 s, or when the aircraft moved 1 NM since the last search.
   * @param latitude the aircraft latitude, in degrees
   * @param longitude the aircraft longitude, in degrees
   * @param now the time, in ms
   */
  public update(latitude: number, longitude: number, now: number): void {
    if (this.searching || this.sessionStarting) {
      return;
    }
    if (!this.session) {
      this.startSession();
      return;
    }

    const moved =
      Math.hypot(
        (latitude - this.lastSearchLat) * 111_120,
        (longitude - this.lastSearchLon) * 111_120 * Math.cos((latitude * Math.PI) / 180),
      ) > NearbyRunwayProvider.SEARCH_MOVE_M;
    if (!moved && now - this.lastSearchTime < NearbyRunwayProvider.SEARCH_INTERVAL_MS) {
      return;
    }

    this.lastSearchTime = now;
    this.lastSearchLat = latitude;
    this.lastSearchLon = longitude;
    this.search(this.session, latitude, longitude);
  }

  // Coherent GT has no Promise.prototype.finally nor Array.prototype.flat (ES2018/2019): plain async/await only

  private async search(
    session: NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct>,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    this.searching = true;
    try {
      const results = await session.searchNearest(latitude, longitude, this.radiusNm * 1_852, this.maxAirports);
      for (const icao of results.removed) {
        this.airportRunways.delete(ICAO.getUid(icao));
      }
      await Promise.all(results.added.map((icao) => this.loadAirport(icao)));
      const runways: AwarenessRunway[] = [];
      this.airportRunways.forEach((airportRunways) => runways.push(...airportRunways));
      this.runwayList = runways;
    } catch (e) {
      console.warn('[NearbyRunwayProvider] airport search failed', e);
    } finally {
      this.searching = false;
    }
  }

  private async startSession(): Promise<void> {
    this.sessionStarting = true;
    try {
      this.session = await this.loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
    } catch (e) {
      console.warn('[NearbyRunwayProvider] could not start the airport search', e);
    } finally {
      this.sessionStarting = false;
    }
  }

  private async loadAirport(icao: IcaoValue): Promise<void> {
    try {
      const airport = await this.loader.getFacility(FacilityType.Airport, icao);
      this.airportRunways.set(ICAO.getUid(icao), NearbyRunwayProvider.toAwarenessRunways(airport));
    } catch (e) {
      console.warn(`[NearbyRunwayProvider] could not load ${icao.ident}`, e);
    }
  }

  /** The paved and grass runways of an airport, water runways excluded */
  public static toAwarenessRunways(airport: AirportFacility): AwarenessRunway[] {
    const runways: AwarenessRunway[] = [];
    for (const runway of airport.runways) {
      if (NearbyRunwayProvider.WATER_SURFACES.includes(runway.surface)) {
        continue;
      }
      const ends = NearbyRunwayProvider.toEnds(runway);
      if (ends) {
        runways.push({
          airport: airport.icaoStruct.ident,
          latitude: runway.latitude,
          longitude: runway.longitude,
          length: runway.length,
          width: runway.width,
          ends,
        });
      }
    }
    return runways;
  }

  private static toEnds(runway: AirportRunway): [AwarenessRunwayEnd, AwarenessRunwayEnd] | null {
    const numbers = runway.designation.split('-').map((n) => parseInt(n));
    if (numbers.length !== 2 || numbers.some((n) => !Number.isFinite(n) || n < 1 || n > 36)) {
      return null;
    }
    const end = (
      number: number,
      designator: AirportRunway['designatorCharPrimary'],
      course: number,
      displacedThreshold: number,
      elevation: number,
    ): AwarenessRunwayEnd | null => {
      const letter = RunwayUtils.getDesignatorLetter(designator);
      if (letter !== '' && letter !== 'L' && letter !== 'C' && letter !== 'R') {
        return null;
      }
      return {
        number,
        designator: letter,
        ident: `${number.toString().padStart(2, '0')}${letter}`,
        course,
        displacedThreshold,
        elevation,
      };
    };
    const primary = end(
      numbers[0],
      runway.designatorCharPrimary,
      runway.direction,
      runway.primaryThresholdLength,
      runway.primaryElevation,
    );
    const secondary = end(
      numbers[1],
      runway.designatorCharSecondary,
      (runway.direction + 180) % 360,
      runway.secondaryThresholdLength,
      runway.secondaryElevation,
    );
    return primary && secondary ? [primary, secondary] : null;
  }
}
