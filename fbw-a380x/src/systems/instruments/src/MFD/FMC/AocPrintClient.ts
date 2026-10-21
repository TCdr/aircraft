// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subscription } from '@microsoft/msfs-sdk';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';
import { AtcComPrinter } from '../ATCCOM/AtcDatalinkSystem';
import { wrapMsgRecordText } from '../ATCCOM/MsgRecord';

/** The printed width of the cockpit printer, as the ATC COM printouts */
const PRINT_WIDTH = 64;

/** The title of a printout that does not give its own */
const AOC_MESSAGE_TITLE = 'AOC MESSAGE';

/**
 * The lines of an AOC printout: the text lines, the long ones wrapped to the printer width, the empty ones kept as
 * separators.
 * @param text the AOC print text (aocPrintMessage)
 * @returns the printed lines
 */
export function aocPrintLines(text: string): string[] {
  // No flatMap in the Coherent GT runtime
  const lines: string[] = [];
  text.split('\n').forEach((line) => {
    if (line.trim() === '') {
      lines.push('');
    } else {
      lines.push(...wrapMsgRecordText(line, PRINT_WIDTH));
    }
  });
  return lines;
}

/**
 * Prints the AOC messages on the cockpit printer on the pedestal (the AOC prints received messages there, and the
 * flight crew can print any message). The OIT COMPANY COM inbox PRINT button publishes aocPrintMessage
 * (OIT/System/CompanyComMailbox.ts), the other OIS applications publish their printouts with their own title; the MFD
 * instrument prints them with the FMS printer of the master FMC. Without an available printer nothing is printed (no
 * OIT indication is defined for it). The AOC also prints some received messages by itself (systems host
 * CpiomD/AocAutoPrint.ts): those printouts carry the message id, told back once printed.
 */
export class AocPrintClient {
  private readonly subscription: Subscription;

  /**
   * @param bus the MFD event bus
   * @param printer the cockpit printer, null when not available
   */
  constructor(
    bus: EventBus,
    private readonly printer: () => AtcComPrinter | null,
  ) {
    this.subscription = bus
      .getSubscriber<A380AocPrintEvents>()
      .on('aocPrintMessage')
      .handle((message) => {
        const printout: AocPrintout = typeof message === 'string' ? { text: message } : message;
        const printer = this.printer();
        if (printer === null) {
          return;
        }
        printer.printText(printout.title ?? AOC_MESSAGE_TITLE, aocPrintLines(printout.text));
        // The AOC keeps the COMPANY MSG:PRNTR memo until its automatic printout is printed
        if (printout.printId !== undefined) {
          bus.getPublisher<A380AocPrintEvents>().pub('aocPrintoutPrinted', printout.printId, true, false);
        }
      });
  }

  public destroy(): void {
    this.subscription.destroy();
  }
}
