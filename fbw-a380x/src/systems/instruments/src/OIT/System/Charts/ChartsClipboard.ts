// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { FltOpsLaptopIndex } from '../FltOpsStatusSync';

/** A chart as the clipboard and the other laptop know it */
export interface ChartRef {
  readonly icao: string;
  readonly guid: string;
  readonly name: string;
}

export interface ChartsClipboardMessage {
  readonly sender: FltOpsLaptopIndex;
  readonly charts: readonly ChartRef[];
}

/** The charts clipboard exchanges between the CAPT and F/O laptops, synced to the other OIT instrument */
export interface ChartsNetworkEvents {
  /** A laptop sends its prepared clipboard to the other laptop */
  oisChartsClipboard: ChartsClipboardMessage;
}

/** How a laptop reaches the other laptop */
export interface ChartsNetwork {
  sendClipboard(message: ChartsClipboardMessage): void;
}

/**
 * The charts a crew member prepares to have at hand, and their exchange with the other laptop: SEND offers the prepared
 * charts to the other laptop, IMPORT there takes them in. A laptop that is not on the network sends and receives
 * nothing.
 */
export class ChartsClipboard {
  private readonly _charts = Subject.create<ChartRef[]>([]);
  /** The charts prepared on this laptop, in the order they were prepared */
  public readonly charts = this._charts as Subscribable<ChartRef[]>;

  private readonly _offered = Subject.create<ChartRef[]>([]);
  /** The charts the other laptop sent and this one has not imported yet */
  public readonly offered = this._offered as Subscribable<ChartRef[]>;

  /**
   * @param index the laptop
   * @param network the way to the other laptop
   * @param onNetwork whether the laptop is running and connected to the FLT OPS network
   */
  constructor(
    private readonly index: FltOpsLaptopIndex,
    private readonly network: ChartsNetwork,
    public readonly onNetwork: Subscribable<boolean>,
  ) {}

  /** @param chart a chart to prepare: nothing happens when it is prepared already */
  public prepare(chart: ChartRef): void {
    if (!this.contains(chart.guid)) {
      this._charts.set(this._charts.get().concat([chart]));
    }
  }

  /** @param guid the chart to take off the clipboard */
  public remove(guid: string): void {
    this._charts.set(this._charts.get().filter((chart) => chart.guid !== guid));
  }

  public clear(): void {
    this._charts.set([]);
  }

  /**
   * @param guid a chart
   * @returns whether the chart is prepared
   */
  public contains(guid: string): boolean {
    return this._charts.get().some((chart) => chart.guid === guid);
  }

  /** @returns whether SEND acts: there is something to send and the laptop is on the network */
  public canSend(): boolean {
    return this.onNetwork.get() && this._charts.get().length > 0;
  }

  /** @returns whether IMPORT acts: the other laptop sent charts and this laptop is on the network */
  public canImport(): boolean {
    return this.onNetwork.get() && this._offered.get().length > 0;
  }

  /** SEND: the prepared charts go to the other laptop */
  public send(): void {
    if (this.canSend()) {
      this.network.sendClipboard({ sender: this.index, charts: this._charts.get() });
    }
  }

  /** @param message what the other laptop sent: kept until the crew imports it */
  public receive(message: ChartsClipboardMessage): void {
    if (message.sender !== this.index && this.onNetwork.get()) {
      this._offered.set(message.charts.slice());
    }
  }

  /** IMPORT: the charts the other laptop sent join the prepared ones, those already prepared stay where they are */
  public importOffered(): void {
    if (!this.canImport()) {
      return;
    }
    const known = this._charts.get();
    const added = this._offered.get().filter((chart) => !this.contains(chart.guid));
    this._charts.set(known.concat(added));
    this._offered.set([]);
  }

  /** The laptop stops: nothing is kept */
  public reset(): void {
    this._charts.set([]);
    this._offered.set([]);
  }
}
