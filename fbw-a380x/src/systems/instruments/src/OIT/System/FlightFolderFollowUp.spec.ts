// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FFU_FAST_PERIOD_MS,
  FFU_NEAR_NM,
  FFU_OVERFLOWN_NM,
  FFU_SLOW_PERIOD_MS,
  firstIrPosition,
  FollowUpAvionics,
  FollowUpSampler,
  recordTakeoff,
} from './FlightFolderFollowUp';
import {
  buildFlightPlan,
  checkNavLogRow,
  navLogLines,
  setNavLogActual,
  setNextWaypoint,
} from './FlightFolderFlightPlan';
import { FlightFolderNetworkEvents, FlightFolderSession } from './FlightFolderSession';
import { FltOpsLaptopIndex } from './FltOpsStatusSync';
import { OisLoadBox } from './OisLoadBox';
import { testFollowUpOfp, testOfp } from './FlightFolderTestOfp';

const NOW = 1_700_000_000_000;
/** One minute of latitude is one nautical mile */
const NM = 1 / 60;
/** The waypoints of the test OFP are on the meridian 140 E, one waypoint every degree: ABC is at 37 N, DEF at 38 N */
const ABC_LAT = 37;

/**
 * @param latitude where the aircraft is
 * @param fobKg the fuel on board
 * @param overrides what differs from cruise with the IR position
 * @returns the data from the avionics
 */
function avionics(latitude: number, fobKg: number | null = 24_000, overrides: Partial<FollowUpAvionics> = {}) {
  return { cruise: true, latitudeDeg: latitude, longitudeDeg: 140, fobKg, ...overrides };
}

const flightPlan = () => buildFlightPlan(testFollowUpOfp());
const line = (plan: ReturnType<typeof flightPlan>, ident: string) => navLogLines(plan).find((l) => l.ident === ident)!;

describe('constants of the automatic flight follow-up', () => {
  it('samples every minute, every 20 s near a waypoint, and a waypoint is overflown under 7 nm', () => {
    expect(FFU_SLOW_PERIOD_MS).toBe(60_000);
    expect(FFU_FAST_PERIOD_MS).toBe(20_000);
    expect(FFU_OVERFLOWN_NM).toBe(7);
  });

  it('is near from further away than an aircraft flies in a slow period, so no waypoint slips between two samples', () => {
    const nmInSlowPeriodAt500Kt = (500 * FFU_SLOW_PERIOD_MS) / 3_600_000;
    expect(FFU_NEAR_NM).toBeGreaterThan(nmInSlowPeriodAt500Kt + FFU_OVERFLOWN_NM);
  });
});

