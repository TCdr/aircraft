// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subscribable } from '@microsoft/msfs-sdk';
import { FmsErrorType } from '@fmgc/FmsError';
import { A380FmsError } from '../../MFD/shared/A380FmsError';
import type { DataEntryFormat } from '../../MFD/pages/common/DataEntryFormats';
import { AtmoWind, formatAtmoWind, parseAtmoAltitude, parseAtmoWind } from './InFltPerfAtmo';

type FieldFormatTuple = [value: string | null, unitLeading: string | null, unitTrailing: string | null];

/**
 * @param input the text entered
 * @returns the number (sign and decimals allowed, e.g. -5, 0.85, .85), or null for a format error
 */
export function parseAtmoNumber(input: string): number | null {
  const text = input.trim();
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text) ? Number(text) : null;
}

/**
 * @param error an entry error of an ATMO field
 * @returns its text for the RESULTS panel
 */
export function atmoEntryErrorText(error: A380FmsError): string {
  if (error.type === FmsErrorType.EntryOutOfRange) {
    return `Entry out of range${error.details ? `: ${error.details}` : ''}`;
  }
  return 'Format error';
}

/**
 * @param min the lowest value
 * @param max the highest value
 * @param decimals the decimals shown
 * @returns the out of range error, with the range
 */
function outOfRange(min: number, max: number, decimals: number): A380FmsError {
  return new A380FmsError(FmsErrorType.EntryOutOfRange, `${min.toFixed(decimals)} to ${max.toFixed(decimals)}`);
}

/** A number in a range, shown with fixed decimals */
export class AtmoNumberFormat implements DataEntryFormat<number> {
  public readonly placeholder = '';

  /**
   * @param min the lowest value
   * @param max the highest value
   * @param decimals the decimals shown
   * @param maxDigits the longest entry
   */
  constructor(
    private readonly min: number,
    private readonly max: number,
    private readonly decimals: number,
    public readonly maxDigits: number,
  ) {}

  public format(value: number | null): FieldFormatTuple {
    return [value === null ? this.placeholder : value.toFixed(this.decimals), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input.trim() === '') {
      return null;
    }
    const value = parseAtmoNumber(input);
    if (value === null) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    if (value < this.min || value > this.max) {
      throw outOfRange(this.min, this.max, this.decimals);
    }
    return value;
  }
}

/** A pressure altitude in feet or as a flight level, shown as e.g. 35000 ( FL350 ) */
export class AtmoAltitudeFormat implements DataEntryFormat<number> {
  public readonly placeholder = '';

  public readonly maxDigits = 6;

  constructor(
    private readonly min: number,
    private readonly max: number,
  ) {}

  public format(value: number | null): FieldFormatTuple {
    if (value === null) {
      return [this.placeholder, null, null];
    }
    const flightLevel = Math.round(value / 100);
    const text =
      flightLevel >= 0 ? `${value.toFixed(0)} ( FL${flightLevel.toFixed(0).padStart(3, '0')} )` : value.toFixed(0);
    return [text, null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input.trim() === '') {
      return null;
    }
    const value = parseAtmoAltitude(input);
    if (value === null) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    if (value < this.min || value > this.max) {
      throw outOfRange(this.min, this.max, 0);
    }
    return value;
  }
}

/** The WIND field, shown with its projection on the course */
export class AtmoWindFormat implements DataEntryFormat<AtmoWind> {
  public readonly placeholder = '';

  public readonly maxDigits = 7;

  /**
   * @param courseDeg the CRS entry
   * @param reFormatTrigger notified when the course changes
   */
  constructor(
    private readonly courseDeg: Subscribable<number | null>,
    public readonly reFormatTrigger: Subscribable<boolean>,
  ) {}

  public format(value: AtmoWind | null): FieldFormatTuple {
    return [value === null ? this.placeholder : formatAtmoWind(value, this.courseDeg.get()), null, null];
  }

  public async parse(input: string): Promise<AtmoWind | null> {
    if (input.trim() === '') {
      return null;
    }
    const wind = parseAtmoWind(input);
    if (wind === null) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    return wind;
  }
}
