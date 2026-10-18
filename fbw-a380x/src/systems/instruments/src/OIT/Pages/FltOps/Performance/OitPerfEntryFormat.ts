// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subscribable } from '@microsoft/msfs-sdk';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { DataEntryFormat } from '../../../../MFD/pages/common/DataEntryFormats';

/**
 * A text box of the performance applications: the entry is parsed by the application rules (PerformanceEntries), an
 * empty box shows nothing, as on the laptop screens.
 */
export class OitPerfEntryFormat<T> implements DataEntryFormat<T> {
  public readonly placeholder = '';

  /**
   * @param parser parses an entry, null for an invalid one
   * @param formatter shows a value
   * @param maxDigits the longest entry
   * @param reFormatTrigger shows the value again when what the formatter depends on changes
   */
  constructor(
    private readonly parser: (text: string) => T | null,
    private readonly formatter: (value: T) => string,
    public readonly maxDigits = 12,
    public readonly reFormatTrigger?: Subscribable<boolean>,
  ) {}

  public format(value: T | null): [string | null, string | null, string | null] {
    return [value === null || value === undefined ? '' : this.formatter(value), null, null];
  }

  public async parse(input: string): Promise<T | null> {
    if (input.trim() === '') {
      return null;
    }
    const value = this.parser(input);
    if (value === null) {
      throw new FmsError(FmsErrorType.FormatError);
    }
    return value;
  }
}

/** A free text box (LTS EDITION) */
export class OitPerfTextFormat implements DataEntryFormat<string> {
  public readonly placeholder = '';

  /** @param maxDigits the longest entry */
  constructor(public readonly maxDigits = 24) {}

  public format(value: string | null): [string | null, string | null, string | null] {
    return [value ?? '', null, null];
  }

  public async parse(input: string): Promise<string | null> {
    const text = input.trim().toUpperCase();
    return text === '' ? null : text.substring(0, this.maxDigits);
  }
}
