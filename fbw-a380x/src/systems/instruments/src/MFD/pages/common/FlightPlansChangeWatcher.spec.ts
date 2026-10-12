// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanInterface } from '@fmgc/flightplanning/FlightPlanInterface';
import { createFlightPlansChangeDetector } from './FlightPlansChangeWatcher';

/** A flight plan interface holding plan versions only */
const plans = (versions: Map<number, number>) =>
  ({
    has: (index: number) => versions.has(index),
    get: (index: number) => ({ version: versions.get(index) }),
  }) as unknown as FlightPlanInterface;

describe('flight plans change detector (DATA / POSITION pages on FmsPage)', () => {
  it('reports the first check as a change, then nothing while no plan changes', () => {
    const versions = new Map([[FlightPlanIndex.Active, 3]]);
    const changed = createFlightPlansChangeDetector(plans(versions));
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
  });

  it('reports a modified plan (its version changes)', () => {
    const versions = new Map([[FlightPlanIndex.Active, 3]]);
    const changed = createFlightPlansChangeDetector(plans(versions));
    changed();
    versions.set(FlightPlanIndex.Active, 4);
    expect(changed()).toBe(true);
  });

  it('reports a created or deleted secondary or temporary plan', () => {
    const versions = new Map([[FlightPlanIndex.Active, 3]]);
    const changed = createFlightPlansChangeDetector(plans(versions));
    changed();
    versions.set(FlightPlanIndex.FirstSecondary + 2, 0);
    expect(changed()).toBe(true);
    versions.delete(FlightPlanIndex.FirstSecondary + 2);
    expect(changed()).toBe(true);
    versions.set(FlightPlanIndex.Temporary, 1);
    expect(changed()).toBe(true);
  });
});
