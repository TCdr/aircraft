// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioControlManager } from './AudioControlManager';
import { KeypadEvents, SystemKeys } from './KeypadController';
import { NO_TRANSMISSION, transmissionAfterKeyPressed, transmissionAfterKeyReleased } from './TransmissionKeys';

/*
 * A380 FCOM DSC-23-20 INT(CAB)(PA) transmission key (a380_fcom.txt l.48050-48063): one transmission key at a time in
 * transmission mode; "To make an announcement on the PA, the flight crew must press and maintain the PA transmission key
 * during the announcement." Before, the PA key latched on its first press like the other keys.
 */
describe('RMP transmission keys (pure rules)', () => {
  it('a press selects a key and deselects the others, a second press deselects it', () => {
    const vhf1 = transmissionAfterKeyPressed(NO_TRANSMISSION, SystemKeys.Vhf1Call);
    expect(vhf1.active).toBe(SystemKeys.Vhf1Call);
    const vhf2 = transmissionAfterKeyPressed(vhf1, SystemKeys.Vhf2Call);
    expect(vhf2.active).toBe(SystemKeys.Vhf2Call);
    expect(transmissionAfterKeyPressed(vhf2, SystemKeys.Vhf2Call).active).toBeNull();
  });

  it('PA is in transmission mode only while held, then the previous key comes back', () => {
    const vhf1 = transmissionAfterKeyPressed(NO_TRANSMISSION, SystemKeys.Vhf1Call);
    const paHeld = transmissionAfterKeyPressed(vhf1, SystemKeys.PaCall);
    expect(paHeld.active).toBe(SystemKeys.PaCall);
    expect(transmissionAfterKeyReleased(paHeld, SystemKeys.PaCall).active).toBe(SystemKeys.Vhf1Call);
  });

  it('PA with no key selected before: none after the release', () => {
    const paHeld = transmissionAfterKeyPressed(NO_TRANSMISSION, SystemKeys.PaCall);
    expect(transmissionAfterKeyReleased(paHeld, SystemKeys.PaCall).active).toBeNull();
  });

  it('a key selected while PA is held stays selected after the PA release', () => {
    const paHeld = transmissionAfterKeyPressed(
      transmissionAfterKeyPressed(NO_TRANSMISSION, SystemKeys.Vhf1Call),
      SystemKeys.PaCall,
    );
    const cab = transmissionAfterKeyPressed(paHeld, SystemKeys.CabCall);
    expect(transmissionAfterKeyReleased(cab, SystemKeys.PaCall).active).toBe(SystemKeys.CabCall);
  });

  it('the release of a latching key changes nothing', () => {
    const vhf1 = transmissionAfterKeyPressed(NO_TRANSMISSION, SystemKeys.Vhf1Call);
    expect(transmissionAfterKeyReleased(vhf1, SystemKeys.Vhf1Call)).toEqual(vhf1);
  });
});

describe('RMP AudioControlManager PA key', () => {
  /** The sim variables of a test (the SimVar functions may be the sim's own, reading 0 in the tests) */
  const simVars = new Map<string, number | boolean>();
  beforeEach(() => {
    simVars.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * Creates the audio control manager of RMP 1 on a new bus.
   * @returns the key press and release inputs
   */
  function setup(): { press: (key: SystemKeys) => void; release: (key: SystemKeys) => void } {
    const bus = new EventBus();
    const manager = new AudioControlManager(bus, 1);
    manager.init();
    const pub = bus.getPublisher<KeypadEvents>();
    return {
      press: (key) => pub.pub('keypad_system_key_pressed', key),
      release: (key) => pub.pub('keypad_system_key_released', key),
    };
  }
  const read = (name: string): number => Number(SimVar.GetSimVarValue(name, 'bool'));

  it('PA TX is on while the PA key is held and off at the release', () => {
    const { press, release } = setup();
    press(SystemKeys.PaCall);
    expect(read('L:A380X_RMP_1_PA_TX')).toBe(1);
    release(SystemKeys.PaCall);
    expect(read('L:A380X_RMP_1_PA_TX')).toBe(0);
  });

  it('VHF 1 TX comes back after the PA announcement', () => {
    const { press, release } = setup();
    press(SystemKeys.Vhf1Call);
    release(SystemKeys.Vhf1Call);
    expect(read('L:A380X_RMP_1_VHF_TX_1')).toBe(1);

    press(SystemKeys.PaCall);
    expect(read('L:A380X_RMP_1_VHF_TX_1')).toBe(0);
    expect(read('L:A380X_RMP_1_PA_TX')).toBe(1);

    release(SystemKeys.PaCall);
    expect(read('L:A380X_RMP_1_PA_TX')).toBe(0);
    expect(read('L:A380X_RMP_1_VHF_TX_1')).toBe(1);
  });

  it('the latching keys and the VOICE key are unchanged', () => {
    const { press, release } = setup();
    press(SystemKeys.Voice);
    release(SystemKeys.Voice);
    press(SystemKeys.CabCall);
    release(SystemKeys.CabCall);
    expect(read('L:A380X_RMP_1_CAB_TX')).toBe(1);
    expect(read('L:A380X_RMP_1_NAV_FILTER')).toBe(1);

    press(SystemKeys.CabCall);
    expect(read('L:A380X_RMP_1_CAB_TX')).toBe(0);
    expect(read('L:A380X_RMP_1_NAV_FILTER')).toBe(1);
  });
});
