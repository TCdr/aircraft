// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { PrintRequestOutcome, printRequestOutcome, requestPrint } from './McduPrinter';
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

  it('the print request queues the message for a failed printer and prints nothing', () => {
    const queueMessage = vi.fn();
    expect(requestPrint(true, false, queueMessage)).toBe(false);
    expect(queueMessage).toHaveBeenCalledTimes(1);
    expect(queueMessage).toHaveBeenCalledWith(NXSystemMessages.printerNotAvailable);
  });

  it('the print request prints with a working printer without a message, and drops a request while printing', () => {
    const queueMessage = vi.fn();
    expect(requestPrint(false, false, queueMessage)).toBe(true);
    expect(requestPrint(false, true, queueMessage)).toBe(false);
    expect(queueMessage).not.toHaveBeenCalled();
  });
});
