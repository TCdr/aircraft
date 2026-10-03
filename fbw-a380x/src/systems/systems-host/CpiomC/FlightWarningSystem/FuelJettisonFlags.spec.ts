// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { MappedSubject, Subject, SubscribableMapFunctions } from '@microsoft/msfs-sdk';
import { readFuelJettisonFlags } from './FuelJettisonFlags';

/** The L:vars as SimVar.GetSimVarValue(..., Bool) returns them: numbers, 1 for on */
const lvars =
  (on: string[]) =>
  (name: string): number =>
    on.includes(name) ? 1 : 0;

describe('readFuelJettisonFlags (FWS inputs from the FQMS, A380 FCOM PRO-ABN-ECAM-10-28)', () => {
  it('gives real booleans for the L:vars that are on', () => {
    const flags = readFuelJettisonFlags(
      lvars(['L:A380X_FUEL_JETTISON_L_VALVE_FAULT', 'L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON']),
    );
    expect(flags.leftValveFault).toBe(true);
    expect(flags.armPbOn).toBe(true);
    expect(flags.rightValveFault).toBe(false);
    expect(flags.notAvailable).toBe(false);
  });

  // FwsCore combines the faults with SubscribableMapFunctions.or(), which only counts `true` (input.includes(true)):
  // fed with the number 1, FUEL JETTISON FAULT and its STATUS INOP SYS JETTISON never came on (sim test 2026-10-02)
  it.each([
    ['one valve stuck closed', ['L:A380X_FUEL_JETTISON_L_VALVE_FAULT']],
    ['both valves stuck closed', ['L:A380X_FUEL_JETTISON_L_VALVE_FAULT', 'L:A380X_FUEL_JETTISON_R_VALVE_FAULT']],
    ['jettison not available', ['L:A380X_FUEL_JETTISON_NOT_AVAIL']],
  ])('raises FUEL JETTISON FAULT through the FWS or() with %s', (_, on) => {
    const flags = readFuelJettisonFlags(lvars(on));
    const fault = MappedSubject.create(
      SubscribableMapFunctions.or(),
      Subject.create(flags.notAvailable),
      Subject.create(flags.leftValveFault),
      Subject.create(flags.rightValveFault),
    );
    expect(fault.get()).toBe(true);
  });

  it('raises no fault when nothing is failed', () => {
    const flags = readFuelJettisonFlags(lvars([]));
    expect([flags.notAvailable, flags.leftValveFault, flags.rightValveFault, flags.valveNotClosed]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
