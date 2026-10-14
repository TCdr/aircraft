// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AocFmsMessages } from '@datalink/aoc';
import { AocPrintClient, aocPrintLines } from './AocPrintClient';

/*
 * A380 FCOM DSC-46-40-10-20 (a380_fcom.txt l.107938-107939): "The AOC can automatically print various received messages,
 * via the printer that is on the center pedestal. The flight crew can use this printer to manually print any message."
 */
describe('AOC message print on the pedestal printer', () => {
  it('prints an AOC message on the available printer', () => {
    const bus = new EventBus();
    const printed: { title: string; body: readonly string[] }[] = [];
    const client = new AocPrintClient(bus, () => ({ printText: (title, body) => printed.push({ title, body }) }));
    bus.getPublisher<AocFmsMessages>().pub('aocPrintMessage', 'SUBJECT : FREE TEXT KLAX\n\nHELLO CREW');
    expect(printed).toEqual([{ title: 'AOC MESSAGE', body: ['SUBJECT : FREE TEXT KLAX', '', 'HELLO CREW'] }]);
    client.destroy();
  });

  it('prints nothing without an available printer', () => {
    const bus = new EventBus();
    const client = new AocPrintClient(bus, () => null);
    expect(() => bus.getPublisher<AocFmsMessages>().pub('aocPrintMessage', 'HELLO')).not.toThrow();
    client.destroy();
  });

  it('wraps the long lines to the printer width', () => {
    const lines = aocPrintLines(`${'WORD '.repeat(20)}`);
    expect(lines.every((line) => line.length <= 64)).toBe(true);
    expect(lines.join(' ')).toBe('WORD '.repeat(20).trim());
  });
});