describe('automatic flight follow-up sampler', () => {
  it('takes no sample outside the FMS cruise phase', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, avionics(ABC_LAT, 24_000, { cruise: false }), plan)).toBeNull();
    expect(sampler.update(NOW + 120_000, avionics(ABC_LAT, 24_000, { cruise: false }), plan)).toBeNull();
    expect(plan.followUp.actuals).toEqual({});
  });

  it('samples at once when the cruise phase starts', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT, 24_000, { cruise: false }), plan);
    expect(sampler.update(NOW + 5_000, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
  });

  it('takes nothing without data from the avionics, and nothing without an IR position', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, null, plan)).toBeNull();
    expect(sampler.update(NOW + 60_000, avionics(0, 24_000, { latitudeDeg: null }), plan)).toBeNull();
    expect(sampler.update(NOW + 120_000, avionics(0, 24_000, { longitudeDeg: null }), plan)).toBeNull();
    expect(plan.followUp.actuals).toEqual({});
  });

  it('starts the minute again when the data from the avionics come back', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT + 0.5), plan);
    sampler.update(NOW + 10_000, null, plan);
    expect(sampler.update(NOW + 20_000, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
  });

  it('samples every minute away from the waypoints', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    // half way between ABC and DEF: 30 nm from both
    const far = avionics(ABC_LAT + 0.5);
    expect(sampler.update(NOW, far, plan)).not.toBeNull();
    expect(sampler.update(NOW + 20_000, far, plan)).toBeNull();
    expect(sampler.update(NOW + 59_000, far, plan)).toBeNull();
    expect(sampler.update(NOW + 60_000, far, plan)).not.toBeNull();
    expect(sampler.update(NOW + 119_000, far, plan)).toBeNull();
    expect(sampler.update(NOW + 120_000, far, plan)).not.toBeNull();
  });

  it('samples every 20 seconds once a waypoint of the plan is near', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    // 12 nm before ABC: near but not overflown
    const near = avionics(ABC_LAT - 12 * NM);
    expect(sampler.update(NOW, near, plan)).not.toBeNull();
    expect(sampler.update(NOW + 19_000, near, plan)).toBeNull();
    expect(sampler.update(NOW + 20_000, near, plan)).not.toBeNull();
    expect(sampler.update(NOW + 40_000, near, plan)).not.toBeNull();
    expect(line(plan, 'ABC').ataMs).toBeNull();
  });

  it('goes back to the minute once the waypoint is flown and the next one is far', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, avionics(ABC_LAT + 3 * NM), plan)?.flownKey).toBe('W1');
    // DEF is 57 nm ahead
    const past = avionics(ABC_LAT + 4 * NM);
    expect(sampler.update(NOW + 20_000, past, plan)).toBeNull();
    expect(sampler.update(NOW + 59_000, past, plan)).toBeNull();
    expect(sampler.update(NOW + 60_000, past, plan)).not.toBeNull();
  });

  it('marks the waypoint overflown by the first sample under 7 nm, with its time and the fuel', () => {
    const plan = flightPlan();
    recordTakeoff(plan, NOW - 600_000, 25_000);
    const sampler = new FollowUpSampler();
    const sample = sampler.update(NOW, avionics(ABC_LAT - 6 * NM, 23_900), plan);
    expect(sample?.flownKey).toBe('W1');
    expect(plan.followUp.actuals.W1).toEqual({ ataMs: NOW, afobKg: 23_900, afuKg: 1_100 });
    expect(line(plan, 'ABC')).toMatchObject({ pending: true, fuelCheckShown: true, checked: false });
  });

  it('does not mark a waypoint 8 nm away', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, avionics(ABC_LAT - 8 * NM), plan)?.flownKey).toBeNull();
    expect(plan.followUp.actuals.W1).toBeUndefined();
  });

  it('marks one waypoint for each sample, the nearest first', () => {
    // two waypoints 3 nm apart: both under 7 nm from the aircraft
    const closePair = testOfp({
      navlog: [
        { ident: 'ORG', pos_lat: '36', pos_long: '140', time_total: '0', time_leg: '0', via_airway: 'DCT' },
        { ident: 'AAA', pos_lat: String(ABC_LAT), pos_long: '140', time_total: '600', time_leg: '600' },
        { ident: 'BBB', pos_lat: String(ABC_LAT + 3 * NM), pos_long: '140', time_total: '660', time_leg: '60' },
      ],
    });
    const plan = buildFlightPlan(closePair);
    const sampler = new FollowUpSampler();
    const here = avionics(ABC_LAT + 1 * NM);
    expect(sampler.update(NOW, here, plan)?.flownKey).toBe('W1');
    expect(plan.followUp.actuals.W2).toBeUndefined();
    // the next sample is 20 s later as a waypoint is still near
    expect(sampler.update(NOW + 20_000, here, plan)?.flownKey).toBe('W2');
    expect(plan.followUp.actuals.W2?.ataMs).toBe(NOW + 20_000);
  });

  it('keeps the data of a waypoint already flown, checked or not', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT, 23_900), plan);
    sampler.update(NOW + 60_000, avionics(ABC_LAT + 1 * NM, 23_800), plan);
    expect(plan.followUp.actuals.W1).toMatchObject({ ataMs: NOW, afobKg: 23_900 });
    checkNavLogRow(plan, 'W1');
    sampler.update(NOW + 120_000, avionics(ABC_LAT + 2 * NM, 23_700), plan);
    expect(plan.followUp.actuals.W1).toMatchObject({ ataMs: NOW, afobKg: 23_900 });
  });

  it('does not mark a waypoint missed earlier when the route comes back to it', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    // ABC is passed 30 nm away, then DEF is flown, then the aircraft is near ABC again
    sampler.update(NOW, avionics(ABC_LAT + 1), plan);
    expect(line(plan, 'DEF').ataMs).toBe(NOW);
    expect(sampler.update(NOW + 60_000, avionics(ABC_LAT + 2 * NM), plan)?.flownKey).toBeNull();
    expect(line(plan, 'ABC').ataMs).toBeNull();
  });

  it('does not mark a waypoint the crew skipped with NEXT WPT', () => {
    const plan = flightPlan();
    setNextWaypoint(plan, 'W1', 'GHI');
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, avionics(ABC_LAT + 1, 23_900), plan)?.flownKey).toBeNull();
    expect(line(plan, 'DEF').ataMs).toBeNull();
    expect(sampler.update(NOW + 60_000, avionics(ABC_LAT + 2, 23_800), plan)?.flownKey).toBe('W3');
  });

  it('never marks a waypoint the crew inserted, it has no position', () => {
    const plan = flightPlan();
    setNextWaypoint(plan, 'W1', 'WPT3');
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT + 0.5), plan);
    expect(plan.followUp.actuals.I1).toBeUndefined();
  });

  it('never marks the origin', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(NOW, avionics(36), plan)?.flownKey).toBeNull();
    expect(plan.followUp.actuals.W0).toBeUndefined();
  });

  it('keeps the fuel used empty when the take-off fuel is unknown, and the fuel on board when it is not given', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT, null), plan);
    expect(plan.followUp.actuals.W1).toEqual({ ataMs: NOW, afobKg: null, afuKg: null });
  });

  it('ignores the clock before its first event, and starts again when the clock goes back', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    expect(sampler.update(0, avionics(ABC_LAT + 0.5), plan)).toBeNull();
    expect(sampler.update(NOW, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
    // a flight reload sets the clock back: no minute to wait for
    expect(sampler.update(NOW - 3_600_000, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
  });

  it('samples after the clock jumped forward, as the due time is long past', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT + 0.5), plan);
    expect(sampler.update(NOW + 3_600_000, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
  });

  it('starts again for another folder', () => {
    const plan = flightPlan();
    const sampler = new FollowUpSampler();
    sampler.update(NOW, avionics(ABC_LAT + 0.5), plan);
    sampler.reset();
    expect(sampler.update(NOW + 1_000, avionics(ABC_LAT + 0.5), plan)).not.toBeNull();
  });
});

