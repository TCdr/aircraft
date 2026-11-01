// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { flatten, mergeTranslations } from './mergeTranslations';

const english = {
  Dashboard: { Title: 'Dashboard', Advice: { Crosswind: 'Crosswind $kt kt' } },
  Ground: { Taxi: { Title: 'Taxi route' } },
};

describe('mergeTranslations', () => {
  it('takes the downloaded text when Localazy has the key', () => {
    const merged = mergeTranslations(
      english,
      { Dashboard: { Title: 'Tableau de bord' } },
      { Dashboard: { Title: 'Old' } },
    );
    expect(flatten(merged)['Dashboard.Title']).toBe('Tableau de bord');
  });

  it('keeps the local text for keys Localazy does not know', () => {
    const local = {
      Dashboard: { Advice: { Crosswind: 'Vent de travers $kt kt' } },
      Ground: { Taxi: { Title: 'Roulage' } },
    };
    const merged = flatten(mergeTranslations(english, { Dashboard: { Title: 'Tableau de bord' } }, local));
    expect(merged['Dashboard.Advice.Crosswind']).toBe('Vent de travers $kt kt');
    expect(merged['Ground.Taxi.Title']).toBe('Roulage');
  });

  it('drops keys that are no longer in en.json', () => {
    const downloaded = { Dashboard: { Title: 'Tableau de bord', ImportantInformation: 'x' } };
    const merged = flatten(mergeTranslations(english, downloaded, { Dashboard: { Legacy: 'y' } }));
    expect(Object.keys(merged)).toEqual(['Dashboard.Title']);
  });

  it('orders the result like en.json', () => {
    const local = { Ground: { Taxi: { Title: 'Roulage' } }, Dashboard: { Advice: { Crosswind: 'V $kt' }, Title: 'T' } };
    expect(Object.keys(flatten(mergeTranslations(english, {}, local)))).toEqual([
      'Dashboard.Title',
      'Dashboard.Advice.Crosswind',
      'Ground.Taxi.Title',
    ]);
  });
});
