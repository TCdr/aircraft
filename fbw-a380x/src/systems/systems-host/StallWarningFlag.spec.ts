// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AdcPublisher, ConsumerValue, EventBus, InstrumentBackplane, StallWarningPublisher } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sim variables of a test. The SDK publishers do not call SimVar.GetSimVarValue: they register each simvar once
 * (SimVar.GetRegisteredId) and read it by id through simvar.getValueReg, with a Bool simvar turned into a boolean.
 * Both are mocked here the way the sim answers them; GetSimVarValue (STALL ALPHA, read once by the stall publisher)
 * reads the same values.
 */
const simVars = new Map<string, number | boolean>();
const registeredNames: string[] = [];

const STALL_ALPHA_DEGREES = 18;
const UPDATE_STEP_MS = 50;

let now = 0;

/**
 * Builds the chain the way SystemsHost does: the AdcPublisher field first, the stall publisher second (so the stall
 * publisher's own 'aoa' / 'on_ground' subscriptions arrive after the AdcPublisher exists), both added to the backplane
 * in that order, backplane.init() starts the publishers. The consumer is created later, as FwsCore does.
 */
function buildChain(withAdcPublisher: boolean) {
  const bus = new EventBus();
  const backplane = new InstrumentBackplane();
  const adcPublisher = new AdcPublisher(bus);
  const stallWarningPublisher = new StallWarningPublisher(bus, 0.9);
  if (withAdcPublisher) {
    backplane.addPublisher('Adc', adcPublisher);
  }
  backplane.addPublisher('StallWarning', stallWarningPublisher);
  backplane.init();
  const stallWarning = ConsumerValue.create(
    bus.getSubscriber<{ stall_warning_on: boolean }>().on('stall_warning_on'),
    false,
  );

  /** Runs the host's per-frame backplane update for the given simulated time. */
  const run = (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += UPDATE_STEP_MS) {
      now += UPDATE_STEP_MS;
      backplane.onUpdate();
    }
  };
  return { stallWarning, run };
}

const setFlight = (angleOfAttackDegrees: number, onGround: number | boolean) => {
  simVars.set('INCIDENCE ALPHA', angleOfAttackDegrees);
  simVars.set('SIM ON GROUND', onGround);
};

describe('the MSFS SDK stall warning chain as the A380X systems host wires it', () => {
  beforeEach(() => {
    simVars.clear();
    registeredNames.length = 0;
    now = 1_000_000;
    simVars.set('STALL ALPHA', STALL_ALPHA_DEGREES);
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'GetRegisteredId').mockImplementation((name: string) => {
      if (!registeredNames.includes(name)) {
        registeredNames.push(name);
      }
      return registeredNames.indexOf(name);
    });
    // the coherent global the jest setup defines, not part of the typings
    const coherentSimvar = (globalThis as unknown as { simvar: { getValueReg: (id: number) => number } }).simvar;
    vi.spyOn(coherentSimvar, 'getValueReg').mockImplementation((id) => Number(simVars.get(registeredNames[id]) ?? 0));
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('raises the flag above 90 % of the stall angle of attack when airborne, once the debounce has passed', () => {
    setFlight(25, 0);
    const { stallWarning, run } = buildChain(true);
    run(200);
    expect(stallWarning.get()).toBe(false);
    run(1000);
    expect(stallWarning.get()).toBe(true);
  });

  it('works with the on-ground simvar as a boolean as well as 0/1', () => {
    setFlight(25, false);
    const { stallWarning, run } = buildChain(true);
    run(1200);
    expect(stallWarning.get()).toBe(true);
  });

  it('stays false below the threshold when airborne', () => {
    setFlight(10, 0);
    const { stallWarning, run } = buildChain(true);
    run(2000);
    expect(stallWarning.get()).toBe(false);
  });

  it('stays false at a high angle of attack on the ground', () => {
    setFlight(25, 1);
    const { stallWarning, run } = buildChain(true);
    run(2000);
    expect(stallWarning.get()).toBe(false);
  });

  it('stays false without the AdcPublisher on the backplane (the bug this fix addresses)', () => {
    setFlight(25, 0);
    const { stallWarning, run } = buildChain(false);
    run(2000);
    expect(stallWarning.get()).toBe(false);
  });

  it('drops the flag again when the angle of attack falls below the threshold', () => {
    setFlight(25, 0);
    const { stallWarning, run } = buildChain(true);
    run(1200);
    expect(stallWarning.get()).toBe(true);
    setFlight(10, 0);
    run(200);
    expect(stallWarning.get()).toBe(false);
  });

  it('reads the stall angle of attack only once, when the publisher is built', () => {
    // A zero STALL ALPHA at host start-up (before the aircraft is loaded) makes every airborne angle of attack a stall
    simVars.set('STALL ALPHA', 0);
    setFlight(2, 0);
    const { stallWarning, run } = buildChain(true);
    simVars.set('STALL ALPHA', STALL_ALPHA_DEGREES);
    run(1200);
    expect(stallWarning.get()).toBe(true);
  });
});
