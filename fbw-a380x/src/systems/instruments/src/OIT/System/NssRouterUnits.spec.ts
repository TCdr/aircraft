// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OitSimvars } from '../OitSimvarPublisher';
import { AircraftNetworkServerUnit } from './AircraftNetworkServerUnit';
import { ARU_START_DURATION_MS, AruStartup, isNssAvncsAvailable } from './AnsuLogic';
import { AvncsRouterUnit, SecureInterfaceRouterUnit } from './NssRouterUnits';
import { SupplyHoldUp } from './NssRouterLogic';

const SIM_CLOCK_MS = 5_000_000;
const FRAME_MS = 500;

/** The busbars the OIT reads, by L:var; a missing one reads 0 */
type SimVars = Record<string, number>;

const ALL_BUSES_POWERED: SimVars = {
  'L:A32NX_ELEC_AC_1_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_AC_2_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_DC_1_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_DC_2_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED': 1,
};

/** The time of a cold start before the supply arrives, long enough for the first seconds of the flight to be over */
const COLD_START_MS = AruStartup.FLIGHT_LOAD_WINDOW_MS + 5_000;

/**
 * @param initialBuses the busbars that are powered
 * @returns the simulator variables as mocks, a bus, and a way to run frames of the units
 */
function setUp(initialBuses: SimVars = ALL_BUSES_POWERED) {
  const simVars: SimVars = { ...initialBuses };
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars[name] ?? 0);
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
    simVars[name] = Number(value);
    return Promise.resolve();
  });
  const bus = new EventBus();
  const clock = bus.getPublisher<ClockEvents>();
  const simvars = bus.getPublisher<OitSimvars>();
  let frame = 0;
  /**
   * Runs frames: the clock reads the placeholder 0 at the first frame and the sim clock from the second
   * @param units the units to update, in frame order
   * @param durationMs how long to run
   */
  const run = (units: { onUpdate(): void }[], durationMs: number) => {
    for (let elapsedMs = 0; elapsedMs < durationMs; elapsedMs += FRAME_MS) {
      clock.pub('simTime', frame === 0 ? 0 : SIM_CLOCK_MS + (frame - 1) * FRAME_MS);
      frame++;
      units.forEach((unit) => unit.onUpdate());
    }
  };
  return { simVars, bus, simvars, run };
}

