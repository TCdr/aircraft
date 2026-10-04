// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { FailableFuelSwitch, FailableFuelSwitchesDriver, FuelSwitchAccess } from './failable-fuel-switches';

/**
 * MSFS fuel switches: a switch changes at the next frame after a key event, a valve travels towards its switch position
 * in 3 s and a pump runs while its switch is on, whatever their circuit (what the sim does).
 */
class FakeMsfsSwitches implements FuelSwitchAccess {
  public readonly lVars = new Map<string, boolean>();

  public readonly switchOn = new Map<number, boolean>();

  public readonly travel = new Map<number, number>();

  public readonly commands: [number, boolean][] = [];

  private readonly pendingKeyEvents: [number, boolean][] = [];

  isSelected(selectionVar: string): boolean {
    return this.lVars.get(selectionVar) ?? false;
  }

  setSelected(selectionVar: string, on: boolean): void {
    this.lVars.set(selectionVar, on);
  }

  isSwitchOn(index: number): boolean {
    return this.switchOn.get(index) ?? false;
  }

  position(index: number): number {
    return this.travel.get(index) ?? 0;
  }

  command(index: number, on: boolean): void {
    this.commands.push([index, on]);
    this.keyEvent(index, on);
  }

  /** A K:FUELSYSTEM_* event, from the driver or from anything else */
  keyEvent(index: number, on: boolean): void {
    this.pendingKeyEvents.push([index, on]);
  }

  /** Sets a switch and its position, as a loaded flight does */
  load(index: number, on: boolean): void {
    this.switchOn.set(index, on);
    this.travel.set(index, on ? 1 : 0);
  }

  /** One sim frame: the key events take effect and the valves travel (OpeningTime 3 s) */
  frame(deltaTimeMs: number): void {
    for (const [index, on] of this.pendingKeyEvents.splice(0)) {
      this.switchOn.set(index, on);
    }
    for (const [index, on] of this.switchOn) {
      const step = deltaTimeMs / 3000;
      const position = this.position(index);
      this.travel.set(index, on ? Math.min(1, position + step) : Math.max(0, position - step));
    }
  }
}

const activeFailures = new Set<number>();
let sim: FakeMsfsSwitches;
let driver: FailableFuelSwitchesDriver;

/** Runs the sim and the driver (100 ms period, as the A32NX systems host) for some time */
const run = (durationMs: number) => {
  for (let time = 0; time < durationMs; time += 100) {
    sim.frame(100);
    driver.update(100);
  }
};

const setUp = (switches: FailableFuelSwitch[]) => {
  activeFailures.clear();
  sim = new FakeMsfsSwitches();
  driver = new FailableFuelSwitchesDriver(switches, (failure) => activeFailures.has(failure), sim);
};

