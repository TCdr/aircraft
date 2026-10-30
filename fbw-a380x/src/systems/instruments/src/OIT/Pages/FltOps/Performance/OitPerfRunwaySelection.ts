// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, EventBus, MappedSubject, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { OitPerfEntryFormat } from './OitPerfEntryFormat';
import { PerformanceAirport, loadPerformanceAirport } from './OitPerfAirports';
import {
  WindEntry,
  formatCrosswind,
  formatIsaDeviation,
  formatWindEntry,
  isaDeviation,
  parseQnhEntry,
  parseTemperatureEntry,
  parseWindEntry,
  runwayWind,
} from '../../../System/Performance/PerformanceEntries';
import { PerformanceRunway } from '../../../System/Performance/PerformanceRunways';

/** The entries of T.O PERF and LDG PERF that depend on the airport and the runway */
export interface RunwayDependentEntries {
  readonly airport: Subscribable<string | null>;
  readonly runwayIdent: Subject<string | null>;
  readonly wind: Subscribable<WindEntry | null>;
  readonly oat: Subscribable<number | null>;
  readonly qnh: Subscribable<number | null>;
}

/** The airport and runway of T.O PERF or LDG PERF, and the CONDITIONS entries shown relative to the runway */
export class OitPerfRunwaySelection {
  public readonly airport = Subject.create<PerformanceAirport | null>(null);

  public readonly airportIdents = ArraySubject.create<string>([]);

  public readonly airportIndex = Subject.create<number | null>(null);

  public readonly runwayIdents = ArraySubject.create<string>([]);

  public readonly runway: MappedSubject<[PerformanceAirport | null, string | null], PerformanceRunway | null>;

  public readonly runwayIndex: MappedSubject<[PerformanceAirport | null, string | null], number | null>;

  /** The wind text depends on the runway it is projected on */
  private readonly windReformat = Subject.create(false);

  public readonly windFormat: OitPerfEntryFormat<WindEntry>;

  public readonly qnhFormat = new OitPerfEntryFormat<number>(parseQnhEntry, (qnh) => Math.round(qnh).toFixed(0), 7);

  public readonly oatFormat = new OitPerfEntryFormat<number>(parseTemperatureEntry, (oat) => oat.toFixed(0), 3);

  public readonly crosswindText: MappedSubject<[WindEntry | null, PerformanceRunway | null], string>;

  public readonly isaText: MappedSubject<[number | null, number | null, PerformanceRunway | null], string>;

  /**
   * @param bus the event bus
   * @param entries the entries of the application
   */
  constructor(
    private readonly bus: EventBus,
    private readonly entries: RunwayDependentEntries,
  ) {
    this.runway = MappedSubject.create(
      ([airport, ident]) => airport?.runways.find((r) => r.ident === ident) ?? null,
      this.airport,
      entries.runwayIdent,
    );
    this.runwayIndex = MappedSubject.create(
      ([airport, ident]) => {
        const index = airport?.runways.findIndex((r) => r.ident === ident) ?? -1;
        return index >= 0 ? index : null;
      },
      this.airport,
      entries.runwayIdent,
    );
    this.windFormat = new OitPerfEntryFormat<WindEntry>(
      parseWindEntry,
      (wind) => formatWindEntry(wind, runwayWind(wind, this.runway.get()?.magneticBearing ?? null)),
      16,
      this.windReformat,
    );
    this.crosswindText = MappedSubject.create(
      ([wind, runway]) => (wind ? formatCrosswind(runwayWind(wind, runway?.magneticBearing ?? null)) : ''),
      entries.wind,
      this.runway,
    );
    this.isaText = MappedSubject.create(
      ([oat, qnh, runway]) =>
        oat !== null && qnh !== null && runway !== null
          ? formatIsaDeviation(isaDeviation(oat, runway.elevation, qnh))
          : '---',
      entries.oat,
      entries.qnh,
      this.runway,
    );
  }

  /** @returns the computed subjects, to destroy with the page */
  public computedSubjects(): Subscription[] {
    return [this.runway, this.runwayIndex, this.crosswindText, this.isaText];
  }

  /** @returns the subscriptions that load the runways of the airport and show the wind again for another runway */
  public follow(): Subscription[] {
    return [
      this.entries.airport.sub((icao) => this.loadAirport(icao), true),
      this.runway.sub(() => this.windReformat.set(!this.windReformat.get())),
    ];
  }

  /** @param index the index of the runway list, null or negative for none */
  public selectRunway(index: number | null): void {
    this.entries.runwayIdent.set(index !== null && index >= 0 ? this.runwayIdents.get(index) : null);
  }

  private async loadAirport(icao: string | null): Promise<void> {
    this.airportIdents.set(icao ? [icao] : []);
    this.airportIndex.set(icao ? 0 : null);
    if (icao === null) {
      this.airport.set(null);
      this.runwayIdents.set([]);
      return;
    }
    const airport = await loadPerformanceAirport(this.bus, icao);
    if (icao !== this.entries.airport.get()) {
      return;
    }
    // The list first: setting the airport moves the runway index, which the dropdown reads from the list
    this.runwayIdents.set(airport?.runways.map((r) => r.ident) ?? []);
    this.airport.set(airport);
  }
}
