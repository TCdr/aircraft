// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn } from '../../../../../fbw-a32nx/src/behavior/RpnTestInterpreter';
import { A380Failure, A380FailureDefinitions } from '@failures';
import {
  AUTO_UNLOCK_DELAY_S,
  AUTO_UNLOCK_DURATION_S,
  CockpitDoorEmergencyAccessLogic,
  KEYPAD_INHIBITION_AFTER_LOCK_S,
} from './CockpitDoorEmergencyAccess';

/** Runs the logic for `seconds` in 1 s steps, the inputs unchanged */
function run(
  logic: CockpitDoorEmergencyAccessLogic,
  seconds: number,
  request: boolean,
  selections: number,
  locked = true,
) {
  let result = logic.update(1, request, selections, locked);
  for (let s = 1; s < seconds; s++) {
    result = logic.update(1, request, selections, locked);
  }
  return result;
}

describe('cockpit door emergency access', () => {
  it('the emergency code starts DOOR CKPT DOOR EMER OPENING IN PROGRESS', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    expect(logic.update(0.1, false, 0, true).emerOpeningInProgress).toBe(false);
    expect(logic.update(0.1, true, 0, true)).toEqual({ emerOpeningInProgress: true, commandLocked: null });
  });

  it('CKPT DOOR sw to UNLOCK ends it, with no lock command', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 4, true);
    run(logic, 10, true, 4);
    expect(logic.update(0.1, true, 5, false)).toEqual({ emerOpeningInProgress: false, commandLocked: null });
  });

  it('CKPT DOOR sw to LOCK ends it and inhibits the keypad for a while', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 0, true);
    expect(logic.update(0.1, true, 1, true).emerOpeningInProgress).toBe(false);
    // a new code entry during the inhibition is ignored
    logic.update(0.1, false, 1, true);
    expect(logic.update(0.1, true, 1, true).emerOpeningInProgress).toBe(false);
    run(logic, KEYPAD_INHIBITION_AFTER_LOCK_S, false, 1);
    expect(logic.update(0.1, true, 1, true).emerOpeningInProgress).toBe(true);
  });

  it('without an answer the door unlocks by itself after the delay, then locks again 5 s later', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 0, true);
    expect(run(logic, AUTO_UNLOCK_DELAY_S - 1, true, 0).emerOpeningInProgress).toBe(true);
    expect(logic.update(1, true, 0, true)).toEqual({ emerOpeningInProgress: false, commandLocked: false });
    expect(run(logic, AUTO_UNLOCK_DURATION_S - 1, true, 0, false).commandLocked).toBe(null);
    expect(logic.update(1, true, 0, false).commandLocked).toBe(true);
  });

  it('an UNLOCK answer does not inhibit the keypad: a new code starts a new sequence at once', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 0, true);
    logic.update(0.1, true, 1, false);
    logic.update(0.1, false, 1, false);
    expect(logic.update(0.1, true, 1, false).emerOpeningInProgress).toBe(true);
  });

  it('a CKPT DOOR selection while the door is unlocked by itself cancels the automatic lock', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 0, true);
    expect(run(logic, AUTO_UNLOCK_DELAY_S, true, 0).commandLocked).toBe(false);
    logic.update(1, true, 1, false);
    expect(run(logic, AUTO_UNLOCK_DURATION_S + 5, true, 1, false).commandLocked).toBe(null);
  });

  it('a request held on does not start a new one after the end', () => {
    const logic = new CockpitDoorEmergencyAccessLogic();
    logic.update(0.1, true, 0, true);
    logic.update(0.1, true, 1, false);
    expect(run(logic, 60, true, 1, false).emerOpeningInProgress).toBe(false);
  });

  it('is triggered by the flyPad ATA 52 entry, and the CKPT DOOR sw counts its selections', () => {
    expect(A380FailureDefinitions.find(([, id]) => id === A380Failure.CockpitDoorEmergencyAccessRequest)).toEqual([
      52,
      52330,
      'Cockpit door emergency access request (cabin crew)',
    ]);
    const template = readFileSync(
      resolve(
        __dirname,
        '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/legacy/Airbus.xml',
      ),
      'utf-8',
    );
    // the CKPT DOOR sw positions 0 (UNLOCK) and 2 (LOCK) run these codes: run them from a switch count of 3
    const codeOfPosition = (position: number) =>
      new RegExp(`<CODE_POS_${position}>([^<]*COCKPIT_DOOR_LOCKED[^<]*)</CODE_POS_${position}>`).exec(template)?.[1] ??
      '';
    const finalValue = (position: number, target: string) =>
      runRpn(codeOfPosition(position), { 'L:A32NX_COCKPIT_DOOR_SW_SELECTIONS': 3 })
        .writes.filter((write) => write.target.includes(target))
        .map((write) => write.value)
        .pop();
    expect(finalValue(0, 'COCKPIT_DOOR_LOCKED')).toBe(0);
    expect(finalValue(2, 'COCKPIT_DOOR_LOCKED')).toBe(1);
    expect(finalValue(0, 'COCKPIT_DOOR_SW_SELECTIONS')).toBe(4);
    expect(finalValue(2, 'COCKPIT_DOOR_SW_SELECTIONS')).toBe(4);
  });
});
