// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { PrintRequestOutcome, printRequestOutcome } from './McduPrinter';
import { NXSystemMessages } from '../messages/NXSystemMessages';

/* The cockpit printer failure (flyPad 46004): PRINTER NOT AVAILABLE, nothing printed */
describe('MCDU print with the cockpit printer failure', () => {
  it('prints with a working printer, one page at a time', () => {
    expect(printRequestOutcome(false, false)).toBe(PrintRequestOutcome.Print);
    expect(printRequestOutcome(false, true)).toBe(PrintRequestOutcome.Busy);
  });

  it('a failed printer prints nothing and gives PRINTER NOT AVAILABLE', () => {
    expect(printRequestOutcome(true, false)).toBe(PrintRequestOutcome.PrinterNotAvailable);
    expect(printRequestOutcome(true, true)).toBe(PrintRequestOutcome.PrinterNotAvailable);
  });

  it('PRINTER NOT AVAILABLE is a white type II message', () => {
    const message = NXSystemMessages.printerNotAvailable;
    expect(message.text).toBe('PRINTER NOT AVAILABLE');
    expect(message.isTypeTwo).toBe(true);
    expect(message.isAmber).toBe(false);
  });

  it('the MCDU print queues the message for a failed printer', () => {
    const mcdu = readFileSync(resolve(__dirname, 'A320_Neo_CDU_MainDisplay.ts'), 'utf-8');
    expect(mcdu).toContain('this.addMessageToQueue(NXSystemMessages.printerNotAvailable);');
  });
});
