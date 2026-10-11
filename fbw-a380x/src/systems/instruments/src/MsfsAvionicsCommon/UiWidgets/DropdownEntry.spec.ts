// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { ArraySubject } from '@microsoft/msfs-sdk';
import { dropdownEntryIndex, onDropdownEntry } from './DropdownEntry';

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

describe('dropdown entry handler (VERT REV SPD/ALT CSTR AT, STEP ALTs)', () => {
  const values = ArraySubject.create(['WPT01', 'WPT02', 'WPT03']);

  it('passes the list index of a typed waypoint, never -1', () => {
    const handler = vi.fn();
    onDropdownEntry(values, handler)(-1, 'WPT02');
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('passes the clicked index', () => {
    const handler = vi.fn();
    onDropdownEntry(values, handler)(2, '');
    expect(handler).toHaveBeenCalledWith(2);
  });

  it('does not call the handler for a typed text that is no item (the dropdown shows NOT IN LIST)', () => {
    const handler = vi.fn();
    onDropdownEntry(values, handler)(-1, 'XXXXX');
    expect(handler).not.toHaveBeenCalled();
  });
});
