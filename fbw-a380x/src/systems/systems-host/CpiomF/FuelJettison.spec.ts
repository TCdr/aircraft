// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, KeyEventManager } from '@microsoft/msfs-sdk';
import { FailuresConsumer, UniversalConfigProvider } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { FuelJettison } from './FuelJettison';

/** FCOM DSC-28-40: 330 693 lb/h */
const RATE_LB_PER_S = 330_693 / 3600;
const POUNDS_PER_GALLON = 6.7;
const LB_PER_KG = 2.20462;

const TRANSFER_TANKS = [1, 3, 4, 7, 8, 10];
const TRIM_TANK = 11;
const FEED_TANKS = [2, 5, 6, 9];

/**
 * The sim variables of a test. The SDK modules imported by FuelJettison install the sim's own SimVar functions, which
 * read through the mocked simvar.getValueReg (always 0), so the tests keep their own values.
 */
const simVars = new Map<string, number | boolean>();

const set = (name: string, value: number | boolean) => simVars.set(name, value);
const get = (name: string) => simVars.get(name) ?? 0;
const quantity = (tank: number) => get(`FUELSYSTEM TANK QUANTITY:${tank}`) as number;

/**
 * The takeoff (mtow) and landing (mlw) CG envelopes of the airframe, [CG % MAC, weight kg]: at 350 t, the forward
 * limit is 30 % for takeoff and 32 % for landing, so 32 % (the most aft of the two).
 */
const ENVELOPES = {
  mtow: [
    [30, 300_000],
    [30, 600_000],
    [45, 600_000],
    [45, 300_000],
  ],
  mlw: [
    [32, 300_000],
    [32, 400_000],
    [45, 400_000],
    [45, 300_000],
  ],
};

interface Conditions {
  arm?: boolean;
  active?: boolean;
  powered?: boolean;
  grossWeightKg?: number;
  jettisonGwKg?: number;
  cg?: number;
  gallons?: number;
}

const setConditions = ({
  arm = true,
  active = true,
  powered = true,
  grossWeightKg = 350_000,
  jettisonGwKg = 0,
  cg = 38,
}: Conditions) => {
  set('L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON', arm);
  set('L:A380X_OVHD_FUEL_JETTISON_ACTIVE_PB_IS_ON', active);
  set('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', powered);
  set('TOTAL WEIGHT', grossWeightKg * LB_PER_KG);
  set('L:A380X_FMS_JETTISON_GW', jettisonGwKg);
  set('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', cg);
};

const fillTanks = (gallons = 5000) => {
  for (const tank of [...TRANSFER_TANKS, TRIM_TANK, ...FEED_TANKS]) {
    set(`FUELSYSTEM TANK QUANTITY:${tank}`, gallons);
  }
};

let triggerKey: ReturnType<typeof vi.fn>;

/** The active failures of a test */
const failures = new Set<number>();

const failuresConsumer = {
  register: () => {},
  isActive: (failure: number) => failures.has(failure),
} as unknown as FailuresConsumer;

/** A jettison system, initialized, with or without the CG envelopes of the airframe configuration */
const createJettison = async (withEnvelopes = true) => {
  const jettison = new FuelJettison(new EventBus(), { deltaTime: 1000 } as unknown as BaseInstrument, failuresConsumer);
  vi.stubEnv('AIRCRAFT_VARIANT', 'a380-842');
  vi.spyOn(UniversalConfigProvider, 'fetchAirframeInfo').mockResolvedValue({
    designLimits: { performanceEnvelope: withEnvelopes ? ENVELOPES : undefined },
  } as unknown as Awaited<ReturnType<typeof UniversalConfigProvider.fetchAirframeInfo>>);
  jettison.init();
  // the airframe configuration and the key event manager promises
  await new Promise((resolve) => setTimeout(resolve, 0));
  return jettison;
};

/** Updates for one second of sim time */
const updateOneSecond = (jettison: FuelJettison) => jettison.onUpdate();

