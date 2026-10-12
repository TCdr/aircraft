// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ArraySubject } from '@microsoft/msfs-sdk';
import { dropdownEntryIndex } from './DropdownEntry';

describe('dropdown entry index', () => {
  const values = ArraySubject.create(['1', '2', '3']);

  it('keeps the index of a clicked item', () => {
    expect(dropdownEntryIndex(values, 1, '')).toBe(1);
  });
  it('finds the item of a keyboard entry', () => {
    expect(dropdownEntryIndex(values, -1, '3')).toBe(2);
  });
  it('gives no index for an empty or unknown keyboard entry', () => {
    expect(dropdownEntryIndex(values, -1, '')).toBeNull();
    expect(dropdownEntryIndex(values, -1, '4')).toBeNull();
  });
});
