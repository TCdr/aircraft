// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { ChartImageSupplier } from '@microsoft/msfs-sdk';

/** A runway a chart applies to: the number and the designator letter (L, C, R or T), empty when there is none */
export interface ChartRunway {
  readonly number: string;
  readonly designator: string;
}

/** What the OIT keeps of a chart of the airport index */
export interface TerminalChart {
  readonly guid: string;
  readonly name: string;
  /** The chart type of the provider (SID, STAR, IAC...) */
  readonly type: string;
  readonly runways: readonly ChartRunway[];
  /** The start of the validity, unix ms, null when the provider gives none */
  readonly validFrom: number | null;
  /** The end of the validity, unix ms, null when the provider gives none */
  readonly validUntil: number | null;
}

/** A page of a chart: the size in arbitrary units (only the proportions count) and the address of its image */
export interface TerminalChartPage {
  readonly width: number;
  readonly height: number;
  readonly imageUrl: string;
}

/**
 * Where the charts come from. The page and the session know no provider: the simulator's chart service is behind this
 * interface, and the specs and the harness give it test charts.
 */
export interface TerminalChartSource {
  /**
   * @param icao the airport
   * @returns its charts, empty when the airport has none; rejects when the service does not answer
   */
  index(icao: string): Promise<TerminalChart[]>;

  /**
   * @param guid a chart
   * @returns its pages, rejects when the service does not answer
   */
  pages(guid: string): Promise<TerminalChartPage[]>;

  /** @returns the supplier of chart images of the gauge: always the same one, made on the first call and never destroyed */
  createImageSupplier(): ChartImageSupplier;
}