beforeEach(() => {
  simVars.clear();
  failures.clear();
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => get(name));
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
    set(name, value);
    return Promise.resolve();
  });
  set('FUEL WEIGHT PER GALLON', POUNDS_PER_GALLON);
  fillTanks();
  setConditions({});
  triggerKey = vi.fn();
  vi.spyOn(KeyEventManager, 'getManager').mockResolvedValue({ triggerKey } as unknown as KeyEventManager);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('FuelJettison (A380 FCOM DSC-28-40)', () => {
  describe('start', () => {
    it.each<[string, Conditions]>([
      ['JETTISON ARM only', { active: false }],
      ['JETTISON ACTIVE only', { arm: false }],
      ['no AC 1 power', { powered: false }],
    ])('does not jettison with %s', async (_, conditions) => {
      const jettison = await createJettison();
      setConditions(conditions);
      updateOneSecond(jettison);
      expect(TRANSFER_TANKS.map(quantity)).toEqual(TRANSFER_TANKS.map(() => 5000));
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(false);
      expect(get('L:A380X_OVHD_FUEL_JETTISON_IS_OPEN')).toBe(false);
    });

    it('jettisons with ARM and ACTIVE ON, with or without a JTSN GW', async () => {
      const jettison = await createJettison();
      updateOneSecond(jettison);
      expect(quantity(1)).toBeLessThan(5000);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(true);
      // the OPEN light of the JETTISON ACTIVE pb-sw
      expect(get('L:A380X_OVHD_FUEL_JETTISON_IS_OPEN')).toBe(true);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(false);
    });
  });

  describe('rate and tanks', () => {
    it('jettisons 330 693 lb/h from the transfer tanks, never from the feed tanks', async () => {
      const jettison = await createJettison();
      set('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', 40);
      updateOneSecond(jettison);
      const removedGallons = [...TRANSFER_TANKS, TRIM_TANK].reduce((sum, tank) => sum + 5000 - quantity(tank), 0);
      expect(removedGallons * POUNDS_PER_GALLON).toBeCloseTo(RATE_LB_PER_S, 6);
      expect(FEED_TANKS.map(quantity)).toEqual(FEED_TANKS.map(() => 5000));
    });

    it('empties the transfer tanks together, in proportion to their content', async () => {
      const jettison = await createJettison();
      set('FUELSYSTEM TANK QUANTITY:1', 1000);
      set('FUELSYSTEM TANK QUANTITY:4', 4000);
      updateOneSecond(jettison);
      const removed1 = 1000 - quantity(1);
      const removed4 = 4000 - quantity(4);
      expect(removed4 / removed1).toBeCloseTo(4, 6);
    });

    it('leaves the trim tank fuel while the CG limits are not known', async () => {
      const jettison = await createJettison(false);
      updateOneSecond(jettison);
      expect(quantity(TRIM_TANK)).toBe(5000);
      expect(quantity(1)).toBeLessThan(5000);
    });
  });

  describe('trim tank and CG', () => {
    it('stops the trim tank jettison at the forward limit and resumes it 0.5 % aft of it', async () => {
      const jettison = await createJettison();
      const trimJettisons = (cg: number) => {
        set('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', cg);
        const before = quantity(TRIM_TANK);
        updateOneSecond(jettison);
        return quantity(TRIM_TANK) < before;
      };
      // forward limit at 350 t: 32 % (the landing envelope)
      expect(trimJettisons(33)).toBe(true);
      expect(trimJettisons(32)).toBe(false);
      expect(trimJettisons(32.3)).toBe(false);
      expect(trimJettisons(32.5)).toBe(true);
      expect(trimJettisons(32.3)).toBe(true);
      expect(trimJettisons(31.9)).toBe(false);
    });
  });

  describe('end', () => {
    it('stops at the JTSN GW, and shows FUEL JETTISON COMPLETED until both pb-sw are OFF', async () => {
      const jettison = await createJettison();
      setConditions({ grossWeightKg: 349_000, jettisonGwKg: 350_000 });
      updateOneSecond(jettison);
      expect(quantity(1)).toBe(5000);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(false);
      expect(get('L:A380X_OVHD_FUEL_JETTISON_IS_OPEN')).toBe(false);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(true);

      // no new jettison while the pb-sw stay ON, even above the JTSN GW
      setConditions({ grossWeightKg: 360_000, jettisonGwKg: 350_000 });
      updateOneSecond(jettison);
      expect(quantity(1)).toBe(5000);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(true);

      // one pb-sw OFF is not enough, both OFF ends it
      setConditions({ arm: false, grossWeightKg: 360_000, jettisonGwKg: 350_000 });
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(true);
      setConditions({ arm: false, active: false, grossWeightKg: 360_000, jettisonGwKg: 350_000 });
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(false);

      // a new jettison can start
      setConditions({ grossWeightKg: 360_000, jettisonGwKg: 350_000 });
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(true);
    });

    it('stops when the transfer tanks are empty', async () => {
      const jettison = await createJettison();
      for (const tank of [...TRANSFER_TANKS, TRIM_TANK]) {
        set(`FUELSYSTEM TANK QUANTITY:${tank}`, 0.4);
      }
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(false);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(true);
    });

    it('stops at once when the flight crew sets a pb-sw OFF, without FUEL JETTISON COMPLETED', async () => {
      const jettison = await createJettison();
      updateOneSecond(jettison);
      setConditions({ active: false });
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(false);
      expect(get('L:A380X_FUEL_JETTISON_COMPLETED')).toBe(false);
    });
  });

  describe('jettison valves', () => {
    it('opens the jettison valves for the SD FUEL page while jettisoning, and sets them only on a change', async () => {
      const jettison = await createJettison();
      updateOneSecond(jettison);
      updateOneSecond(jettison);
      expect(triggerKey.mock.calls).toEqual([
        ['FUELSYSTEM_VALVE_SET', true, 57, 1],
        ['FUELSYSTEM_VALVE_SET', true, 58, 1],
      ]);
      setConditions({ active: false });
      updateOneSecond(jettison);
      expect(triggerKey.mock.calls.slice(2)).toEqual([
        ['FUELSYSTEM_VALVE_SET', true, 57, 0],
        ['FUELSYSTEM_VALVE_SET', true, 58, 0],
      ]);
    });
  });

  describe('jettison valve failures (FCOM PRO-ABN-ECAM-10-28)', () => {
    const removedPounds = () =>
      [...TRANSFER_TANKS, TRIM_TANK].reduce((sum, tank) => sum + 5000 - quantity(tank), 0) * POUNDS_PER_GALLON;

    it('jettisons through the other valve at half the rate with one valve stuck closed (FUEL JETTISON FAULT)', async () => {
      const jettison = await createJettison();
      failures.add(A380Failure.FuelJettisonValveLeftStuckClosed);
      set('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', 40);
      updateOneSecond(jettison);
      expect(removedPounds()).toBeCloseTo(RATE_LB_PER_S / 2, 6);
      expect(get('L:A380X_FUEL_JETTISON_L_VALVE_FAULT')).toBe(true);
      expect(get('L:A380X_FUEL_JETTISON_R_VALVE_FAULT')).toBe(false);
      expect(get('L:A380X_FUEL_JETTISON_NOT_AVAIL')).toBe(false);
      expect(triggerKey.mock.calls).toEqual([
        ['FUELSYSTEM_VALVE_SET', true, 57, 0],
        ['FUELSYSTEM_VALVE_SET', true, 58, 1],
      ]);
    });

    it('does not find a valve stuck closed before the jettison is selected', async () => {
      const jettison = await createJettison();
      failures.add(A380Failure.FuelJettisonValveRightStuckClosed);
      setConditions({ arm: false, active: false });
      updateOneSecond(jettison);
      expect(get('L:A380X_FUEL_JETTISON_R_VALVE_FAULT')).toBe(false);
    });

    it('is not available with both valves stuck closed', async () => {
      const jettison = await createJettison();
      failures.add(A380Failure.FuelJettisonValveLeftStuckClosed);
      failures.add(A380Failure.FuelJettisonValveRightStuckClosed);
      updateOneSecond(jettison);
      expect(removedPounds()).toBe(0);
      expect(get('L:A380X_FUEL_JETTISON_NOT_AVAIL')).toBe(true);
      expect(get('L:A380X_FUEL_JETTISON_IN_PROGRESS')).toBe(false);
    });

    it('shows a valve stuck open (FUEL JETTISON VLV NOT CLOSED, OPEN light) without jettisoning', async () => {
      const jettison = await createJettison();
      failures.add(A380Failure.FuelJettisonValveRightStuckOpen);
      setConditions({ arm: false, active: false });
      updateOneSecond(jettison);
      expect(removedPounds()).toBe(0);
      expect(get('L:A380X_FUEL_JETTISON_VALVE_NOT_CLOSED')).toBe(true);
      expect(get('L:A380X_OVHD_FUEL_JETTISON_IS_OPEN')).toBe(true);
      expect(triggerKey.mock.calls).toEqual([
        ['FUELSYSTEM_VALVE_SET', true, 57, 0],
        ['FUELSYSTEM_VALVE_SET', true, 58, 1],
      ]);
    });
  });
});
