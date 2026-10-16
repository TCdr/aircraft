// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subscription } from '@microsoft/msfs-sdk';
import { AocFmsMessages } from '@datalink/aoc';
import { AtcComPrinter } from '../ATCCOM/AtcDatalinkSystem';
import { wrapMsgRecordText } from '../ATCCOM/MsgRecord';

/** The printed width of the cockpit printer, as the ATC COM printouts */
const PRINT_WIDTH = 64;

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
 * Prints the AOC messages on the cockpit printer on the pedestal: "The AOC can automatically print various received
 * messages, via the printer that is on the center pedestal. The flight crew can use this printer to manually print any
 * message." (A380 FCOM DSC-46-40-10-20, a380_fcom.txt l.107938-107939). The OIT COMPANY COM inbox PRINT button
 * publishes aocPrintMessage (OIT/System/CompanyComMailbox.ts); the MFD instrument prints it with the FMS printer of the
 * master FMC. Without an available printer nothing is printed (the FCOM gives no OIT indication for it).
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
      .getSubscriber<AocFmsMessages>()
      .on('aocPrintMessage')
      .handle((text) => this.printer()?.printText('AOC MESSAGE', aocPrintLines(text)));
  }

  public destroy(): void {
    this.subscription.destroy();
  }
}
