// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GsxService, gsxRefuelProgress, gsxRequestable, gsxTurnaroundAction } from './GsxRemote';

const service = (state: string, canTrigger?: boolean): GsxService =>
  ({ id: 'Catering', displayName: 'Catering', state, canTrigger }) as GsxService;

describe('GSX turnaround step action', () => {
  it('offers no Request on a completed service GSX does not let be triggered', () => {
    expect(gsxTurnaroundAction(service('completed', false))).toBeNull();
  });

  it('offers Request whenever GSX lets the service be triggered, a completed one included', () => {
    expect(gsxTurnaroundAction(service('available', true))).toBe('request');
    expect(gsxTurnaroundAction(service('completed', true))).toBe('request');
  });

  it('offers nothing on an available service GSX does not let be triggered now', () => {
    expect(gsxTurnaroundAction(service('available', false))).toBeNull();
  });

  it('falls back on the state without canTrigger', () => {
    expect(gsxTurnaroundAction(service('available'))).toBe('request');
    expect(gsxTurnaroundAction(service('completed'))).toBeNull();
  });

  it('offers Stop on a running service GSX lets be triggered, nothing while requested or leaving', () => {
    expect(gsxTurnaroundAction(service('performing', true))).toBe('stop');
    expect(gsxTurnaroundAction(service('performing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('requested', false))).toBeNull();
    expect(gsxTurnaroundAction(service('completing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('unavailable', false))).toBeNull();
  });
});

describe('GSX-linked Services buttons', () => {
  it('may offer Request only when GSX lets the service be triggered, or does not list it', () => {
    expect(gsxRequestable(service('completed', false))).toBe(false);
    expect(gsxRequestable(service('completed', true))).toBe(true);
    expect(gsxRequestable(service('available', true))).toBe(true);
    expect(gsxRequestable(service('unavailable', false))).toBe(false);
    expect(gsxRequestable(undefined)).toBe(true);
  });
});

/**
 * The GSX refuelling of an A380X with the flyPad fuel sync on, as GSX reported it: the flyPad pumps the fuel and GSX,
 * which does not know the flyPad target, keeps its own target just above what was pumped
 */
const refuelling = (aircraftTotalLb: number, state = 'performing'): GsxService =>
  ({
    id: 'Refueling',
    displayName: 'Refuel',
    state,
    canTrigger: false,
    detail: {
      fuel: {
        current: aircraftTotalLb - 54887,
        target: aircraftTotalLb - 54877,
        unit: 'lb',
        startTotal: 54887,
        aircraftTotal: aircraftTotalLb,
      },
    },
    progressText: '100%',
  }) as GsxService;

const LB_TO_KG = 0.45359237;

describe('GSX refuelling progress against the flyPad fuel target', () => {
  it('starts at 0 when the refuelling starts, not at the 100 % GSX reports', () => {
    expect(gsxRefuelProgress(refuelling(54887), 156700)).toBeCloseTo(0);
  });

  it('is the part of the fuel to load that the aircraft received', () => {
    const startKg = 54887 * LB_TO_KG;
    const progress = gsxRefuelProgress(refuelling(89123), 156700);
    expect(progress).toBeCloseTo((89123 * LB_TO_KG - startKg) / (156700 - startKg));
    expect(progress).toBeLessThan(0.2);
  });

  it('takes a GSX fuel quantity in kg as it is', () => {
    const service = refuelling(0);
    service.detail = { fuel: { current: 500, target: 510, unit: 'kg', startTotal: 1000, aircraftTotal: 1500 } };
    expect(gsxRefuelProgress(service, 3000)).toBeCloseTo(0.25);
  });

  it('is full once the target is reached, never above', () => {
    expect(gsxRefuelProgress(refuelling(156700 / LB_TO_KG + 50), 156700)).toBe(1);
  });

  it('has none outside the refuelling, without the GSX fuel detail, or with nothing to load', () => {
    expect(gsxRefuelProgress(refuelling(60000, 'completed'), 156700)).toBeNull();
    expect(gsxRefuelProgress({ ...refuelling(60000), detail: undefined }, 156700)).toBeNull();
    expect(gsxRefuelProgress(refuelling(60000), 54887 * LB_TO_KG)).toBeNull();
    expect(gsxRefuelProgress(undefined, 156700)).toBeNull();
  });
});
