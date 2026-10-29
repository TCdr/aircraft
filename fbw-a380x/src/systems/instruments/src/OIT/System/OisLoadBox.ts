// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import type { ISimbriefData } from '@flybywiresim/fbw-sdk';
import { OIS_MONTHS, oisDateMixedCase } from './OisDateTime';

/*
 * The LOAD BOX of the FLT OPS laptop: the data available to load into the laptops, and their loading status on the
 * CAPT, F/O and backup laptops. In the sim, the data sent from the ground over wireless (gatelink/SATCOM) is the
 * electronic flight folder (EFF) of the airline OFP (SimBrief). There is no USB device in the sim, and the
 * performance databases are part of the aircraft, so neither appears.
 * Loading on one laptop loads every laptop connected to the network. The backup laptop has no model in the sim: it is
 * taken as connected whenever this laptop is.
 */

export type LoadBoxLaptop = 'CAPT' | 'FO' | 'BACKUP';

export type LoadBoxStatus = 'NOT LOADED' | 'LOADED';

/** An electronic flight folder (EFF) */
export interface ElectronicFlightFolder {
  readonly flightNumber: string;
  readonly from: string;
  readonly to: string;
  /** The scheduled departure, unix ms, null when the OFP has none */
  readonly dateMs: number | null;
}

export interface LoadBoxItem {
  readonly eff: ElectronicFlightFolder;
  /** The DATA IDENTIFIER, e.g. AIB406 23-Sep-08 NRT-TLS */
  readonly identifier: string;
  /** The airline OFP, kept whole: the FLT FOLDER builds its documents from it */
  readonly ofp: ISimbriefData;
  /** When the OFP was generated, unix ms, null when the OFP does not say */
  readonly generatedMs: number | null;
  /** The application the data is for */
  readonly destination: string;
  readonly selected: boolean;
  readonly status: Readonly<Record<LoadBoxLaptop, LoadBoxStatus>>;
}

/**
 * @param dateMs unix ms
 * @returns the UTC date as DD-MMM-YY, e.g. 23-SEP-08
 */
export function oisDate(dateMs: number): string {
  const date = new Date(dateMs);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear() % 100).padStart(2, '0');
  return `${day}-${OIS_MONTHS[date.getUTCMonth()]}-${year}`;
}

/**
 * @param ofp the airline OFP
 * @returns its electronic flight folder: the flight number with the airline code, the city pair (IATA codes when the
 * OFP has them) and the scheduled departure date
 */
export function effFromOfp(ofp: ISimbriefData): ElectronicFlightFolder {
  const airline = typeof ofp.airline === 'string' ? ofp.airline : '';
  const scheduledOutS = Number(ofp.times?.schedOut);
  return {
    flightNumber: `${airline}${ofp.flightNumber ?? ''}`,
    from: ofp.origin.iata || ofp.origin.icao,
    to: ofp.destination.iata || ofp.destination.icao,
    dateMs: Number.isFinite(scheduledOutS) && scheduledOutS > 0 ? scheduledOutS * 1000 : null,
  };
}

/**
 * @param eff an electronic flight folder
 * @returns its label, as in the FLT FOLDER list: flight number, date, city pair
 */
export function effIdentifier(eff: ElectronicFlightFolder): string {
  const date = eff.dateMs !== null ? ` ${oisDate(eff.dateMs)}` : '';
  return `${eff.flightNumber}${date} ${eff.from}-${eff.to}`;
}

/**
 * @param eff an electronic flight folder
 * @returns its label in the FLT FOLDER (root of the tree, list): the identifier with the date in mixed case
 */
export function effFolderLabel(eff: ElectronicFlightFolder): string {
  const date = eff.dateMs !== null ? ` ${oisDateMixedCase(eff.dateMs)}` : '';
  return `${eff.flightNumber}${date} ${eff.from}-${eff.to}`;
}

/**
 * @param eff an electronic flight folder
 * @returns its DATA IDENTIFIER in the EXPORT BOX: FLT FOLDER, flight number, city pair, date
 */
export function effExportIdentifier(eff: ElectronicFlightFolder): string {
  const date = eff.dateMs !== null ? ` ${oisDate(eff.dateMs)}` : '';
  return `FLT FOLDER ${eff.flightNumber} ${eff.from}-${eff.to}${date}`;
}

const NOT_LOADED: Readonly<Record<LoadBoxLaptop, LoadBoxStatus>> = {
  CAPT: 'NOT LOADED',
  FO: 'NOT LOADED',
  BACKUP: 'NOT LOADED',
};

export class OisLoadBox {
  private readonly _items = Subject.create<readonly LoadBoxItem[]>([]);
  public readonly items = this._items as Subscribable<readonly LoadBoxItem[]>;

  private readonly _refreshing = Subject.create(false);
  /** A refresh is waiting for the ground */
  public readonly refreshing = this._refreshing as Subscribable<boolean>;

  private readonly _loaded = Subject.create<readonly LoadBoxItem[]>([]);
  /** Every item loaded into this laptop, the FLT FOLDER imports them */
  public readonly loaded = this._loaded as Subscribable<readonly LoadBoxItem[]>;

  /**
   * @param fetchOfp asks the ground for the airline OFP
   * @param onLoadedByCrew tells the other laptops about items the crew of this laptop loaded
   */
  constructor(
    private readonly fetchOfp: () => Promise<ISimbriefData>,
    private readonly onLoadedByCrew: (items: readonly LoadBoxItem[]) => void = () => {},
  ) {}

  private running: Promise<void> | null = null;

