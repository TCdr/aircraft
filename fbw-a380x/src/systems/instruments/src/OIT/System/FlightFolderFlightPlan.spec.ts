// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  altnUpdateCell,
  checkNavLogRow,
  deleteInsertedWaypoint,
  flightPlanPrintText,
  buildFlightPlan,
  clockText,
  durationText,
  flightPlanTabs,
  fuelUpdateCell,
  lastFlownLineIndex,
  loadUpdateCell,
  navLogLines,
  nearbyTimeMs,
  parseClockTime,
  parseWeight,
  setNavLogActual,
  setNextWaypoint,
  signedText,
  weightText,
} from './FlightFolderFlightPlan';
import { testFollowUpOfp, testOfp } from './FlightFolderTestOfp';

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

describe('tabs of the flight plan', () => {
  it('has a NAV LOG page for each fourteen rows and the FLT REPORT last', () => {
    expect(flightPlanTabs(0)).toEqual(['FMS INIT', 'FLT INFO', 'ALTN', 'NAV LOG 1', 'FLT REPORT']);
    expect(flightPlanTabs(14).slice(3, -1)).toEqual(['NAV LOG 1']);
    expect(flightPlanTabs(15).slice(3, -1)).toEqual(['NAV LOG 1', 'NAV LOG 2']);
    expect(flightPlanTabs(130).slice(3, -1)).toHaveLength(10);
    expect(flightPlanTabs(130).slice(-1)).toEqual(['FLT REPORT']);
  });

  it('counts the waypoints the crew inserted: the last one may start a page', () => {
    const p = buildFlightPlan(testOfp({ navlog: testFollowUpOfp().navlog }));
    expect(flightPlanTabs(navLogLines(p).length).filter((t) => t.startsWith('NAV LOG'))).toHaveLength(1);
    for (let i = 0; i < 9; i++) {
      setNextWaypoint(p, 'W1', `WP${i}A`);
    }
    expect(navLogLines(p)).toHaveLength(15);
    expect(flightPlanTabs(navLogLines(p).length).filter((t) => t.startsWith('NAV LOG'))).toHaveLength(2);
  });
});

describe('time typed in the navigation log', () => {
  const p = buildFlightPlan(testFollowUpOfp());
  const baseMs = 1222158000 * 1000;

  it('is read near the last actual time before the row', () => {
    const q = buildFlightPlan(testFollowUpOfp());
    setNavLogActual(q, 'W1', { ataMs: baseMs + 100_000 });
    const lines = navLogLines(q);
    expect(nearbyTimeMs(lines, 3, baseMs)).toBe(baseMs + 100_000);
    expect(nearbyTimeMs(lines, 1, baseMs)).toBe(baseMs + 100_000);
  });

  it('is read near the planned time of the row before anything was flown', () => {
    expect(nearbyTimeMs(navLogLines(p), 2, baseMs)).toBe(baseMs + 1200 * 1000);
  });

  it('is read near the start of the plan for a row without a planned time', () => {
    const q = buildFlightPlan(testFollowUpOfp());
    setNextWaypoint(q, 'W1', 'WPT3');
    expect(nearbyTimeMs(navLogLines(q), 2, baseMs)).toBe(baseMs);
  });
});

