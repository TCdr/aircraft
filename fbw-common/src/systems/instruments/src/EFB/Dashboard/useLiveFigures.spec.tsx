// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatWeightValue } from './logic/dashboardFormat';
import { installFakeSimVars } from './fakeSimVars';
import { LiveFigures, useLiveFigures } from './useLiveFigures';

// The hook's sim and flyPad dependencies (vi.mock is hoisted above the imports)
const fake = vi.hoisted(() => ({
  state: { config: { airframeInfo: { variant: 'A320_251N' } } },
  units: { usingMetric: true },
}));
vi.mock('@flybywiresim/fbw-sdk-react', () => ({
  AirframeType: { A380_842: 'A380_842' },
  Units: fake.units,
  NXDataStore: { getLegacy: () => '' },
  usePersistentProperty: () => ['', () => {}],
  useSimVar: () => [0, () => {}],
}));
vi.mock('@flybywiresim/flypad', () => ({
  useAppSelector: (select: (state: typeof fake.state) => unknown) => select(fake.state),
}));

describe('useLiveFigures', () => {
  let container: HTMLDivElement;
  let renderCount: number;
  let simVars: Record<string, number>;
  let latest: LiveFigures;
  let byNameReads: () => number;

  const Probe = () => {
    renderCount++;
    latest = useLiveFigures();
    return null;
  };

  const renderProbe = () => {
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

  const setEngineFlows = (kgPerHour: number) => {
    simVars['L:A32NX_ENGINE_FF:1'] = kgPerHour / 2;
    simVars['L:A32NX_ENGINE_FF:2'] = kgPerHour / 2;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    simVars = {
      'INDICATED ALTITUDE': 1000,
      'GROUND VELOCITY': 12,
      'AIRSPEED MACH': 0.56,
      'L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC': 25,
      'FUEL WEIGHT PER GALLON': 3,
      'FUEL TANK CENTER QUANTITY': 100,
    };
    setEngineFlows(1000);
    renderCount = 0;
    fake.units.usingMetric = true;
    fake.state.config.airframeInfo.variant = 'A320_251N';
    ({ byNameReads } = installFakeSimVars(simVars));
    container = document.createElement('div');
    document.body.appendChild(container);
    renderProbe();
  });

  afterEach(() => {
    unmountComponentAtNode(container);
    container.remove();
    vi.useRealTimers();
  });

  it('does not render while the values move by less than what the page shows', () => {
    const rendersAfterMount = renderCount;

    // Within the whole feet, whole knots, hundredths of Mach, tenth of a percent and ten kilograms per hour
    const jitter = [0.3, -0.2, 0.4, -0.4, 0.1];
    jitter.forEach((offset) => {
      simVars['INDICATED ALTITUDE'] = 1000 + offset;
      simVars['GROUND VELOCITY'] = 12 + offset;
      simVars['AIRSPEED MACH'] = 0.56 + offset / 100;
      simVars['L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC'] = 25 + offset / 10;
      setEngineFlows(1000 + offset * 10);
      pollTicks(1);
    });

    expect(renderCount).toBe(rendersAfterMount);
    expect(latest.altitudeFt).toBe(1000);
    expect(byNameReads()).toBe(0);
  });

  it('renders once when a shown digit changes', () => {
    const rendersAfterMount = renderCount;

    simVars['INDICATED ALTITUDE'] = 1001;
    pollTicks(1);

    expect(renderCount).toBe(rendersAfterMount + 1);
    expect(latest.altitudeFt).toBe(1001);
  });

  it('renders once when many values change in the same poll', () => {
    const rendersAfterMount = renderCount;

    simVars['INDICATED ALTITUDE'] = 1500;
    simVars['GROUND VELOCITY'] = 80;
    simVars['AIRSPEED MACH'] = 0.7;
    simVars['L:A32NX_AIRFRAME_GW'] = 60_000;
    simVars['L:A32NX_AIRFRAME_ZFW'] = 50_000;
    simVars['FUEL TANK CENTER QUANTITY'] = 90;
    simVars['FUEL TANK LEFT MAIN QUANTITY'] = 40;
    setEngineFlows(2400);
    pollTicks(1);

    expect(renderCount).toBe(rendersAfterMount + 1);
    expect(latest.groundSpeedKt).toBe(80);
    expect(latest.fobKg).toBe(390);
    expect(latest.fuelFlowKgPerHour).toBe(2400);
  });

  it('shows the fuel flow of an imperial user in whole tens of pounds', () => {
    fake.units.usingMetric = false;
    renderProbe();

    setEngineFlows(2344);
    pollTicks(1);

    // 2,344 kg/h is 5,167 lb/h
    expect(formatWeightValue(latest.fuelFlowKgPerHour, false)).toBe('5,170');
  });

  it('reads the fuel flow again at once when the weight unit changes', () => {
    setEngineFlows(2344);
    pollTicks(1);
    expect(formatWeightValue(latest.fuelFlowKgPerHour, true)).toBe('2,340');

    fake.units.usingMetric = false;
    renderProbe();

    expect(formatWeightValue(latest.fuelFlowKgPerHour, false)).toBe('5,170');
  });

  it('takes the A380X fuel on board from the systems total', () => {
    fake.state.config.airframeInfo.variant = 'A380_842';
    renderProbe();

    simVars['L:A32NX_TOTAL_FUEL_QUANTITY'] = 123_456;
    pollTicks(1);

    expect(latest.fobKg).toBe(123_456);
  });

  it('renders once when the clocks advance together', () => {
    const rendersAfterMount = renderCount;

    simVars['E:ABSOLUTE TIME'] = 62_135_596_800 + 100;
    simVars['E:LOCAL TIME'] = 3_600;
    simVars['E:ZULU TIME'] = 0;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(renderCount).toBe(rendersAfterMount + 1);
    expect(latest.nowUnixSeconds).toBe(100);
    expect(latest.localSecondsOfDay).toBe(3_600);
  });
});
