// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeSimVars } from './fakeSimVars';
import { useAircraftState } from './useAircraftState';
import { usePayloadLoad } from './useServiceStatus';

// The hooks' sim and flyPad dependencies (vi.mock is hoisted above the imports)
const fake = vi.hoisted(() => {
  const state = {
    simbrief: { fuelImported: false, payloadImported: false },
    config: {
      airframeInfo: { variant: 'A320_251N' },
      cabinInfo: { seatMap: [{ simVar: 'SEATS', capacity: 10 }], cargoMap: [{ simVar: 'CARGO' }] },
    },
  };
  return { state };
});
vi.mock('@flybywiresim/fbw-sdk-react', () => ({
  AirframeType: { A380_842: 'A380_842' },
  GsxServiceStates: { ACTIVE: 5 },
  // The seat flags of the fake stations are just the number of filled seats
  SeatFlags: class {
    constructor(private readonly filledSeats: number) {}

    getTotalFilledSeats() {
      return this.filledSeats;
    }
  },
  NXDataStore: { getLegacy: () => '' },
  usePersistentNumberProperty: () => [0, () => {}],
  usePersistentProperty: () => ['REAL', () => {}],
  useSimVar: () => [0, () => {}],
}));
vi.mock('@flybywiresim/flypad', () => ({
  useAppSelector: (select: (state: typeof fake.state) => unknown) => select(fake.state),
  isSimbriefDataLoaded: () => false,
}));
vi.mock('./useDashboardPhase', () => ({ useOfpKey: () => '' }));

describe('dashboard polls', () => {
  let container: HTMLDivElement;
  let renderCount: number;
  let simVars: Record<string, number>;
  let byNameReads: () => number;
  let latest: unknown;

  const mount = (Probe: () => null) => {
    act(() => {
      render(<Probe />, container);
    });
  };

  const pollTicks = (ticks: number) => {
    for (let tick = 0; tick < ticks; tick++) {
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    simVars = {};
    renderCount = 0;
    ({ byNameReads } = installFakeSimVars(simVars));
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    unmountComponentAtNode(container);
    container.remove();
    vi.useRealTimers();
  });

  describe('useAircraftState', () => {
    const Probe = () => {
      renderCount++;
      latest = useAircraftState();
      return null;
    };

    it('does not render again while the doors and power are unchanged', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      pollTicks(5);

      expect(renderCount).toBe(rendersAfterMount);
      expect(byNameReads()).toBe(0);
    });

    it('renders when a door opens', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      simVars['A:INTERACTIVE POINT OPEN:0'] = 0.5;
      pollTicks(1);

      expect(renderCount).toBeGreaterThan(rendersAfterMount);
      expect((latest as { openDoors: string[] }).openDoors).toEqual(['1L']);
    });

    it('renders when the external power becomes available', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      simVars['L:A32NX_EXT_PWR_AVAIL:1'] = 1;
      pollTicks(1);

      expect(renderCount).toBeGreaterThan(rendersAfterMount);
      expect((latest as { extPwrAvailable: number }).extPwrAvailable).toBe(1);
    });
  });

  describe('usePayloadLoad', () => {
    const Probe = () => {
      renderCount++;
      latest = usePayloadLoad();
      return null;
    };

    it('does not render again while the passengers, cargo and doors are unchanged', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      pollTicks(5);

      expect(renderCount).toBe(rendersAfterMount);
    });

    it('renders when a passenger boards', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      simVars['L:SEATS'] = 3;
      pollTicks(1);

      expect(renderCount).toBeGreaterThan(rendersAfterMount);
      expect((latest as { paxOnBoard: number }).paxOnBoard).toBe(3);
    });

    it('renders when cargo is loaded', () => {
      mount(Probe);
      const rendersAfterMount = renderCount;

      simVars['L:CARGO'] = 120;
      pollTicks(1);

      expect(renderCount).toBeGreaterThan(rendersAfterMount);
      expect((latest as { cargoKg: number }).cargoKg).toBe(120);
    });
  });
});