  /**
   * Detects the data sent from the ground (opening the LOAD BOX, or REFRESH LOAD BOX) and adds a new EFF to the list.
   * The wireless data comes through the network: a stand-alone laptop gets none. A refresh while another one runs
   * waits for it.
   * @param connectedToNetwork this laptop is connected to the network
   * @returns when the ground has answered
   */
  public refresh(connectedToNetwork: boolean): Promise<void> {
    if (!connectedToNetwork) {
      return Promise.resolve();
    }
    if (this.running !== null) {
      return this.running;
    }
    this._refreshing.set(true);
    this.running = this.fetchAndAdd();
    return this.running;
  }

  private async fetchAndAdd(): Promise<void> {
    try {
      const ofp = await this.fetchOfp();
      this.addEff(ofp);
    } catch (e) {
      console.warn('[OIS] LOAD BOX: no data from the ground', e);
    }
    this._refreshing.set(false);
    this.running = null;
  }

  private addEff(ofp: ISimbriefData): void {
    const eff = effFromOfp(ofp);
    const identifier = effIdentifier(eff);
    const generatedMs = typeof ofp.generatedTime === 'number' ? ofp.generatedTime * 1000 : null;
    const known = this._items.get().find((item) => item.identifier === identifier);
    if (known && known.generatedMs === generatedMs) {
      return;
    }
    // A newer OFP of the same flight replaces the older one and has to be loaded again
    const others = this._items.get().filter((item) => item.identifier !== identifier);
    this._items.set([
      ...others,
      { eff, identifier, ofp, generatedMs, destination: 'FLT FOLDER', selected: false, status: NOT_LOADED },
    ]);
  }

  /**
   * The other laptop loaded an item: this laptop fetches the OFP from the ground itself and takes the item only if it is
   * the same OFP (same flight and same generation time). Otherwise the item stays NOT LOADED here.
   * @param identifier the DATA IDENTIFIER the other laptop loaded
   * @param generatedMs when its OFP was generated, unix ms
   * @param ownLaptop the laptop of this OIT
   * @param connectedToNetwork this laptop is connected to the network
   */
  public async loadFromOffside(
    identifier: string,
    generatedMs: number | null,
    ownLaptop: 'CAPT' | 'FO',
    connectedToNetwork: boolean,
  ): Promise<void> {
    await this.refresh(connectedToNetwork);
    const item = this._items.get().find((i) => i.identifier === identifier);
    if (!item || item.generatedMs !== generatedMs) {
      return;
    }
    const otherLaptop = ownLaptop === 'CAPT' ? 'FO' : 'CAPT';
    const loadedItem: LoadBoxItem = {
      ...item,
      selected: false,
      status: { ...item.status, [ownLaptop]: 'LOADED', [otherLaptop]: 'LOADED', BACKUP: 'LOADED' },
    };
    this._items.set(this._items.get().map((i) => (i === item ? loadedItem : i)));
    this.addLoaded(loadedItem);
  }

  private addLoaded(item: LoadBoxItem): void {
    this._loaded.set([...this._loaded.get().filter((i) => i.identifier !== item.identifier), item]);
  }

  /** @param index the row whose tick box is clicked */
  public toggle(index: number): void {
    this._items.set(this._items.get().map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)));
  }

  /** The tick box of the column title: ticks every row, or unticks every row when all are ticked */
  public toggleAll(): void {
    const items = this._items.get();
    const selectAll = !items.every((item) => item.selected);
    this._items.set(items.map((item) => ({ ...item, selected: selectAll })));
  }

  /** @returns whether every row is ticked (and there is a row) */
  public allSelected(): boolean {
    const items = this._items.get();
    return items.length > 0 && items.every((item) => item.selected);
  }

  /**
   * LOAD: loads the ticked items into this laptop and into every laptop connected to the network. A laptop that does
   * not get it stays NOT LOADED: the crew loads the item again later.
   * @param ownLaptop the laptop of this OIT
   * @param connectedToNetwork this laptop is connected to the network
   * @param otherLaptopHealthy the laptop of the other OIT runs
   */
  public load(ownLaptop: 'CAPT' | 'FO', connectedToNetwork: boolean, otherLaptopHealthy: boolean): void {
    const otherLaptop = ownLaptop === 'CAPT' ? 'FO' : 'CAPT';
    const loaded = (gotIt: boolean, before: LoadBoxStatus): LoadBoxStatus => (gotIt ? 'LOADED' : before);
    const items = this._items.get();
    if (!items.some((item) => item.selected)) {
      return;
    }
    const loadedItems: LoadBoxItem[] = [];
    this._items.set(
      items.map((item) => {
        if (!item.selected) {
          return item;
        }
        const status: Record<LoadBoxLaptop, LoadBoxStatus> = { ...item.status };
        status[ownLaptop] = 'LOADED';
        status[otherLaptop] = loaded(connectedToNetwork && otherLaptopHealthy, status[otherLaptop]);
        status.BACKUP = loaded(connectedToNetwork, status.BACKUP);
        const loadedItem = { ...item, selected: false, status };
        loadedItems.push(loadedItem);
        return loadedItem;
      }),
    );
    loadedItems.forEach((item) => this.addLoaded(item));
    if (connectedToNetwork && otherLaptopHealthy) {
      this.onLoadedByCrew(loadedItems);
    }
  }

  /** @param index the row whose recycle bin is clicked: removed from the list, the loaded data stays */
  public remove(index: number): void {
    this._items.set(this._items.get().filter((_, i) => i !== index));
  }

  /** The recycle bin ALL: empties the list */
  public removeAll(): void {
    this._items.set([]);
  }
}
