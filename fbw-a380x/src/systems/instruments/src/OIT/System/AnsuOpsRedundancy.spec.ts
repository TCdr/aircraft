// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, Subject } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix, FailuresConsumer, FwcBusEvents } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { FmsAocMessages } from '@datalink/aoc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OitSimvars } from '../OitSimvarPublisher';
import { AnsuOps } from './AnsuOps';

// The ECAM alert tables fail on their circular import in a test; the logbook only names the alerts with them
vi.mock('../../MsfsAvionicsCommon/EcamMessages', () => ({ EcamAbnormalProcedures: {} }));

const START_TIME_MS = Date.UTC(2026, 9, 18, 10, 0);

/** Bit 28 of discrete word 126 of the FWC: the aircraft is on the ground */
const ON_GROUND_BIT = 28;

/**
 * @param onGround whether the aircraft is on the ground
 * @returns the FWC discrete word 126
 */
function groundWord(onGround = true): number {
  const word = Arinc429Register.empty();
  word.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  word.setBitValue(ON_GROUND_BIT, onGround);
  return word.rawWord;
}

/**
 * @param routerOperating whether the router of the first ANSU operates, none for an ANSU without a router
 * @returns two NSS AVNCS ANSU units on one bus, the first one sending the OOOI reports and the second one not, and the
 * messages the AOC gets
 */
function setUp(routerOperating: Subject<boolean> | null = null) {
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => (name.startsWith('L:A32NX_ELEC') ? 1 : 0));
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
  const bus = new EventBus();
  const failed = new Set<number>();
  const failures = {
    isActive: (key: number) => failed.has(key),
    register: () => {},
    update: () => {},
  } as unknown as FailuresConsumer;
  const captain = new AnsuOps(bus, 1, 'nss-avncs', failures, true, routerOperating);
  const firstOfficer = new AnsuOps(bus, 1, 'nss-avncs', failures, false);
  captain.init();
  firstOfficer.init();
  const aocMessages: string[] = [];
  bus
    .getSubscriber<FmsAocMessages>()
    .on('aocSendFreetextMessage')
    .handle((request) => aocMessages.push(request.message.Message));
  const clock = bus.getPublisher<ClockEvents>();
  const simvars = bus.getPublisher<OitSimvars>();
  const fwc = bus.getPublisher<FwcBusEvents>();
  const frame = (timeMs: number, ...units: AnsuOps[]) => {
    clock.pub('simTime', timeMs);
    units.forEach((unit) => unit.onUpdate());
  };
  return { captain, firstOfficer, failed, aocMessages, clock, simvars, fwc, frame };
}

/**
 * Releases the park brake of an aircraft that starts on the ground with it set
 * @param context the result of setUp
 * @param units the units that update
 */
function releaseBrake(context: ReturnType<typeof setUp>, ...units: AnsuOps[]) {
  const { clock, simvars, fwc, frame } = context;
  simvars.pub('parkBrakeSet', true);
  simvars.pub('cabinDoorOpen', 0);
  fwc.pub('a32nx_fwc_discrete_word_126_1', groundWord());
  frame(START_TIME_MS, ...units);
  frame(START_TIME_MS + 1_000, ...units);
  // The clock publisher runs before the others in a frame: the release is stamped with this frame's time
  clock.pub('simTime', START_TIME_MS + 60_000);
  simvars.pub('parkBrakeSet', false);
  units.forEach((unit) => unit.onUpdate());
  frame(START_TIME_MS + 61_000, ...units);
}

