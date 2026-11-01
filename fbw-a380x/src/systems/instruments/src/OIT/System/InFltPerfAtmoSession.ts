// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import {
  AtmoIsaInformation,
  AtmoLowAltitudeResults,
  AtmoSpeedResults,
  AtmoTemperature,
  AtmoWind,
} from './InFltPerfAtmo';

/** What the RESULTS panel of ATMO shows */
export type AtmoResultsView =
  | { readonly kind: 'none' }
  | { readonly kind: 'errors'; readonly lines: string[] }
  | { readonly kind: 'speed'; readonly results: AtmoSpeedResults }
  | { readonly kind: 'true alt'; readonly results: AtmoIsaInformation }
  | { readonly kind: 'lo alt'; readonly results: AtmoLowAltitudeResults };

export const NO_ATMO_RESULTS: AtmoResultsView = { kind: 'none' };

/**
 * @param view the RESULTS panel
 * @returns whether it shows results of a computation (not nothing, not the list of missing parameters)
 */
export function hasAtmoResults(view: AtmoResultsView): boolean {
  return view.kind !== 'none' && view.kind !== 'errors';
}

export const ATMO_COMPUTATION_TYPES = ['SPEED', 'ALT (STD)'];
export const ATMO_SPEED_TYPES = ['MACH', 'IAS', 'ECON', 'LRC'];
export const ATMO_ALT_TYPES = ['TRUE ALT (STD)', 'LO ALT TEMP CORR'];

export type AtmoMode = 'SPEED' | 'TRUE ALT' | 'LO ALT';

/**
 * @param computationType the COMPUTATION TYPE entry: 0 SPEED, 1 ALT (STD)
 * @param altType the ALT TYPE entry: 0 TRUE ALT (STD), 1 LO ALT TEMP CORR
 * @returns the computation of the page
 */
export function atmoMode(computationType: number | null, altType: number | null): AtmoMode {
  if (computationType !== 1) {
    return 'SPEED';
  }
  return altType === 1 ? 'LO ALT' : 'TRUE ALT';
}

/**
 * The IN-FLT PERF ATMO entries and results of one laptop. They live in the laptop session, not in the page: the
 * switching bar brings back an open application as the crew left it, while the page itself is drawn again.
 */
export class InFltPerfAtmoSession {
  /** 0: SPEED, 1: ALT (STD) */
  public readonly computationType = Subject.create<number | null>(0);
  /** 0: MACH, 1: IAS */
  public readonly speedType = Subject.create<number | null>(0);
  /** 0: TRUE ALT (STD), 1: LO ALT TEMP CORR */
  public readonly altType = Subject.create<number | null>(0);

  public readonly wind = Subject.create<AtmoWind | null>(null);
  public readonly course = Subject.create<number | null>(null);
  public readonly temperature = Subject.create<AtmoTemperature | null>(null);
  public readonly grossWeight = Subject.create<number | null>(null);
  public readonly mach = Subject.create<number | null>(null);
  public readonly ias = Subject.create<number | null>(null);
  public readonly indicatedAltitude = Subject.create<number | null>(null);
  public readonly airportElevation = Subject.create<number | null>(null);
  public readonly heightAal = Subject.create<number | null>(null);
  public readonly airportTemperature = Subject.create<number | null>(null);

  public readonly results = Subject.create<AtmoResultsView>(NO_ATMO_RESULTS);

  /** CLEAR: the entries and the results back to empty, the computation types stay */
  public clearEntries(): void {
    this.wind.set(null);
    this.temperature.set(null);
    for (const entry of [
      this.course,
      this.grossWeight,
      this.mach,
      this.ias,
      this.indicatedAltitude,
      this.airportElevation,
      this.heightAal,
      this.airportTemperature,
    ]) {
      entry.set(null);
    }
    this.results.set(NO_ATMO_RESULTS);
  }

  /** EXIT SESSION: ATMO starts as on its first opening */
  public reset(): void {
    this.computationType.set(0);
    this.speedType.set(0);
    this.altType.set(0);
    this.clearEntries();
  }
}