describe('aircraft position from the IRs', () => {
  it('takes the first IR that gives a latitude and a longitude', () => {
    expect(firstIrPosition([null, 36, 37], [null, 140, 141])).toEqual({ latitudeDeg: 36, longitudeDeg: 140 });
    expect(firstIrPosition([35, 36, 37], [140, 141, 142])).toEqual({ latitudeDeg: 35, longitudeDeg: 140 });
  });

  it('skips an IR that gives only one of the two', () => {
    expect(firstIrPosition([35, 36, 37], [null, null, 142])).toEqual({ latitudeDeg: 37, longitudeDeg: 142 });
  });

  it('gives no position when no IR gives one', () => {
    expect(firstIrPosition([null, null, null], [null, null, null])).toBeNull();
    expect(firstIrPosition([], [])).toBeNull();
  });
});

describe('take-off of the origin', () => {
  it('gives the origin its time and fuel on board', () => {
    const plan = flightPlan();
    recordTakeoff(plan, NOW, 25_000);
    expect(plan.followUp.actuals.W0).toEqual({ ataMs: NOW, afobKg: 25_000, afuKg: null });
  });

  it('counts the fuel used from the fuel on board the origin holds, also when the crew typed it', () => {
    const plan = flightPlan();
    recordTakeoff(plan, NOW, null);
    setNavLogActual(plan, 'W0', { afobKg: 25_000 });
    new FollowUpSampler().update(NOW + 60_000, avionics(ABC_LAT, 24_100), plan);
    expect(plan.followUp.actuals.W1?.afuKg).toBe(900);
  });

  it('keeps the first take-off: the avionics repeat it', () => {
    const plan = flightPlan();
    recordTakeoff(plan, NOW, 25_000);
    recordTakeoff(plan, NOW + 60_000, 24_900);
    expect(plan.followUp.actuals.W0).toMatchObject({ ataMs: NOW, afobKg: 25_000 });
  });

  it('takes the fuel on board when the avionics gave it after the time, and then keeps it', () => {
    const plan = flightPlan();
    recordTakeoff(plan, NOW, null);
    recordTakeoff(plan, NOW + 1_000, 24_900);
    expect(plan.followUp.actuals.W0).toEqual({ ataMs: NOW, afobKg: 24_900, afuKg: null });
    recordTakeoff(plan, NOW + 2_000, 24_800);
    expect(plan.followUp.actuals.W0?.afobKg).toBe(24_900);
  });

  it('does nothing for a route without waypoints', () => {
    const plan = buildFlightPlan(testOfp({ navlog: undefined }));
    recordTakeoff(plan, NOW, 25_000);
    expect(plan.followUp.actuals).toEqual({});
  });
});

