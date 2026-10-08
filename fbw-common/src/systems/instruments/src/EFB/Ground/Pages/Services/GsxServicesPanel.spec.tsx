// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GsxServicesPanel, gsxServiceStatus } from './GsxServicesPanel';
import { GsxRemoteState, GsxService } from './GsxRemote';
import { gsxPaxProgress } from './gsxPassengers';

// The panel's sim and flyPad dependencies (vi.mock is hoisted above the imports): only the status line is tested
vi.mock('@flybywiresim/fbw-sdk-react', () => ({
  useSimVar: () => [0, () => {}],
  SeatFlags: class {},
}));
vi.mock('../../../Store/store', () => ({ useAppSelector: () => undefined }));
vi.mock('../../../Localization/translation', () => ({ t: (key: string) => key.split('.').pop() }));

/** The GSX boarding as the user saw it: GSX's own count, stuck at 0/19 */
const boarding: GsxService = {
  id: 'Boarding',
  displayName: 'Board',
  state: 'performing',
  stateText: 'Boarding',
  canTrigger: false,
  progress: { current: 0, total: 19, unit: 'pax' },
  progressText: '0/19',
};

describe('GSX boarding status line of the Services page', () => {
  it("shows the flyPad's boarded / planned passengers instead of GSX's own count", () => {
    const pax = gsxPaxProgress('Boarding', 'performing', {
      onBoard: 40,
      planned: 120,
      gsxBoarded: 40,
      gsxDeboarded: 0,
    });

    const status = gsxServiceStatus(boarding, pax);

    expect(status.text).toBe('Boarding 40/120');
    expect(status.progress).toBeCloseTo(40 / 120);
  });

  it("keeps GSX's own progress without a flyPad count", () => {
    expect(gsxServiceStatus(boarding).text).toBe('Boarding 0/19');
  });
});

/** The action chip (its text) of each turnaround step, by the step name */
const turnaroundChips = (services: GsxService[]): Record<string, string | null> => {
  const gsx: GsxRemoteState = {
    connected: true,
    gsxRunning: true,
    services,
    menuShown: false,
    menu: { title: '', entries: [], disabled: [] },
    message: { text: '', visible: false },
  };
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<GsxServicesPanel linked onLinkChange={() => {}} gsx={gsx} />);
  const chips: Record<string, string | null> = {};
  for (const service of services) {
    const name = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === service.displayName);
    const row = name?.parentElement?.parentElement;
    chips[service.displayName] = row?.querySelector('button')?.textContent ?? null;
  }
  return chips;
};

const step = (id: string, displayName: string, state: string, canTrigger: boolean): GsxService => ({
  id,
  displayName,
  state,
  stateText: '',
  canTrigger,
  progressText: '',
});

describe('GSX turnaround steps of the Services page', () => {
  it('has no Request chip on a completed step GSX does not offer again', () => {
    const chips = turnaroundChips([
      step('Catering', 'Catering', 'completed', false),
      step('Boarding', 'Board', 'available', true),
      step('Departure', 'Pushback', 'unavailable', false),
    ]);

    expect(chips.Catering).toBeNull();
    expect(chips.Board).toBe('Request');
    expect(chips.Pushback).toBeNull();
  });

  it('keeps the Request chip of a step GSX lets be requested again', () => {
    const chips = turnaroundChips([step('Catering', 'Catering', 'available', true)]);

    expect(chips.Catering).toBe('Request');
  });
});
