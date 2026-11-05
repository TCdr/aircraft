// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { entryBoxWidth } from '../../../System/CompanyComReportForms';
import { LogbookIntegerFormat, LogbookMinutesFormat } from './LogbookEntryFormats';

/** Width of the entry boxes of the FLIGHT DATA page, px */
const FLIGHT_DATA_BOX_WIDTH = 240;

/**
 * @param format a logbook entry format
 * @returns the characters of its empty entry
 */
function emptyEntryLength(format: LogbookIntegerFormat | LogbookMinutesFormat): number {
  return (format.format(null)[0] ?? '').length;
}

describe('logbook entry formats: empty entry', () => {
  it('shows one mark per digit of a whole number', () => {
    expect(new LogbookIntegerFormat(7).format(null)[0]).toBe('-------');
    expect(emptyEntryLength(new LogbookIntegerFormat(3))).toBe(3);
  });

  it('keeps the empty-box marks of every mandatory FLIGHT DATA field inside its box', () => {
    const mandatoryFormats = [new LogbookIntegerFormat(7), new LogbookMinutesFormat(23), new LogbookMinutesFormat(99)];
    for (const format of mandatoryFormats) {
      const length = emptyEntryLength(format);
      expect(entryBoxWidth(length, true, FLIGHT_DATA_BOX_WIDTH), `${length} marks`).toBe(FLIGHT_DATA_BOX_WIDTH);
    }
  });
});
