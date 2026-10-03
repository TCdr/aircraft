// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SelectionTabs } from './SelectionTabs';

const TABS = [
  { name: 'Aircraft Options / Pin Programs', component: <></> },
  { name: 'Sim Options', component: <></> },
  { name: 'About', component: <></> },
];

/** The class lists of the category links, rendered at a route */
const linkClassesAt = (path: string): string[][] => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <SelectionTabs tabs={TABS} />
    </MemoryRouter>,
  );
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('a')).map((link) => link.className.split(/\s+/));
};

describe('Settings category list', () => {
  it('gives the open category the active class its group-[.active] children rely on', () => {
    const [aircraft, sim, about] = linkClassesAt('/settings/sim-options');

    expect(sim).toContain('active');
    expect(sim).toContain('!bg-m3-primary-container');
    expect(aircraft).not.toContain('active');
    expect(about).not.toContain('active');
  });

  it('keeps the category active on the pages under it', () => {
    const [, , about] = linkClassesAt('/settings/about/troubleshooting');

    expect(about).toContain('active');
  });
});
