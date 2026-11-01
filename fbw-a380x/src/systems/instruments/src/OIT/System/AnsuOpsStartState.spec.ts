// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix, FailuresConsumer, FwcBusEvents } from '@flybywiresim/fbw-sdk';
import { FqmsBusEvents } from '@shared/publishers/FqmsBusPublisher';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OitSimvars } from '../OitSimvarPublisher';
import { AnsuOps } from './AnsuOps';

// The ECAM alert tables fail on their circular import in a test; the logbook only names the alerts with them
vi.mock('../../MsfsAvionicsCommon/EcamMessages', () => ({ EcamAbnormalProcedures: {} }));

const START_TIME_MS = Date.UTC(2026, 9, 18, 10, 0);
const FUEL_AT_START_KG = 150_000;

/**
 * @param value the data of the word
 * @param bits the bits set in the word, for a discrete word
 * @returns the ARINC 429 word as the avionics publish it, with a normal operation SSM
 */
function arincWord(value: number | null, bits: number[] = []): number {
  const word = Arinc429Register.empty();
  word.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  if (value !== null) {
    word.setValue(value);
  }
  bits.forEach((bit) => word.setBitValue(bit, true));
  return word.rawWord;
}

/** Bit 28 of discrete word 126 of the FWC: the aircraft is on the ground */
const ON_GROUND_BIT = 28;

/**
 * @returns an NSS AVNCS ANSU on a powered aircraft, and the publishers of what the avionics send to it
 */
function setUp() {
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => (name.startsWith('L:A32NX_ELEC') ? 1 : 0));
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation(() => Promise.resolve());
  const bus = new EventBus();
  const failures = { isActive: () => false, register: () => {}, update: () => {} } as unknown as FailuresConsumer;
  const ansu = new AnsuOps(bus, 1, 'nss-avncs', failures);
  ansu.init();
  const clock = bus.getPublisher<ClockEvents>();
  const simvars = bus.getPublisher<OitSimvars>();
  const fqms = bus.getPublisher<FqmsBusEvents>();
  const fwc = bus.getPublisher<FwcBusEvents>();
  /**
   * One frame: the clock moves on, the ANSU updates
   * @param timeMs the sim time of the frame
   */
  const frame = (timeMs: number) => {
    clock.pub('simTime', timeMs);
    ansu.onUpdate();
  };
  return { ansu, clock, simvars, fqms, fwc, frame };
}

describe('OOOI times and fuel of the state the aircraft starts in', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records no OUT when the park brake is off and the doors are closed from the start', () => {
    const { ansu, simvars, fqms, fwc, frame } = setUp();
    // The avionics publish their first values after the ANSU init, in the first frame of the instrument
    simvars.pub('parkBrakeSet', false);
    simvars.pub('cabinDoorOpen', 0);
    fwc.pub('a32nx_fwc_discrete_word_126_1', arincWord(null, [ON_GROUND_BIT]));
    fqms.pub('fqms_total_fuel_on_board', arincWord(FUEL_AT_START_KG));

    frame(START_TIME_MS);
    frame(START_TIME_MS + 1_000);

    expect(ansu.outBlockTime.get()).toBeNull();
    expect(ansu.outBlockFob.get()).toBeNull();
  });

  it('still records OUT at a real release of the park brake after such a start', () => {
    const { ansu, clock, simvars, fqms, fwc, frame } = setUp();
    simvars.pub('parkBrakeSet', false);
    simvars.pub('cabinDoorOpen', 0);
    fwc.pub('a32nx_fwc_discrete_word_126_1', arincWord(null, [ON_GROUND_BIT]));
    fqms.pub('fqms_total_fuel_on_board', arincWord(FUEL_AT_START_KG));
    frame(START_TIME_MS);
    frame(START_TIME_MS + 1_000);

    simvars.pub('parkBrakeSet', true);
    frame(START_TIME_MS + 2_000);
    clock.pub('simTime', START_TIME_MS + 60_000);
    simvars.pub('parkBrakeSet', false);
    ansu.onUpdate();
    frame(START_TIME_MS + 61_000);

    expect(ansu.outBlockTime.get()).toBe(START_TIME_MS + 60_000);
  });

  it('records OUT with the time and the fuel of the release when the park brake is set at the start', () => {
    const { ansu, clock, simvars, fqms, fwc, frame } = setUp();
    simvars.pub('parkBrakeSet', true);
    simvars.pub('cabinDoorOpen', 0);
    fwc.pub('a32nx_fwc_discrete_word_126_1', arincWord(null, [ON_GROUND_BIT]));
    fqms.pub('fqms_total_fuel_on_board', arincWord(FUEL_AT_START_KG));
    frame(START_TIME_MS);
    frame(START_TIME_MS + 1_000);
    expect(ansu.outBlockTime.get()).toBeNull();

    // The clock publisher runs before the others in a frame: the release is stamped with this frame's time
    clock.pub('simTime', START_TIME_MS + 60_000);
    fqms.pub('fqms_total_fuel_on_board', arincWord(FUEL_AT_START_KG - 500));
    simvars.pub('parkBrakeSet', false);
    ansu.onUpdate();
    frame(START_TIME_MS + 61_000);

    expect(ansu.outBlockTime.get()).toBe(START_TIME_MS + 60_000);
    expect(ansu.outBlockFob.get()).toBe(FUEL_AT_START_KG - 500);
  });

  it('records neither OUT nor OFF when the aircraft starts in the air', () => {
    const { ansu, simvars, fqms, fwc, frame } = setUp();
    simvars.pub('parkBrakeSet', false);
    simvars.pub('cabinDoorOpen', 0);
    fwc.pub('a32nx_fwc_discrete_word_126_1', arincWord(null));
    fqms.pub('fqms_total_fuel_on_board', arincWord(FUEL_AT_START_KG));

    // OFF would be confirmed after 10 s in the air
    for (let second = 0; second <= 12; second++) {
      frame(START_TIME_MS + second * 1_000);
    }

    expect(ansu.outBlockTime.get()).toBeNull();
    expect(ansu.offBlockTime.get()).toBeNull();
  });
});