describe('OOOI reports of the two OITs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('goes out once to the AOC, from the captain OIT only', () => {
    const context = setUp();
    context.captain.companyComReports.oooiStation.set('AFROPS');
    context.firstOfficer.companyComReports.oooiStation.set('AFROPS');

    releaseBrake(context, context.captain, context.firstOfficer);

    const outReports = context.aocMessages.filter((message) => message.startsWith('OOOI OUT'));
    expect(outReports.length).toBe(1);
    // The first officer OIT still shows the time
    expect(context.firstOfficer.outBlockTime.get()).toBe(START_TIME_MS + 60_000);
  });

  it('sends the OOOI reports to the station that was set on the first officer OIT', () => {
    const context = setUp();
    context.firstOfficer.companyComReports.oooiStation.set('AFROPS');

    releaseBrake(context, context.captain, context.firstOfficer);

    expect(context.aocMessages.filter((message) => message.startsWith('OOOI OUT')).length).toBe(1);
    expect(context.captain.companyComReports.oooiStation.get()).toBe('AFROPS');
  });

  it('does not send queued OOOI reports from the first officer OIT when it sends another report', () => {
    const context = setUp();
    context.captain.companyComReports.oooiStation.set('AFROPS');

    releaseBrake(context, context.captain, context.firstOfficer);
    const before = context.aocMessages.length;
    context.firstOfficer.companyComReports.send('wx', 'WX', { Station: 'AFROPS', Message: 'WEATHER' } as never);

    const sent = context.aocMessages.slice(before);
    expect(sent.filter((message) => message.startsWith('OOOI'))).toEqual([]);
  });
});

describe('ANSU failures and the data of the NSS AVNCS applications', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the drafts and the OOOI times while ANSU 1 is out and ANSU 2 is healthy', () => {
    const context = setUp();
    const { captain, failed, simvars, frame } = context;
    simvars.pub('nssAnsu2Healthy', true);
    releaseBrake(context, captain);
    const draft = captain.pageDrafts.field('page', 'name', 'typed');
    const outTime = captain.outBlockTime.get();
    expect(outTime).not.toBeNull();

    failed.add(A380Failure.NssAnsu1);
    for (let second = 2; second < 6; second++) {
      frame(START_TIME_MS + 61_000 + second * 1_000, captain);
    }

    expect(captain.pageDrafts.has('page')).toBe(true);
    expect(draft.get()).toBe('typed');
    expect(captain.outBlockTime.get()).toBe(outTime);

    // A takeoff during the outage is still recorded: ANSU 2 runs the AOC application
    context.fwc.pub('a32nx_fwc_discrete_word_126_1', groundWord(false));
    for (let second = 0; second <= 12; second++) {
      frame(START_TIME_MS + 70_000 + second * 1_000, captain);
    }
    expect(captain.offBlockTime.get()).not.toBeNull();
  });

  it('clears the data once when both ANSU units are out, not at every frame', () => {
    const context = setUp();
    const { captain, failed, simvars, frame } = context;
    simvars.pub('nssAnsu2Healthy', true);
    releaseBrake(context, captain);
    captain.pageDrafts.field('page', 'name', 'typed');

    failed.add(A380Failure.NssAnsu1);
    simvars.pub('nssAnsu2Healthy', false);
    frame(START_TIME_MS + 70_000, captain);
    expect(captain.pageDrafts.has('page')).toBe(false);
    expect(captain.outBlockTime.get()).toBeNull();

    // A draft typed afterwards is not cleared by the next frames
    captain.pageDrafts.field('page', 'name', 'again');
    frame(START_TIME_MS + 71_000, captain);
    frame(START_TIME_MS + 72_000, captain);
    expect(captain.pageDrafts.has('page')).toBe(true);
  });

  it('keeps the data of an ANSU that only lost its router, and clears it once the ANSU itself stops', () => {
    const routerOperating = Subject.create(true);
    const context = setUp(routerOperating);
    const { captain, failed, simvars, frame } = context;
    simvars.pub('nssAnsu2Healthy', true);
    releaseBrake(context, captain);
    captain.pageDrafts.field('page', 'name', 'typed');
    const outTime = captain.outBlockTime.get();

    // Both ANSU units are cut off from their users, but ANSU 1 still has its power and its data
    routerOperating.set(false);
    simvars.pub('nssAnsu2Healthy', false);
    frame(START_TIME_MS + 70_000, captain);
    frame(START_TIME_MS + 71_000, captain);
    expect(captain.pageDrafts.has('page')).toBe(true);
    expect(captain.outBlockTime.get()).toBe(outTime);

    failed.add(A380Failure.NssAnsu1);
    frame(START_TIME_MS + 72_000, captain);
    expect(captain.pageDrafts.has('page')).toBe(false);
    expect(captain.outBlockTime.get()).toBeNull();
  });
});