interface Sent {
  refreshRequest: FlightFolderNetworkEvents['oisEffRefreshRequest'][];
  refreshReply: FlightFolderNetworkEvents['oisEffRefreshReply'][];
}

/**
 * A laptop whose LOAD BOX loaded the follow-up OFP, with the folder current.
 * @param index the laptop
 * @returns the laptop
 */
async function laptop(index: FltOpsLaptopIndex = 1) {
  const sent: Sent = { refreshRequest: [], refreshReply: [] };
  const session = new FlightFolderSession(
    index,
    {
      sendCurrent: () => {},
      sendMaster: () => {},
      sendSynchronize: () => {},
      sendRefreshRequest: (m) => sent.refreshRequest.push(m),
      sendRefreshReply: (m) => sent.refreshReply.push(m),
    },
    () => true,
    () => {},
  );
  const loadBox = new OisLoadBox(() => Promise.resolve(testFollowUpOfp()));
  loadBox.loaded.sub((items) => session.onLoaded(items));
  await loadBox.refresh(true);
  loadBox.toggle(0);
  loadBox.load(index === 1 ? 'CAPT' : 'FO', true, true);
  const folder = session.importPending(
    session.pending.get().map((p) => p.id),
    true,
  )[0];
  return { session, sent, folder };
}