describe('clock times of the navigation log', () => {
  it('writes a time as UTC HH:MM, nothing for none', () => {
    expect(clockText(Date.UTC(2008, 8, 23, 7, 5))).toBe('07:05');
    expect(clockText(null)).toBe('');
  });

  it('reads HHMM and HH:MM on the day of the reference', () => {
    const reference = Date.UTC(2008, 8, 23, 7, 0);
    expect(parseClockTime('0745', reference)).toBe(Date.UTC(2008, 8, 23, 7, 45));
    expect(parseClockTime('07:45', reference)).toBe(Date.UTC(2008, 8, 23, 7, 45));
  });

  it('takes the day nearest to the reference when the flight crosses midnight', () => {
    expect(parseClockTime('0010', Date.UTC(2008, 8, 23, 23, 50))).toBe(Date.UTC(2008, 8, 24, 0, 10));
    expect(parseClockTime('2350', Date.UTC(2008, 8, 24, 0, 10))).toBe(Date.UTC(2008, 8, 23, 23, 50));
  });

  it('rejects what is not a time', () => {
    expect(parseClockTime('2460', 0)).toBeNull();
    expect(parseClockTime('7:45', 0)).toBeNull();
    expect(parseClockTime('abcd', 0)).toBeNull();
    expect(parseClockTime('', 0)).toBeNull();
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

  it('prints the actual values and the waypoints the crew inserted in the navigation log', () => {
    const plan = buildFlightPlan(testFollowUpOfp());
    setNavLogActual(plan, 'W1', { ataMs: Date.UTC(2008, 8, 23, 12, 34), afobKg: 24_100, afuKg: 900 });
    setNextWaypoint(plan, 'W1', 'WPT3');
    const text = flightPlanPrintText(plan, true);
    expect(text).toMatch(/ABC\s+UL1\s+40\s+00:10\s+00:10\s+24\.0\s+1\.0\s+12:34\s+24\.1\s+0\.9/);
    expect(text).toMatch(/WPT3/);
  });
});

describe('navigation log lines', () => {
  const baseMs = 1222158000 * 1000;
  const plan = () => buildFlightPlan(testFollowUpOfp());
  const line = (p: ReturnType<typeof plan>, ident: string) => navLogLines(p).find((l) => l.ident === ident)!;

  it('shows the OFP before any flight follow-up: planned times, no actuals, nothing pending', () => {
    const lines = navLogLines(plan());
    expect(lines.map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'DEF', 'GHI', 'JKL', 'LFBO']);
    expect(lines[2]).toMatchObject({
      etaMs: baseMs + 1200 * 1000,
      ataMs: null,
      atS: null,
      retaMs: null,
      afobKg: null,
      deltaFobKg: null,
      pending: false,
      fuelCheckShown: false,
      skipped: false,
      inserted: false,
    });
  });

  it('plans the times from the take-off once the origin has its actual time', () => {
    const p = plan();
    expect(setNavLogActual(p, 'W0', { ataMs: baseMs + 120_000 })).toBe(true);
    expect(line(p, 'RJAA').ataMs).toBe(baseMs + 120_000);
    expect(line(p, 'DEF').etaMs).toBe(baseMs + 120_000 + 1200 * 1000);
    // the origin has no fuel check and is never framed as a flown waypoint to validate
    expect(line(p, 'RJAA')).toMatchObject({ pending: false, fuelCheckShown: false });
  });

  it('derives AT, the fuel differences and the revised ETA from the actuals', () => {
    const p = plan();
    setNavLogActual(p, 'W0', { ataMs: baseMs });
    setNavLogActual(p, 'W1', { ataMs: baseMs + 660_000, afobKg: 23_800, afuKg: 1_200 });
    const abc = line(p, 'ABC');
    // flown after 11 minutes against 10 planned
    expect(abc.atS).toBe(660);
    expect(abc.deltaFobKg).toBe(23_800 - 24_000);
    expect(abc.deltaFuelKg).toBe(1_200 - 1_000);
    expect(abc.pending).toBe(true);
    expect(abc.fuelCheckShown).toBe(true);
    // not flown yet: the revised ETA is the last actual time plus what the plan still needs
    expect(line(p, 'DEF').retaMs).toBe(baseMs + 660_000 + 600 * 1000);
    expect(line(p, 'LFBO').retaMs).toBe(baseMs + 660_000 + 2400 * 1000);
    // the planned time stays what the OFP says
    expect(line(p, 'DEF').etaMs).toBe(baseMs + 1200 * 1000);
    // the waypoint just flown shows its own time until the crew checked it
    expect(abc.retaMs).toBe(baseMs + 660_000);
    expect(line(p, 'RJAA').retaMs).toBeNull();
  });

  it('measures AT from the previous flown waypoint, also when waypoints were skipped', () => {
    const p = plan();
    setNavLogActual(p, 'W1', { ataMs: baseMs + 600_000 });
    setNavLogActual(p, 'W3', { ataMs: baseMs + 1_900_000 });
    expect(line(p, 'GHI').atS).toBe(1300);
  });

  it('keeps no difference where the actual value is missing', () => {
    const p = plan();
    setNavLogActual(p, 'W1', { ataMs: baseMs + 600_000, afobKg: 24_000 });
    expect(line(p, 'ABC').deltaFobKg).toBe(0);
    expect(line(p, 'ABC').deltaFuelKg).toBeNull();
  });

  it('removes an actual again: a row without any value is not flown', () => {
    const p = plan();
    setNavLogActual(p, 'W2', { ataMs: baseMs });
    setNavLogActual(p, 'W2', { ataMs: null });
    expect(line(p, 'DEF').pending).toBe(false);
    expect(p.followUp.actuals.W2).toBeUndefined();
  });

  it('finds the last waypoint flown, the one FLOWN WPT shows', () => {
    const p = plan();
    expect(lastFlownLineIndex(navLogLines(p))).toBe(-1);
    setNavLogActual(p, 'W1', { ataMs: baseMs });
    setNavLogActual(p, 'W3', { ataMs: baseMs });
    expect(lastFlownLineIndex(navLogLines(p))).toBe(3);
    setNextWaypoint(p, 'W1', 'WPT3');
    // the inserted waypoint shifts the row of GHI by one
    expect(lastFlownLineIndex(navLogLines(p))).toBe(4);
  });

  describe('NEXT WPT', () => {
    it('inside the flight plan: the waypoints in between are skipped and the next one shows in DIRTO', () => {
      const p = plan();
      expect(setNextWaypoint(p, 'W1', 'jkl')).toBe('in-plan');
      const lines = navLogLines(p);
      expect(lines).toHaveLength(6);
      expect(lines.find((l) => l.ident === 'ABC')!.directTo).toBe('JKL');
      expect(lines.filter((l) => l.skipped).map((l) => l.ident)).toEqual(['DEF', 'GHI']);
      expect(lines.filter((l) => l.inserted)).toHaveLength(0);
    });

    it('leaves a waypoint that was already flown as it is', () => {
      const p = plan();
      setNavLogActual(p, 'W2', { ataMs: baseMs + 1_200_000 });
      setNextWaypoint(p, 'W1', 'JKL');
      expect(
        navLogLines(p)
          .filter((l) => l.skipped)
          .map((l) => l.ident),
      ).toEqual(['GHI']);
    });

    it('a second NEXT WPT from the same waypoint replaces the first', () => {
      const p = plan();
      setNextWaypoint(p, 'W1', 'JKL');
      setNextWaypoint(p, 'W1', 'DEF');
      expect(navLogLines(p).filter((l) => l.skipped)).toHaveLength(0);
      expect(line(p, 'ABC').directTo).toBe('DEF');
    });

    it('outside the flight plan: the waypoint is inserted just after the initial one', () => {
      const p = plan();
      expect(setNextWaypoint(p, 'W2', 'wpt3')).toBe('inserted');
      const lines = navLogLines(p);
      expect(lines.map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'DEF', 'WPT3', 'GHI', 'JKL', 'LFBO']);
      expect(lines[3]).toMatchObject({ inserted: true, skipped: false, etaMs: null, efobKg: null, directTo: null });
      expect(lines[2].directTo).toBeNull();
    });

    it('a waypoint inserted again after the same one comes before the first insertion', () => {
      const p = plan();
      setNextWaypoint(p, 'W2', 'AAA');
      setNextWaypoint(p, 'W2', 'BBB');
      expect(navLogLines(p).map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'DEF', 'BBB', 'AAA', 'GHI', 'JKL', 'LFBO']);
    });

    it('takes a name only of two to seven letters or digits', () => {
      const p = plan();
      expect(setNextWaypoint(p, 'W2', 'A')).toBe('rejected');
      expect(setNextWaypoint(p, 'W2', 'TOO LONG1')).toBe('rejected');
      expect(setNextWaypoint(p, 'W2', '  ')).toBe('rejected');
      expect(setNextWaypoint(p, 'nowhere', 'ABC')).toBe('rejected');
      expect(navLogLines(p)).toHaveLength(6);
    });

    it('a rejected entry keeps the earlier NEXT WPT of the waypoint', () => {
      const p = plan();
      setNextWaypoint(p, 'W1', 'JKL');
      setNextWaypoint(p, 'W1', '!!');
      expect(line(p, 'ABC').directTo).toBe('JKL');
    });
  });

  describe('DELETE', () => {
    it('removes a waypoint the crew inserted', () => {
      const p = plan();
      setNextWaypoint(p, 'W2', 'WPT3');
      expect(deleteInsertedWaypoint(p, 'I1')).toBe(true);
      expect(navLogLines(p).map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'DEF', 'GHI', 'JKL', 'LFBO']);
    });

    it('never removes a waypoint of the OFP', () => {
      const p = plan();
      expect(deleteInsertedWaypoint(p, 'W2')).toBe(false);
      expect(navLogLines(p)).toHaveLength(6);
    });

    it('keeps the waypoints inserted after the deleted one', () => {
      const p = plan();
      setNextWaypoint(p, 'W1', 'WPT3');
      setNextWaypoint(p, 'I1', 'XXX');
      expect(navLogLines(p).map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'WPT3', 'XXX', 'DEF', 'GHI', 'JKL', 'LFBO']);
      deleteInsertedWaypoint(p, 'I1');
      expect(navLogLines(p).map((l) => l.ident)).toEqual(['RJAA', 'ABC', 'XXX', 'DEF', 'GHI', 'JKL', 'LFBO']);
    });

    it('forgets the NEXT WPT that pointed at the deleted waypoint, so the skipped ones come back', () => {
      const p = plan();
      setNextWaypoint(p, 'W1', 'WPT3');
      setNextWaypoint(p, 'I1', 'JKL');
      expect(
        navLogLines(p)
          .filter((l) => l.skipped)
          .map((l) => l.ident),
      ).toEqual(['DEF', 'GHI']);
      deleteInsertedWaypoint(p, 'I1');
      expect(navLogLines(p).filter((l) => l.skipped)).toHaveLength(0);
      expect(line(p, 'ABC').directTo).toBeNull();
    });
  });

  describe('FUEL CHK', () => {
    it('saves a flown waypoint: it is no longer pending and takes no more entries', () => {
      const p = plan();
      setNavLogActual(p, 'W1', { ataMs: baseMs + 600_000, afobKg: 24_100 });
      expect(checkNavLogRow(p, 'W1')).toBe(true);
      expect(line(p, 'ABC')).toMatchObject({ pending: false, checked: true, retaMs: null });
      expect(setNavLogActual(p, 'W1', { afobKg: 1 })).toBe(false);
      expect(line(p, 'ABC').afobKg).toBe(24_100);
    });

    it('is possible for a flown waypoint only, never for the origin', () => {
      const p = plan();
      expect(checkNavLogRow(p, 'W2')).toBe(false);
      setNavLogActual(p, 'W0', { ataMs: baseMs });
      expect(checkNavLogRow(p, 'W0')).toBe(false);
    });

    it('a checked inserted waypoint is kept: DELETE only removes what is not saved', () => {
      const p = plan();
      setNextWaypoint(p, 'W1', 'WPT3');
      setNavLogActual(p, 'I1', { ataMs: baseMs + 700_000 });
      checkNavLogRow(p, 'I1');
      expect(deleteInsertedWaypoint(p, 'I1')).toBe(false);
    });
  });
});
