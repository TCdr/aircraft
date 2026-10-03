// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { joinDescentNotes } from './descentNotes';

describe('joinDescentNotes', () => {
  it('puts the separator only between the notes, not after the last one', () => {
    expect(joinDescentNotes(['Crossover FL290', 'Decel to speed limit from FL150'])).toBe(
      'Crossover FL290 · Decel to speed limit from FL150',
    );
  });

  it('skips the absent notes', () => {
    expect(joinDescentNotes([undefined, 'Decel to speed limit from FL150'])).toBe('Decel to speed limit from FL150');
    expect(joinDescentNotes(['Crossover FL290', false, ''])).toBe('Crossover FL290');
  });

  it('is empty without any note', () => {
    expect(joinDescentNotes([undefined, null, false])).toBe('');
  });
});