describe('FailableFuelSwitchesDriver, valve jammed in place (A32NX X FEED valve)', () => {
  const FAILURE = 28004;
  const VALVE = 3;
  const PB = 'L:TEST_XFEED_PB_IS_ON';

  /** The X FEED pushbutton is pressed: the behaviour XML toggles the selection L:var */
  const pressPb = () => sim.lVars.set(PB, !sim.isSelected(PB));

  beforeEach(() => setUp([{ failure: FAILURE, index: VALVE, effect: 'jam', selectionVar: PB }]));

  it('takes the valve switch of a loaded flight as the crew selection, without moving the valve', () => {
    sim.lVars.set(PB, false);
    sim.load(VALVE, true);
    run(1000);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.commands).toEqual([]);
    expect(sim.position(VALVE)).toBe(1);
  });

  it('opens the valve when the pushbutton is set ON and closes it when OFF, without failure', () => {
    run(200);
    pressPb();
    run(3500);
    expect(sim.isSwitchOn(VALVE)).toBe(true);
    expect(sim.position(VALVE)).toBe(1);
    expect(sim.isSelected(PB)).toBe(true);

    pressPb();
    run(3500);
    expect(sim.isSwitchOn(VALVE)).toBe(false);
    expect(sim.position(VALVE)).toBe(0);
    expect(sim.isSelected(PB)).toBe(false);
  });

  it('keeps a valve jammed closed closed when the pushbutton is set ON, the pushbutton staying ON', () => {
    run(200);
    activeFailures.add(FAILURE);
    run(200);
    pressPb();
    run(5000);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.isSwitchOn(VALVE)).toBe(false);
    expect(sim.position(VALVE)).toBe(0);
    expect(sim.commands).toEqual([]);
  });

  it('keeps a valve jammed open open when the pushbutton is set OFF', () => {
    run(200);
    pressPb();
    run(3500);
    activeFailures.add(FAILURE);
    run(200);
    pressPb();
    run(5000);
    expect(sim.isSelected(PB)).toBe(false);
    expect(sim.position(VALVE)).toBe(1);
  });

  it('moves a repaired valve to the pushbutton selection', () => {
    run(200);
    activeFailures.add(FAILURE);
    run(200);
    pressPb();
    run(1000);
    activeFailures.clear();
    run(3500);
    expect(sim.position(VALVE)).toBe(1);
    expect(sim.isSelected(PB)).toBe(true);
  });

  it('jams a valve caught in travel at its nearest end', () => {
    run(200);
    pressPb();
    run(1000); // about a third open
    activeFailures.add(FAILURE);
    run(3000);
    expect(sim.position(VALVE)).toBe(0);
    expect(sim.isSelected(PB)).toBe(true);
  });

  it('takes a valve key event from outside (hardware panel, checklist) as the crew selection', () => {
    run(200);
    sim.keyEvent(VALVE, true);
    run(3500);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.position(VALVE)).toBe(1);
    expect(sim.commands).toEqual([]);
  });

  it('commands a jammed valve back when a key event from outside moves its switch, taking it as the selection', () => {
    run(200);
    activeFailures.add(FAILURE);
    run(200);
    sim.keyEvent(VALVE, true);
    run(3000);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.isSwitchOn(VALVE)).toBe(false);
    expect(sim.position(VALVE)).toBe(0);
  });
});

describe('FailableFuelSwitchesDriver, failed pump with a selection L:var (A32NX wing tank pump)', () => {
  const FAILURE = 28001;
  const PUMP = 5;
  const PB = 'L:TEST_PUMP_5_PB_IS_ON';

  beforeEach(() => setUp([{ failure: FAILURE, index: PUMP, effect: 'off', selectionVar: PB }]));

  it('takes the pump switch of a loaded flight as the selection and follows the pushbutton without failure', () => {
    sim.load(PUMP, true);
    run(200);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.commands).toEqual([]);

    sim.lVars.set(PB, false);
    run(200);
    expect(sim.isSwitchOn(PUMP)).toBe(false);
  });

  it('switches a failed pump off, its pushbutton staying ON, and back on once repaired', () => {
    sim.load(PUMP, true);
    run(200);
    activeFailures.add(FAILURE);
    run(200);
    expect(sim.isSwitchOn(PUMP)).toBe(false);
    expect(sim.isSelected(PB)).toBe(true);

    run(2000);
    expect(sim.isSwitchOn(PUMP)).toBe(false);
    expect(sim.isSelected(PB)).toBe(true);

    activeFailures.clear();
    run(1000);
    expect(sim.isSwitchOn(PUMP)).toBe(true);
  });

  it('keeps a failed pump off when an aircraft preset switches it on, taking it as the selection', () => {
    sim.load(PUMP, false);
    run(200);
    activeFailures.add(FAILURE);
    run(200);
    sim.keyEvent(PUMP, true);
    run(1000);
    expect(sim.isSelected(PB)).toBe(true);
    expect(sim.isSwitchOn(PUMP)).toBe(false);
  });
});

describe('FailableFuelSwitchesDriver, failed pump without a selection L:var (A380X feed pump)', () => {
  const FAILURE = 28014;
  const PUMP = 5;

  beforeEach(() => setUp([{ failure: FAILURE, index: PUMP, effect: 'off' }]));

  it('leaves the pump switch alone without failure', () => {
    sim.load(PUMP, true);
    run(2000);
    expect(sim.commands).toEqual([]);
  });

  it('switches a failed pump off and back to its previous position once repaired', () => {
    sim.load(PUMP, true);
    run(200);
    activeFailures.add(FAILURE);
    run(1000);
    expect(sim.isSwitchOn(PUMP)).toBe(false);

    activeFailures.clear();
    run(1000);
    expect(sim.isSwitchOn(PUMP)).toBe(true);
    expect(sim.commands).toEqual([
      [PUMP, false],
      [PUMP, true],
    ]);
  });
});
