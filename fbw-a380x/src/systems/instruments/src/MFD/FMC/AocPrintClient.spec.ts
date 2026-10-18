// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AocFmsMessages } from '@datalink/aoc';
import { A380AocPrintEvents } from '@shared/AocPrintout';
import { AocPrintClient, aocPrintLines } from './AocPrintClient';

/*
 * AOC messages are printed on the pedestal printer: automatically when received, or on request of the flight crew.
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

  it('prints an OIS printout under its own title, and under AOC MESSAGE without one', () => {
    const bus = new EventBus();
    const printed: { title: string; body: readonly string[] }[] = [];
    const client = new AocPrintClient(bus, () => ({ printText: (title, body) => printed.push({ title, body }) }));
    const publisher = bus.getPublisher<A380AocPrintEvents>();
    publisher.pub('aocPrintMessage', { title: 'LOADSHEET', text: 'LOADSHEET FINAL\nZFW 300.0' });
    publisher.pub('aocPrintMessage', { text: 'HELLO CREW' });
    expect(printed).toEqual([
      { title: 'LOADSHEET', body: ['LOADSHEET FINAL', 'ZFW 300.0'] },
      { title: 'AOC MESSAGE', body: ['HELLO CREW'] },
    ]);
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
