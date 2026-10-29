// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  altnUpdateCell,
  flightPlanPrintText,
  buildFlightPlan,
  durationText,
  fuelUpdateCell,
  loadUpdateCell,
  parseWeight,
  signedText,
  weightText,
} from './FlightFolderFlightPlan';
import { testOfp } from './FlightFolderTestOfp';

describe('flight plan from the OFP', () => {
  it('takes the header, the route and the cruise data', () => {
    const plan = buildFlightPlan(testOfp());
    expect(plan.flightNumber).toBe('AIB406');
    expect(plan.companyRoute).toBe('NRTTLS');
    expect(plan.route).toBe('RJAA DCT ABC UL1 XYZ DCT LFBO');
    expect(plan.cruiseFlightLevel).toBe(350);
    expect(plan.costIndex).toBe(30);
    expect(plan.groundNm).toBe(485);
    expect(plan.airNm).toBe(490);
    expect(plan.sid).toBe('SID1A');
    expect(plan.planNumber).toBe('9387');
    expect(plan.generatedMs).toBe(1222150000 * 1000);
    // ISA at FL350 is -54.3 deg C
    expect(plan.cruiseTempC).toBe(-50);
  });

  it('keeps the weights in kg whatever the OFP units are', () => {
    const kg = buildFlightPlan(testOfp());
    expect(kg.load.zfw).toBe(352000);
    const lbs = buildFlightPlan(testOfp({ units: 'lbs' }));
    expect(lbs.load.zfw).toBeCloseTo(352000 * 0.45359237, 3);
    expect(lbs.fuel.trip.estimateKg).toBeCloseTo(14100 * 0.45359237, 3);
  });

  it('leaves what the OFP lacks blank: no ADDNL fuel, no OEW falls back to ZFW less payload', () => {
    const plan = buildFlightPlan(testOfp({ weights: { payload: 52000, estZeroFuelWeight: 352000 } }));
    expect(plan.fuel.addnl.estimateKg).toBeNull();
    expect(plan.fuel.etops.estimateKg).toBeNull();
    expect(plan.fuel.xtr.estimateKg).toBeNull();
    expect(plan.load.dow).toBe(300000);
  });

  it('lists the alternates, the first one with its figures and the others with the airport only', () => {
    const rows = buildFlightPlan(testOfp()).altnRows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      icao: 'LFPG',
      airNm: 101,
      groundNm: 99,
      flightLevel: 250,
      timeS: 1320,
      fuelKg: 5400,
    });
    expect(rows[1]).toEqual({
      icao: 'LFMN',
      airNm: null,
      groundNm: null,
      flightLevel: null,
      timeS: null,
      fuelKg: null,
    });
  });

  it('lays out the navigation log with the times, the fuel and a MORA in hundreds of feet', () => {
    const log = buildFlightPlan(testOfp()).navLog;
    expect(log.map((row) => row.ident)).toEqual(['RJAA', 'ABC', 'XYZ']);
    expect(log[1].moraHundredFeet).toBe(33);
    expect(log[2].moraHundredFeet).toBe(41);
    expect(log[2].cumS).toBe(2400);
    expect(log[2].etaMs).toBe((1222158000 + 2400) * 1000);
    expect(log[1].efobKg).toBe(24000);
    expect(log[1].efuKg).toBe(1300);
  });

  it('has no navigation log for a direct route', () => {
    expect(buildFlightPlan(testOfp({ navlog: undefined })).navLog).toEqual([]);
  });
});

describe('Update column', () => {
  it('shows nothing until the crew enters something', () => {
    const plan = buildFlightPlan(testOfp());
    expect(fuelUpdateCell(plan, 'tof')).toEqual({ kg: null, source: null });
    expect(loadUpdateCell(plan, 'tow')).toEqual({ kg: null, source: null });
  });

  it('adds the take-off fuel from the entries, a line without entry counting with its estimate', () => {
    const plan = buildFlightPlan(testOfp());
    plan.updates.fuel.trip = 14400;
    plan.updates.fuel.addnl = 1000;
    // trip 14400 + contingency 700 + etops 0 + alternate 5400 + final 5200 + additional 1000 + extra 0
    expect(fuelUpdateCell(plan, 'tof')).toEqual({ kg: 26700, source: 'computed' });
    plan.updates.fuel.tof = 30000;
    expect(fuelUpdateCell(plan, 'tof')).toEqual({ kg: 30000, source: 'crew' });
  });

  it('follows the entries through the weights: ZFW, TOW, EBO and LW', () => {
    const plan = buildFlightPlan(testOfp());
    plan.updates.load.pld = 50000;
    expect(loadUpdateCell(plan, 'zfw')).toEqual({ kg: 350000, source: 'computed' });
    plan.updates.fuel.trip = 14400;
    expect(loadUpdateCell(plan, 'ebo')).toEqual({ kg: 14400, source: 'computed' });
    // take-off fuel 14400 + 700 + 5400 + 5200 = 25700
    expect(loadUpdateCell(plan, 'tow')).toEqual({ kg: 375700, source: 'computed' });
    expect(loadUpdateCell(plan, 'lw')).toEqual({ kg: 361300, source: 'computed' });
    plan.updates.load.lw = 363000;
    expect(loadUpdateCell(plan, 'lw')).toEqual({ kg: 363000, source: 'crew' });
  });

  it('keeps the alternate fuel entry of each row', () => {
    const plan = buildFlightPlan(testOfp());
    plan.updates.altnFuel[1] = 4000;
    expect(altnUpdateCell(plan, 0).source).toBeNull();
    expect(altnUpdateCell(plan, 1)).toEqual({ kg: 4000, source: 'crew' });
  });
});

describe('texts', () => {
  it('shows tonnes or thousands of pounds with one decimal', () => {
    expect(weightText(14100, true)).toBe('14.1');
    expect(weightText(14100, false)).toBe('31.1');
    expect(weightText(null, true)).toBe('');
  });

  it('reads a typed weight in the unit shown', () => {
    expect(parseWeight('14.4', true)).toBe(14400);
    expect(parseWeight('31.8', false)).toBeCloseTo(31800 * 0.45359237, 3);
    expect(parseWeight('abc', true)).toBeNull();
    expect(parseWeight('', true)).toBeNull();
  });

  it('writes durations as HH:MM and signed values with M and P', () => {
    expect(durationText(4380)).toBe('01:13');
    expect(durationText(null)).toBe('');
    expect(signedText(-49)).toBe('M049');
    expect(signedText(4)).toBe('P004');
  });
});

describe('printed flight plan', () => {
  it('holds the header, the fuel and load lines with the Update, and the navigation log', () => {
    const plan = buildFlightPlan(testOfp());
    plan.updates.fuel.trip = 14400;
    const text = flightPlanPrintText(plan, true);
    expect(text.split('\n')[0]).toBe('FLIGHT PLAN AIB406  RJAA-LFBO  ALTN LFPG');
    expect(text).toMatch(/TRIP\s+14\.1\s+14\.4\s+01:13/);
    expect(text).toContain('XYZ');
    expect(text).not.toContain('ADDNL');
  });
});