describe('NSS AVNCS router units', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ARU 1 starts for the ARU start time after its busbars are supplied, then operates', () => {
    const { simVars, bus, run } = setUp({});
    const aru = new AvncsRouterUnit(bus, 1);
    aru.init();
    run([aru], COLD_START_MS);
    expect(aru.powered.get()).toBe(false);
    expect(aru.operating.get()).toBe(false);

    Object.assign(simVars, ALL_BUSES_POWERED);
    run([aru], ARU_START_DURATION_MS - 2 * FRAME_MS);
    expect(aru.powered.get()).toBe(true);
    expect(aru.operating.get()).toBe(false);
    expect(simVars['L:A32NX_NSS_ARU_1_IS_POWERED']).toBe(1);
    expect(simVars['L:A32NX_NSS_ARU_1_IS_OPERATING']).toBe(0);

    run([aru], 4 * FRAME_MS);
    expect(aru.operating.get()).toBe(true);
    expect(simVars['L:A32NX_NSS_ARU_1_IS_OPERATING']).toBe(1);
  });

  it('is already operating in a flight loaded with the aircraft powered', () => {
    const { bus, run } = setUp();
    const aru = new AvncsRouterUnit(bus, 2);
    aru.init();
    run([aru], 3 * FRAME_MS);
    expect(aru.operating.get()).toBe(true);
  });

  it('operates at once in a flight loaded powered whose busbars report late, as the FLT OPS ARU does', () => {
    // Only the battery busbars are present at the load; the AC and DC busbars report 20 s later, after the load window
    const { simVars, bus, run } = setUp({
      'L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED': 1,
      'L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED': 1,
    });
    const aru1 = new AvncsRouterUnit(bus, 1);
    const aru2 = new AvncsRouterUnit(bus, 2);
    const fltOpsAru = new AruStartup();
    aru1.init();
    aru2.init();
    run([aru1, aru2], 3 * FRAME_MS);
    expect(fltOpsAru.update(true, 3 * FRAME_MS)).toBe(true);
    expect(aru1.operating.get()).toBe(true);
    expect(aru2.operating.get()).toBe(true);

    run([aru1, aru2], 2 * AruStartup.FLIGHT_LOAD_WINDOW_MS);
    expect(aru1.operating.get()).toBe(true);
    expect(aru2.operating.get()).toBe(true);

    Object.assign(simVars, ALL_BUSES_POWERED);
    run([aru1, aru2], 3 * FRAME_MS);
    expect(aru1.operating.get()).toBe(true);
    expect(aru2.operating.get()).toBe(true);
  });

  it('with only the battery busbars after the load window, the router starts for the full ARU start time', () => {
    const { simVars, bus, run } = setUp({});
    const aru = new AvncsRouterUnit(bus, 1);
    aru.init();
    run([aru], COLD_START_MS);
    simVars['L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED'] = 1;
    run([aru], 3 * FRAME_MS);
    expect(aru.powered.get()).toBe(true);
    expect(aru.operating.get()).toBe(false);
  });

  it('is not assumed supplied after the busbars reported and the supply was lost', () => {
    const { simVars, bus, run } = setUp({
      'L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED': 1,
    });
    const aru = new AvncsRouterUnit(bus, 1);
    aru.init();
    run([aru], 3 * FRAME_MS);
    Object.assign(simVars, ALL_BUSES_POWERED);
    run([aru], 3 * FRAME_MS);

    simVars['L:A32NX_ELEC_AC_2_BUS_IS_POWERED'] = 0;
    simVars['L:A32NX_ELEC_DC_2_BUS_IS_POWERED'] = 0;
    run([aru], SupplyHoldUp.HOLD_MS + 2 * FRAME_MS);
    expect(aru.powered.get()).toBe(false);
    expect(aru.operating.get()).toBe(false);
  });

  it('ARU 1 stops with the loss of DC 2 alone, after the hold time, and ARU 2 keeps running', () => {
    const { simVars, bus, run } = setUp();
    const aru1 = new AvncsRouterUnit(bus, 1);
    const aru2 = new AvncsRouterUnit(bus, 2);
    aru1.init();
    aru2.init();
    run([aru1, aru2], 3 * FRAME_MS);

    simVars['L:A32NX_ELEC_DC_2_BUS_IS_POWERED'] = 0;
    run([aru1, aru2], SupplyHoldUp.HOLD_MS - 2 * FRAME_MS);
    expect(aru1.operating.get()).toBe(true);

    run([aru1, aru2], 4 * FRAME_MS);
    expect(aru1.powered.get()).toBe(false);
    expect(aru1.operating.get()).toBe(false);
    expect(simVars['L:A32NX_NSS_ARU_1_IS_OPERATING']).toBe(0);
    expect(aru2.operating.get()).toBe(true);
  });

  it('ARU 2 runs on AC EMER with DC 1', () => {
    const { simVars, bus, run } = setUp({
      'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED': 1,
      'L:A32NX_ELEC_DC_1_BUS_IS_POWERED': 1,
    });
    const aru2 = new AvncsRouterUnit(bus, 2);
    aru2.init();
    run([aru2], 3 * FRAME_MS);
    expect(aru2.operating.get()).toBe(true);
    expect(simVars['L:A32NX_NSS_ARU_2_IS_POWERED']).toBe(1);
  });

  it('the NSS MASTER sw OFF cuts the supply at once', () => {
    const { bus, simvars, run } = setUp();
    const aru = new AvncsRouterUnit(bus, 1);
    const siru = new SecureInterfaceRouterUnit(bus);
    aru.init();
    siru.init();
    run([aru, siru], 3 * FRAME_MS);
    expect(aru.operating.get()).toBe(true);
    expect(siru.powered.get()).toBe(true);

    simvars.pub('nssMasterOff', true);
    run([aru, siru], FRAME_MS);
    expect(aru.powered.get()).toBe(false);
    expect(aru.operating.get()).toBe(false);
    expect(siru.powered.get()).toBe(false);
  });

  it('the SIRU has its supply with AC 1 and DC 1 only and publishes it', () => {
    const { simVars, bus, run } = setUp({ 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED': 1 });
    const siru = new SecureInterfaceRouterUnit(bus);
    siru.init();
    run([siru], 3 * FRAME_MS);
    expect(siru.powered.get()).toBe(false);
    expect(simVars['L:A32NX_NSS_SIRU_IS_POWERED']).toBe(0);

    simVars['L:A32NX_ELEC_DC_1_BUS_IS_POWERED'] = 1;
    run([siru], FRAME_MS);
    expect(siru.powered.get()).toBe(true);
    expect(simVars['L:A32NX_NSS_SIRU_IS_POWERED']).toBe(1);
  });
});

