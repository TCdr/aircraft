// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { M3ActionChip, M3Switch } from './Material';

/** The class list of the first button of a rendered element */
const buttonClasses = (element: React.ReactElement): string[] => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  return container.querySelector('button')!.className.split(/\s+/);
};

describe('Material kit: disabled controls', () => {
  it('greys out a disabled switch from its prop, not from the :disabled pseudo-class (the GSX link switch)', () => {
    const classes = buttonClasses(<M3Switch value={false} onToggle={() => {}} disabled aria-label="GSX services" />);

    expect(classes).toContain('opacity-40');
    expect(classes).toContain('pointer-events-none');
  });

  it('keeps an enabled switch at full opacity', () => {
    const classes = buttonClasses(<M3Switch value onToggle={() => {}} aria-label="GSX services" />);

    expect(classes).not.toContain('opacity-40');
    expect(classes).not.toContain('pointer-events-none');
  });

  it('greys out a disabled action chip the same way', () => {
    const classes = buttonClasses(
      <M3ActionChip onClick={() => {}} disabled>
        Water
      </M3ActionChip>,
    );

    expect(classes).toContain('opacity-40');
  });
});