describe('the follow-up of the current folder', () => {
  it('samples into the current folder while the avionics data reach the laptop', async () => {
    const { session, folder } = await laptop();
    expect(session.sampleFollowUp(NOW, avionics(ABC_LAT))?.flownKey).toBe('W1');
    expect(folder.flightPlan.followUp.actuals.W1?.ataMs).toBe(NOW);
  });

  it('takes no sample without avionics data', async () => {
    const { session, folder } = await laptop();
    expect(session.sampleFollowUp(NOW, null)).toBeNull();
    expect(folder.flightPlan.followUp.actuals).toEqual({});
  });

  it('tells the views only when a sample marked a waypoint', async () => {
    const { session, folder } = await laptop();
    let changes = 0;
    folder.changed.sub(() => changes++);
    session.sampleFollowUp(NOW, avionics(ABC_LAT + 0.5));
    expect(changes).toBe(0);
    session.sampleFollowUp(NOW + 60_000, avionics(ABC_LAT));
    expect(changes).toBe(1);
  });

  it('takes no sample once the folder is closed', async () => {
    const { session, folder } = await laptop();
    folder.close();
    expect(session.sampleFollowUp(NOW, avionics(ABC_LAT))).toBeNull();
    expect(folder.flightPlan.followUp.actuals).toEqual({});
  });

  it('is read-only without the master status: no NEXT WPT, DELETE, entry or FUEL CHK', async () => {
    const { session, folder } = await laptop();
    session.sampleFollowUp(NOW, avionics(ABC_LAT));
    expect(session.nextWaypoint('W1', 'WPT3')).toBe('rejected');
    expect(session.setNavLogActual('W2', { ataMs: NOW })).toBe(false);
    expect(session.checkFuel('W1')).toBe(false);
    expect(session.setRemarks('TEST')).toBe(false);
    expect(navLogLines(folder.flightPlan)).toHaveLength(6);
    expect(folder.flightPlan.followUp.checked).toEqual({});

    session.takeMaster();
    expect(session.nextWaypoint('W1', 'WPT3')).toBe('inserted');
    expect(session.setNavLogActual('W2', { ataMs: NOW })).toBe(true);
    expect(session.checkFuel('W1')).toBe(true);
    expect(session.setRemarks('TEST')).toBe(true);
    expect(session.deleteWaypoint('I1')).toBe(true);
  });

  it('says whether this laptop may change the follow-up of a folder: master, current and open', async () => {
    const { session, folder } = await laptop();
    expect(session.canEditFollowUp(folder.id)).toBe(false);
    session.takeMaster();
    expect(session.canEditFollowUp(folder.id)).toBe(true);
    expect(session.canEditFollowUp('AIB406 23-SEP-08 OTHER')).toBe(false);
    folder.close();
    expect(session.canEditFollowUp(folder.id)).toBe(false);
  });

  it('is read-only for a closed folder, whoever is the master', async () => {
    const { session, folder } = await laptop();
    session.takeMaster();
    folder.close();
    expect(session.nextWaypoint('W1', 'WPT3')).toBe('rejected');
    expect(session.setNavLogActual('W2', { ataMs: NOW })).toBe(false);
  });

  it('keeps the Update cells of the flight plan for the master: FLT INFO fuel and load, ALTN', async () => {
    const { session, folder } = await laptop();
    expect(session.setFuelUpdate(folder.id, 'trip', 14_400)).toBe(false);
    expect(session.setLoadUpdate(folder.id, 'dow', 280_000)).toBe(false);
    expect(session.setAltnFuelUpdate(folder.id, 0, 3_000)).toBe(false);
    expect(folder.flightPlan.updates).toEqual({ fuel: {}, load: {}, altnFuel: [] });

    session.takeMaster();
    expect(session.setFuelUpdate(folder.id, 'trip', 14_400)).toBe(true);
    expect(session.setLoadUpdate(folder.id, 'dow', 280_000)).toBe(true);
    expect(session.setAltnFuelUpdate(folder.id, 0, 3_000)).toBe(true);
    expect(folder.flightPlan.updates.fuel.trip).toBe(14_400);
    expect(folder.flightPlan.updates.load.dow).toBe(280_000);
    expect(folder.flightPlan.updates.altnFuel[0]).toBe(3_000);
    expect(session.setFuelUpdate('AIB406 23-SEP-08 OTHER', 'trip', 1)).toBe(false);
    expect(folder.flightPlan.updates.fuel.trip).toBe(14_400);
  });

  it('follows the master status in the Update cells without a new page: GET MASTER on either laptop, closure', async () => {
    const { session, folder } = await laptop();
    const editable = session.followUpEditable(folder);
    expect(editable.get()).toBe(false);
    session.takeMaster();
    expect(editable.get()).toBe(true);
    // the other laptop asked for the master status
    session.receiveMaster({ sender: 2 });
    expect(editable.get()).toBe(false);
    session.takeMaster();
    expect(editable.get()).toBe(true);
    folder.close();
    expect(editable.get()).toBe(false);
    editable.destroy();
  });

  it('records the take-off in the current folder without being the master', async () => {
    const { session, folder } = await laptop();
    session.recordTakeoff(NOW, 25_000);
    expect(folder.flightPlan.followUp.actuals.W0?.ataMs).toBe(NOW);
  });

  it('REFRESH asks the other laptop, and takes its follow-up when it answers', async () => {
    const a = await laptop(1);
    const b = await laptop(2);
    a.session.takeMaster();
    a.session.sampleFollowUp(NOW, avionics(ABC_LAT));
    a.session.nextWaypoint('W2', 'WPT3');

    b.session.refreshFromOffside();
    expect(b.sent.refreshRequest).toHaveLength(1);
    // the request reaches A, which answers with what it recorded
    a.session.receiveRefreshRequest(b.sent.refreshRequest[0]);
    expect(a.sent.refreshReply).toHaveLength(1);
    b.session.receiveRefreshReply(a.sent.refreshReply[0]);
    expect(navLogLines(b.folder.flightPlan).map((l) => l.ident)).toContain('WPT3');
    expect(b.folder.flightPlan.followUp.actuals.W1?.ataMs).toBe(NOW);
  });

  it('REFRESH takes no answer that it did not ask for, and answers a request for the current folder only', async () => {
    const a = await laptop(1);
    const b = await laptop(2);
    a.session.takeMaster();
    a.session.nextWaypoint('W2', 'WPT3');
    a.session.receiveRefreshRequest({ sender: 2, identifier: 'AIB406 23-SEP-08 OTHER' });
    expect(a.sent.refreshReply).toHaveLength(0);
    a.session.receiveRefreshRequest({ sender: 2, identifier: a.folder.id });
    b.session.receiveRefreshReply(a.sent.refreshReply[0]);
    expect(navLogLines(b.folder.flightPlan)).toHaveLength(6);
  });

  it('REFRESH does not apply an answer for another folder, and then waits for no answer any more', async () => {
    const a = await laptop(1);
    const b = await laptop(2);
    a.session.takeMaster();
    a.session.nextWaypoint('W2', 'WPT3');
    b.session.refreshFromOffside();
    b.session.receiveRefreshReply({
      sender: 1,
      identifier: 'AIB406 23-SEP-08 OTHER',
      followUp: a.folder.followUpState(),
    });
    expect(navLogLines(b.folder.flightPlan)).toHaveLength(6);
    b.session.receiveRefreshReply({ sender: 1, identifier: b.folder.id, followUp: a.folder.followUpState() });
    expect(navLogLines(b.folder.flightPlan)).toHaveLength(6);
  });

  it('REFRESH does not change a closed folder', async () => {
    const a = await laptop(1);
    a.session.takeMaster();
    a.session.nextWaypoint('W2', 'WPT3');
    const b = await laptop(2);
    b.folder.close();
    expect(b.folder.applyFollowUp(a.folder.followUpState())).toBe(false);
    expect(navLogLines(b.folder.flightPlan)).toHaveLength(6);
  });

  it('REFRESH ignores the request of the laptop itself', async () => {
    const a = await laptop(1);
    a.session.receiveRefreshRequest({ sender: 1, identifier: a.folder.id });
    expect(a.sent.refreshReply).toHaveLength(0);
  });

  it('SYNCHRONIZE WITH OFFSIDE carries the follow-up too', async () => {
    const a = await laptop(1);
    const b = await laptop(2);
    a.session.takeMaster();
    a.session.sampleFollowUp(NOW, avionics(ABC_LAT));
    b.folder.applySyncState(a.folder.syncState());
    expect(b.folder.flightPlan.followUp.actuals.W1?.ataMs).toBe(NOW);
  });
});
