// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { formatOisDateTime } from './OisDateTime';

/*
 * The EXPORT BOX of the FLT OPS laptop: the data exported from the FLT FOLDER and the applications, waiting to be sent
 * to the ground over wireless (GND) or copied to a USB key (USB).
 * In the sim:
 * - the wireless link is the gatelink, available on the ground with the laptop on the network. Data sent while it is
 *   not available waits in the outbox (after the crew accepts it in a pop-up) and goes when the gatelink comes back.
 *   Nothing receives the data: SENT is the end of the process.
 * - there is no USB key: USB KEY: NO KEY, and USB cannot be ticked.
 */

export type ExportDestination = 'GND' | 'USB';

export type ExportStatus =
  | { readonly state: 'NOT SENT' }
  | { readonly state: 'SENT'; readonly destination: ExportDestination; readonly timeMs: number };

export interface ExportBoxItem {
  /** The DATA IDENTIFIER, e.g. FLT FOLDER AIB110 ICN-LAX 19-DEC-08 */
  readonly identifier: string;
  /** The application the data comes from, e.g. FLT FOLDER */
  readonly source: string;
  /** When the data was exported, unix ms */
  readonly dateMs: number;
  readonly gnd: boolean;
  readonly usb: boolean;
  /** Waits in the outbox for the ground communication */
  readonly inOutbox: boolean;
  readonly status: ExportStatus;
}

/** What SEND did */
export type ExportSendResult = 'sent' | 'no-com' | 'nothing';

/**
 * @param status an export status
 * @returns the STATUS column text, e.g. SENT (GND) 19-DEC 08:55
 */
export function exportStatusText(status: ExportStatus): string {
  return status.state === 'SENT' ? `SENT (${status.destination}) ${formatOisDateTime(status.timeMs)}` : 'NOT SENT';
}

export class OisExportBox {
  private readonly _items = Subject.create<readonly ExportBoxItem[]>([]);
  public readonly items = this._items as Subscribable<readonly ExportBoxItem[]>;

  private readonly _gatelinkAvailable = Subject.create(false);
  /** WIRELESS STATUS: GATELINK AVAIL / GATELINK NOT AVAIL */
  public readonly gatelinkAvailable = this._gatelinkAvailable as Subscribable<boolean>;

  /** No USB key in the sim */
  public readonly usbKeyPresent = false;

  /**
   * Exported data enters the box NOT SENT; an export of the same data again replaces the older one.
   * @param identifier the DATA IDENTIFIER
   * @param source the application it comes from
   * @param dateMs the export time, unix ms
   */
  public add(identifier: string, source: string, dateMs: number): void {
    const others = this._items.get().filter((item) => item.identifier !== identifier || item.source !== source);
    this._items.set([
      ...others,
      { identifier, source, dateMs, gnd: false, usb: false, inOutbox: false, status: { state: 'NOT SENT' } },
    ]);
  }

  /**
   * Ticks or unticks a destination of a row. USB needs a USB key; data already in the outbox keeps GND.
   * @param index the row
   * @param destination the column clicked
   */
  public toggleDestination(index: number, destination: ExportDestination): void {
    if (destination === 'USB' && !this.usbKeyPresent) {
      return;
    }
    this._items.set(
      this._items.get().map((item, i): ExportBoxItem => {
        if (i !== index || (destination === 'GND' && item.inOutbox)) {
          return item;
        }
        return destination === 'GND' ? { ...item, gnd: !item.gnd } : { ...item, usb: !item.usb };
      }),
    );
  }

  /** @returns whether SEND has something to send */
  public canSend(): boolean {
    return this._items.get().some((item) => (item.gnd && !item.inOutbox) || item.usb);
  }

  /**
   * SEND: the ticked rows go to their destinations. Without the ground communication nothing is sent, and the pop-up
   * offers to move the GND data to the outbox ({@link moveToOutbox}).
   * @param nowMs the time, unix ms
   * @returns 'sent', 'no-com' for the pop-up, or 'nothing' with nothing ticked
   */
  public send(nowMs: number): ExportSendResult {
    if (!this.canSend()) {
      return 'nothing';
    }
    const groundNeeded = this._items.get().some((item) => item.gnd && !item.inOutbox);
    if (groundNeeded && !this._gatelinkAvailable.get()) {
      return 'no-com';
    }
    this._items.set(
      this._items.get().map((item): ExportBoxItem => {
        if (item.inOutbox || !(item.gnd || item.usb)) {
          return item;
        }
        return {
          ...item,
          gnd: false,
          usb: false,
          status: { state: 'SENT', destination: item.gnd ? 'GND' : 'USB', timeMs: nowMs },
        };
      }),
    );
    return 'sent';
  }

  /** The OK of the no-com pop-up: the GND data waits in the outbox, sent when the communication is available */
  public moveToOutbox(): void {
    this._items.set(this._items.get().map((item) => (item.gnd ? { ...item, inOutbox: true } : item)));
  }

  /**
   * @param gatelinkAvailable the gatelink is available
   * @param nowMs the time, unix ms
   */
  public update(gatelinkAvailable: boolean, nowMs: number): void {
    this._gatelinkAvailable.set(gatelinkAvailable);
    if (!gatelinkAvailable || !this._items.get().some((item) => item.inOutbox)) {
      return;
    }
    this._items.set(
      this._items
        .get()
        .map(
          (item): ExportBoxItem =>
            item.inOutbox
              ? { ...item, gnd: false, inOutbox: false, status: { state: 'SENT', destination: 'GND', timeMs: nowMs } }
              : item,
        ),
    );
  }

  /** @param index the row whose recycle bin is clicked */
  public remove(index: number): void {
    this._items.set(this._items.get().filter((_, i) => i !== index));
  }

  /** The recycle bin ALL: empties the box */
  public removeAll(): void {
    this._items.set([]);
  }
}
