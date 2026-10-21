//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { AocFmsMessages } from '@datalink/aoc';
import {
  AtsuMessage,
  AtsuMessageDirection,
  AtsuMessageSerializationFormat,
  AtsuMessageType,
  Conversion,
} from '@datalink/common';
import { EventBus, SimVarValueType, Subscription } from '@microsoft/msfs-sdk';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';

/** The unread company messages that wait for their automatic printout, source of the COMPANY MSG:PRNTR memo */
const COMPANY_MSG_PRNTR_COUNT_VAR = 'L:A32NX_COMPANY_MSG_PRNTR_COUNT';

/**
 * The received messages the AOC prints by itself on the pedestal printer. The airline chooses them in the AOC database.
 * Design choice: the weather reports (METAR, TAF, ATIS), the paper the crew takes along for the briefings; a free text
 * from the company is read on the OIT.
 * @param type the AOC message type
 * @returns whether the AOC prints it at reception
 */
export function isAutoPrinted(type: AtsuMessageType): boolean {
  return type === AtsuMessageType.METAR || type === AtsuMessageType.TAF || type === AtsuMessageType.ATIS;
}

/**
 * The automatic printout of the AOC: a received message of an auto-printed type goes to the pedestal printer (the MFD
 * prints it and tells it back). Until it is printed or read it keeps the COMPANY MSG:PRNTR memo in place of COMPANY
 * MSG. A message the printer could not take (printer off or unpowered) is not printed later: the crew reads it on the
 * OIT.
 */
export class AocAutoPrint {
  private readonly subscriptions: Subscription[] = [];

  /** The AOC messages already seen, so that an update of a message (read flag) does not print it again */
  private readonly knownUids = new Set<number>();

  /** The unread auto-printed messages not printed yet */
  private readonly waitingUids = new Set<number>();

  private writtenCount: number | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly writeWaitingCount: (count: number) => void = (count) =>
      SimVar.SetSimVarValue(COMPANY_MSG_PRNTR_COUNT_VAR, SimVarValueType.Number, count),
  ) {}

  public init(): void {
    const sub = this.bus.getSubscriber<AocFmsMessages & A380AocPrintEvents>();
    this.subscriptions.push(
      sub.on('aocResynchronizeFreetextMessage').handle((data) => this.onMessage(data)),
      sub.on('aocResynchronizeWeatherMessage').handle((data) => this.onMessage(data)),
      sub.on('aocDeleteMessage').handle((uid) => this.forget(uid)),
      sub.on('aocResetData').handle(() => this.forgetAll()),
      sub.on('aocPrintoutPrinted').handle((uid) => {
        this.waitingUids.delete(uid);
        this.publishWaitingCount();
      }),
    );
    this.publishWaitingCount();
  }

  private onMessage(data: AtsuMessage): void {
    const message = Conversion.messageDataToMessage(data);
    if (message === null || message.Direction !== AtsuMessageDirection.Uplink) {
      return;
    }
    const uid = message.UniqueMessageID;
    const isNew = !this.knownUids.has(uid);
    this.knownUids.add(uid);

    if (message.Confirmed) {
      this.waitingUids.delete(uid);
    } else if (isNew && isAutoPrinted(message.Type)) {
      this.waitingUids.add(uid);
      const printout: AocPrintout = { text: message.serialize(AtsuMessageSerializationFormat.Printer), printId: uid };
      this.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', printout, true, false);
    }
    this.publishWaitingCount();
  }

  private forget(uid: number): void {
    this.knownUids.delete(uid);
    this.waitingUids.delete(uid);
    this.publishWaitingCount();
  }

  private forgetAll(): void {
    this.knownUids.clear();
    this.waitingUids.clear();
    this.publishWaitingCount();
  }

  private publishWaitingCount(): void {
    const count = this.waitingUids.size;
    if (count !== this.writtenCount) {
      this.writtenCount = count;
      this.writeWaitingCount(count);
    }
  }

  public destroy(): void {
    this.subscriptions.forEach((s) => s.destroy());
    this.subscriptions.length = 0;
  }
}