describe('NSS AVNCS ANSU behind its router', () => {
  afterEach(() => vi.restoreAllMocks());

  const failures = { isActive: () => false, register: () => {}, update: () => {} } as unknown as FailuresConsumer;

  it('is healthy for the applications only while its router operates', () => {
    const { simVars, bus, run } = setUp();
    const routerOperating = Subject.create(true);
    const ansu = new AircraftNetworkServerUnit(bus, 1, 'nss-avncs', failures, routerOperating);
    ansu.init();
    run([ansu], 3 * FRAME_MS);
    expect(simVars['L:A32NX_NSS_ANSU_1_IS_HEALTHY']).toBe(1);

    routerOperating.set(false);
    run([ansu], FRAME_MS);
    expect(simVars['L:A32NX_NSS_ANSU_1_IS_HEALTHY']).toBe(0);

    routerOperating.set(true);
    run([ansu], FRAME_MS);
    expect(simVars['L:A32NX_NSS_ANSU_1_IS_HEALTHY']).toBe(1);
  });

  it('keeps its data while only its router is lost, and loses it with a power loss', () => {
    const { simVars, bus, run } = setUp();
    const routerOperating = Subject.create(true);
    const ansu = new AircraftNetworkServerUnit(bus, 1, 'nss-avncs', failures, routerOperating);
    const reset = vi.spyOn(ansu, 'reset');
    ansu.init();
    run([ansu], 3 * FRAME_MS);

    routerOperating.set(false);
    run([ansu], 3 * FRAME_MS);
    expect(reset).not.toHaveBeenCalled();

    simVars['L:A32NX_ELEC_AC_2_BUS_IS_POWERED'] = 0;
    simVars['L:A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED'] = 0;
    run([ansu], FRAME_MS);
    expect(reset).toHaveBeenCalled();
  });

  it('the NSS AVNCS applications stay available through ANSU 2 while ARU 1 is lost', () => {
    const { simVars, bus, run } = setUp();
    const router1Operating = Subject.create(false);
    const ansu1 = new AircraftNetworkServerUnit(bus, 1, 'nss-avncs', failures, router1Operating);
    const ansu2 = new AircraftNetworkServerUnit(bus, 2, 'nss-avncs', failures, Subject.create(true));
    ansu1.init();
    ansu2.init();
    run([ansu1, ansu2], 3 * FRAME_MS);
    expect(
      isNssAvncsAvailable(simVars['L:A32NX_NSS_ANSU_1_IS_HEALTHY'] > 0, simVars['L:A32NX_NSS_ANSU_2_IS_HEALTHY'] > 0),
    ).toBe(true);
    expect(simVars['L:A32NX_NSS_ANSU_1_IS_HEALTHY']).toBe(0);
  });

  it('needs no router on the FLT OPS side', () => {
    const { simVars, bus, run } = setUp();
    const ansu = new AircraftNetworkServerUnit(bus, 1, 'flt-ops', failures);
    ansu.init();
    run([ansu], 3 * FRAME_MS);
    expect(simVars['L:A32NX_FLTOPS_ANSU_1_IS_HEALTHY']).toBe(1);
  });
});
