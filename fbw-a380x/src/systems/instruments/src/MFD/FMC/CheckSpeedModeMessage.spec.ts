// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';

import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';
import {
  CheckSpeedModeMessage,
  CheckSpeedModeMessageHost,
  hasSequencedConstantMachStart,
  isCheckSpeedModePhaseChange,
} from './CheckSpeedModeMessage';

const PFD_VAR = 'L:A32NX_PFD_MSG_CHECK_SPEED_MODE';

describe('CHECK SPD MODE flight phase changes', () => {
  it('CLIMB to CRUISE without a cruise speed preselection', () => {
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise, false)).toBe(true);
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise, true)).toBe(false);
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Descent, FmgcFlightPhase.Cruise, false)).toBe(false);
  });

  it('CLIMB or CRUISE to DESCENT', () => {
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent, false)).toBe(true);
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Climb, FmgcFlightPhase.Descent, false)).toBe(true);
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Approach, FmgcFlightPhase.Descent, false)).toBe(false);
  });

  it('not the other phase changes', () => {
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Takeoff, FmgcFlightPhase.Climb, false)).toBe(false);
    expect(isCheckSpeedModePhaseChange(FmgcFlightPhase.Descent, FmgcFlightPhase.Approach, false)).toBe(false);
  });
});

describe('CMS start waypoint sequenced', () => {
  const legs = ['A', 'B', 'CMS_START', 'D', 'E'];
  const legAt = (index: number) => legs[index];

  it('when the leg ending at the start waypoint was active and the next one is now', () => {
    expect(hasSequencedConstantMachStart('CMS_START', 3, 2, legAt)).toBe(true);
  });

  it('not before the start waypoint, nor after another leg, nor without a CMS or a previous leg', () => {
    expect(hasSequencedConstantMachStart('B', 2, 2, legAt)).toBe(false);
    expect(hasSequencedConstantMachStart('CMS_START', 2, 2, legAt)).toBe(false);
    expect(hasSequencedConstantMachStart('D', 4, 2, legAt)).toBe(false);
    expect(hasSequencedConstantMachStart('CMS_START', 3, null, legAt)).toBe(false);
    expect(hasSequencedConstantMachStart(null, 3, 2, legAt)).toBe(false);
  });
});

interface QueuedMessage {
  message: TypeIIMessage;
  cleared: boolean;
  onClear: () => void;
}

describe('CHECK SPD MODE message', () => {
  let speedSelected: boolean;
  let queue: QueuedMessage[];
  let message: CheckSpeedModeMessage;

  const host: CheckSpeedModeMessageHost = {
    isSpeedSelected: () => speedSelected,
    isSpeedManaged: () => !speedSelected,
    queuedMessage: () => queue.find((it) => it.message === NXSystemMessages.checkSpeedMode),
    addMessageToQueue: (added, onClear) => {
      queue = queue.filter((it) => !(it.message === added && it.cleared));
      queue.unshift({ message: added, cleared: false, onClear });
    },
    removeMessageFromQueue: (text) => {
      queue = queue.filter((it) => it.message.text !== text);
    },
  };

  const pfdShows = () => !!SimVar.GetSimVarValue(PFD_VAR, 'bool');

  beforeEach(() => {
    speedSelected = true;
    queue = [];
    message = new CheckSpeedModeMessage(host);
    SimVar.SetSimVarValue(PFD_VAR, 'bool', false);
  });

  it('comes up on the MFD and the PFD at CLIMB to CRUISE in selected speed, once', () => {
    message.onFlightPhaseChanged(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise, false);
    message.onFlightPhaseChanged(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent, false);
    expect(queue.length).toBe(1);
    expect(pfdShows()).toBe(true);
  });

  it('does not come up in managed speed, or with a cruise preselection', () => {
    message.onFlightPhaseChanged(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise, true);
    speedSelected = false;
    message.onFlightPhaseChanged(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent, false);
    expect(queue.length).toBe(0);
    expect(pfdShows()).toBe(false);
  });

  it('stays in selected speed and goes when the managed speed engages', () => {
    message.onFlightPhaseChanged(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent, false);
    message.update(null);
    expect(queue.length).toBe(1);
    speedSelected = false;
    message.update(null);
    expect(queue.length).toBe(0);
    expect(pfdShows()).toBe(false);
  });

  it('clearing it on the MFD removes the PFD message, and a new trigger shows it again', () => {
    message.onFlightPhaseChanged(FmgcFlightPhase.Climb, FmgcFlightPhase.Cruise, false);
    queue[0].cleared = true;
    queue[0].onClear();
    expect(pfdShows()).toBe(false);
    message.onFlightPhaseChanged(FmgcFlightPhase.Cruise, FmgcFlightPhase.Descent, false);
    expect(queue.length).toBe(1);
    expect(queue[0].cleared).toBe(false);
    expect(pfdShows()).toBe(true);
  });

  it('comes up when the aircraft sequences the CMS start waypoint in selected speed', () => {
    const allLegs = [{}, { constantMachSegment: { kind: 'start', mach: 0.85, endsAtTopOfDescent: true } }, {}].map(
      (leg) => ({ isDiscontinuity: false, ...leg }),
    );
    const flightPlan = { allLegs, activeLegIndex: 1, maybeElementAt: (index: number) => allLegs[index] };
    message.update(flightPlan as unknown as ReadonlyFlightPlan);
    expect(queue.length).toBe(0);
    flightPlan.activeLegIndex = 2;
    message.update(flightPlan as unknown as ReadonlyFlightPlan);
    expect(queue.length).toBe(1);
    expect(pfdShows()).toBe(true);
  });
});

describe('CHECK SPD MODE wiring', () => {
  const fmc = readFileSync(resolve(__dirname, 'FlightManagementComputer.ts'), 'utf-8');

  it('the FMS checks the phase changes to cruise and to descent', () => {
    const cruise = fmc.slice(
      fmc.indexOf('case FmgcFlightPhase.Cruise: {'),
      fmc.indexOf('case FmgcFlightPhase.Descent: {'),
    );
    expect(cruise).toContain(
      '#checkSpeedModeMessage.onFlightPhaseChanged(prevPhase, nextPhase, !!preselectedCruiseSpeed)',
    );
    expect(fmc).toContain('#checkSpeedModeMessage.onFlightPhaseChanged(prevPhase, nextPhase, false)');
  });

  it('the managed speed update checks the CMS start and the end of the selected speed each cycle', () => {
    const acInterface = readFileSync(resolve(__dirname, 'FmcAircraftInterface.ts'), 'utf-8');
    expect(acInterface).toContain('this.fmc.updateCheckSpeedModeMessage();');
    expect(fmc).toContain('#checkSpeedModeMessage.update(');
    // Without a resolved condition of its own: the message stays until the managed speed engages
    expect(fmc).toContain('this.addMessageToQueue(message, undefined, onClear)');
  });
});
