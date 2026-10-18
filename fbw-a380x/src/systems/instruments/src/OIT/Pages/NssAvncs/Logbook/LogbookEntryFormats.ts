// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmsErrorType } from '@fmgc/FmsError';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { A380FmsError } from '../../../../MFD/shared/A380FmsError';
import {
  formatLogbookDate,
  formatLogbookMinutes,
  parseLogbookDate,
  parseLogbookMinutes,
} from '../../../System/TechLogbook';

/** The displayed text and the leading and trailing units of an input field */
type FieldFormatTuple = [value: string | null, unitLeading: string | null, unitTrailing: string | null];

/** An HH:MM entry: a time of day (hours up to 23) or a duration (hours up to 99999) */
export class LogbookMinutesFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-----';

  public readonly maxDigits: number;

  constructor(private readonly maxHours: number) {
    this.maxDigits = maxHours > 23 ? 8 : 5;
  }

  public format(value: number | null): FieldFormatTuple {
    return [value === null ? this.placeholder : formatLogbookMinutes(value), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    const minutes = parseLogbookMinutes(input, this.maxHours);
    if (minutes === undefined) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    return minutes;
  }
}

/** The date of flight, DDMMYY or DD-MMM-YY */
export class LogbookDateFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--------';

  public readonly maxDigits = 9;

  public format(value: number | null): FieldFormatTuple {
    return [value === null ? this.placeholder : formatLogbookDate(value), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    const date = parseLogbookDate(input);
    if (date === undefined) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    return date;
  }
}

/** A whole positive number, e.g. the fuel uplift in litres */
export class LogbookIntegerFormat implements DataEntryFormat<number> {
  public readonly placeholder = '----------';

  constructor(public readonly maxDigits: number) {}

  public format(value: number | null): FieldFormatTuple {
    return [value === null ? this.placeholder : value.toFixed(0), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    const text = input.trim();
    if (text === '') {
      return null;
    }
    if (!/^\d+$/.test(text)) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    return Number(text);
  }
}

/** The password of the logbook identification: shown as stars */
export class LogbookPasswordFormat implements DataEntryFormat<string> {
  public readonly placeholder = '';

  public readonly maxDigits = 12;

  public format(value: string | null): FieldFormatTuple {
    return [value ? '*'.repeat(value.length) : '', null, null];
  }

  public async parse(input: string): Promise<string | null> {
    return input === '' ? null : input;
  }
}
