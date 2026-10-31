// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { A320Failure } from '@failures';
import { DoorFailures, DoorFailuresSource } from './DoorFailures';

/** A failures consumer with the given failures active. */
function failures(active: Set<number>): DoorFailuresSource {
  return { register: () => {}, update: () => {}, isActive: (id: number) => active.has(id) };
}

let simVars: Map<string, any>;
let writes: number;

const flag = (name: string): boolean => simVars.get(name) === true;

describe('DoorFailures (A32NX ATA 52 door proximity sensors and cockpit door locking system)', () => {
  const { GetSimVarValue, SetSimVarValue } = SimVar;

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
    SimVar.SetSimVarValue = SetSimVarValue;
  });

  beforeEach(() => {
    simVars = new Map<string, any>();
    writes = 0;
    SimVar.GetSimVarValue = (name: string) => simVars.get(name) ?? 0;
    SimVar.SetSimVarValue = (name: string, _unit: string, value: any) => {
      simVars.set(name, value);
      writes++;
      return Promise.resolve();
    };
  });

  it('publishes no fault without failures', () => {
    const system = new DoorFailures(failures(new Set()));
    system.init();
    system.onUpdate();
    expect([...simVars.values()].some((value) => value === true)).toBe(false);
    expect(flag('L:A32NX_CDLS_FAULT')).toBe(false);
  });

  it('publishes the failed proximity sensor of an avionics compartment access door', () => {
    const active = new Set<number>([A320Failure.RightForwardAvionicsDoorProximitySensor]);
    const system = new DoorFailures(failures(active));
    system.init();
    system.onUpdate();
    expect(flag('L:A32NX_DOOR_R_FWD_AVIONICS_PROX_SENSOR_FAULT')).toBe(true);
    expect(flag('L:A32NX_DOOR_L_FWD_AVIONICS_PROX_SENSOR_FAULT')).toBe(false);
    expect(flag('L:A32NX_DOOR_R_AFT_AVIONICS_PROX_SENSOR_FAULT')).toBe(false);
  });

  it('publishes the failed proximity sensor of its door only', () => {
    const active = new Set<number>([A320Failure.RightAftCabinDoorProximitySensor]);
    const system = new DoorFailures(failures(active));
    system.init();
    system.onUpdate();
    expect(flag('L:A32NX_DOOR_R_AFT_CABIN_PROX_SENSOR_FAULT')).toBe(true);
    expect(flag('L:A32NX_DOOR_L_AFT_CABIN_PROX_SENSOR_FAULT')).toBe(false);
    expect(flag('L:A32NX_DOOR_FWD_CARGO_PROX_SENSOR_FAULT')).toBe(false);

    active.clear();
    system.onUpdate();
    expect(flag('L:A32NX_DOOR_R_AFT_CABIN_PROX_SENSOR_FAULT')).toBe(false);
  });

  // the CDLS lights: the pedestal FAULT light, the three strikes and the two pressure sensors
  it.each([
    [A320Failure.CockpitDoorUpperLatch, 'L:A32NX_CDLS_UPPER_LATCH_FAULT'],
    [A320Failure.CockpitDoorMidLatch, 'L:A32NX_CDLS_MID_LATCH_FAULT'],
    [A320Failure.CockpitDoorLowerLatch, 'L:A32NX_CDLS_LOWER_LATCH_FAULT'],
    [A320Failure.CockpitDoorPressureSensor1, 'L:A32NX_CDLS_PRESSURE_SENSOR_1_FAULT'],
    [A320Failure.CockpitDoorPressureSensor2, 'L:A32NX_CDLS_PRESSURE_SENSOR_2_FAULT'],
  ])('failure %s lights its status light %s and the pedestal FAULT light', (failure, statusLight) => {
    const system = new DoorFailures(failures(new Set([failure])));
    system.init();
    system.onUpdate();
    expect(flag(statusLight)).toBe(true);
    expect(flag('L:A32NX_CDLS_FAULT')).toBe(true);
    const statusLights = [...simVars.keys()].filter(
      (name) => name.startsWith('L:A32NX_CDLS_') && name !== 'L:A32NX_CDLS_FAULT',
    );
    expect(statusLights.filter((name) => flag(name))).toEqual([statusLight]);
  });

  it('a failed control unit lights the pedestal FAULT light only', () => {
    const system = new DoorFailures(failures(new Set([A320Failure.CockpitDoorControlUnit])));
    system.init();
    system.onUpdate();
    expect(flag('L:A32NX_CDLS_FAULT')).toBe(true);
    expect(flag('L:A32NX_CDLS_UPPER_LATCH_FAULT')).toBe(false);
    expect(flag('L:A32NX_CDLS_PRESSURE_SENSOR_1_FAULT')).toBe(false);
  });

  it('writes an L:var only when it changes', () => {
    const system = new DoorFailures(failures(new Set()));
    system.init();
    system.onUpdate();
    const firstWrites = writes;
    system.onUpdate();
    expect(writes).toBe(firstWrites);
  });
});
