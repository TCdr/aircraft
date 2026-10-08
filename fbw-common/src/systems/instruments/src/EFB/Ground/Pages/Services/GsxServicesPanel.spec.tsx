// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GsxServicesPanel, gsxServiceStatus } from './GsxServicesPanel';
import { GsxRemoteState, GsxService, withTurnaroundMemory } from './GsxRemote';
import { gsxTurnaround } from './gsxTurnaround';
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
  // as useGsxRemote gives it to the page: with the completions remembered in this turnaround
  const gsx: GsxRemoteState = withTurnaroundMemory({
    connected: true,
    gsxRunning: true,
    services,
    menuShown: false,
    menu: { title: '', entries: [], disabled: [] },
    message: { text: '', visible: false },
  });
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

describe('GSX turnaround steps after GSX resets a completed service to available', () => {
  it('keeps Board done without a Request chip, also when the page is opened again', () => {
    gsxTurnaround.clear();
    // the 2026-10-06 recording: L:FSDT_GSX_BOARDING_STATE 5 -> 6 at the end of the boarding, 1 again 14 s later
    gsxTurnaround.update({ states: { Boarding: 5 }, departureState: 1, enginesRunning: false });
    gsxTurnaround.update({ states: { Boarding: 6 }, departureState: 1, enginesRunning: false });
    gsxTurnaround.update({ states: { Boarding: 1 }, departureState: 1, enginesRunning: false });
    const reset = [step('Catering', 'Catering', 'completed', false), step('Boarding', 'Board', 'available', true)];

    // the page rendered, left (Payload) and rendered again: the memory lives outside the page
    expect(turnaroundChips(reset).Board).toBeNull();
    expect(turnaroundChips(reset).Board).toBeNull();
    gsxTurnaround.clear();
  });

  it('offers Request again in the next turnaround', () => {
    gsxTurnaround.clear();
    expect(turnaroundChips([step('Boarding', 'Board', 'available', true)]).Board).toBe('Request');
  });
});

/** The turnaround rows (name, status line, action chip) of the panel, in their order */
const turnaroundRows = (services: GsxService[]): { name: string; status: string; chip: string | null }[] => {
  const gsx = withTurnaroundMemory({
    connected: true,
    gsxRunning: true,
    services,
    menuShown: false,
    menu: { title: '', entries: [], disabled: [] },
    message: { text: '', visible: false },
  });
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<GsxServicesPanel linked onLinkChange={() => {}} gsx={gsx} />);
  return Array.from(container.querySelectorAll('span.text-base.font-semibold')).map((name) => ({
    name: name.textContent ?? '',
    status: name.nextElementSibling?.textContent ?? '',
    chip: name.parentElement?.parentElement?.querySelector('button')?.textContent ?? null,
  }));
};

describe('GSX baggage step of the Services page', () => {
  const departure = [
    step('Catering', 'Catering', 'available', true),
    step('Boarding', 'Board', 'performing', false),
    step('Departure', 'Pushback', 'available', true),
  ];

  it('lists the baggage after the boarding, without a Request chip (GSX loads it with the boarding)', () => {
    gsxTurnaround.clear();
    const rows = turnaroundRows(departure);

    expect(rows.map((r) => r.name)).toEqual(['Catering', 'Board', 'Baggage', 'Pushback']);
    expect(rows[2]).toEqual({ name: 'Baggage', status: 'BaggageWithBoarding', chip: null });
  });

  it('keeps the baggage Done until the turnaround ends, like the boarding', () => {
    gsxTurnaround.clear();
    const cargo = (active: boolean, percent: number) => ({ BaggageLoading: { active, percent } });
    gsxTurnaround.update({
      states: { Boarding: 5 },
      departureState: 1,
      enginesRunning: false,
      baggage: cargo(true, 60),
    });
    gsxTurnaround.update({
      states: { Boarding: 5 },
      departureState: 1,
      enginesRunning: false,
      baggage: cargo(false, 100),
    });

    expect(turnaroundRows(departure)[2]).toEqual({ name: 'Baggage', status: 'Done', chip: null });

    gsxTurnaround.update({
      states: { Boarding: 1 },
      departureState: 1,
      enginesRunning: true,
      baggage: cargo(false, 100),
    });
    expect(turnaroundRows(departure)[2].status).toBe('BaggageWithBoarding');
  });

  it('has no baggage row while GSX does not offer the boarding here', () => {
    gsxTurnaround.clear();
    const rows = turnaroundRows([step('Catering', 'Catering', 'available', true)]);

    expect(rows.map((r) => r.name)).toEqual(['Catering']);
  });
});
