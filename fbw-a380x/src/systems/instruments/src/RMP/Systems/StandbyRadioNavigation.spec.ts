// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, HEvent } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RmpState,
  RmpStateControllerEvents,
} from '../../../../../../../fbw-common/src/systems/instruments/src/RMP/Systems';
import { KeypadController, KeypadEvents, SystemKeys } from './KeypadController';
import {
  hasStandbyRadioNavigation,
  isStandbyRadioNavigationActive,
  returnsToVhfPage,
  StandbyRadioNavigationEvents,
  standbyRadioNavigationAfterKeyPress,
  StandbyRadioNavigationManager,
} from './StandbyRadioNavigation';

/*
 * RMP 1 or RMP 2 switched to STBY RAD NAV mode with the STBY RAD NAV key tune the navaids; RMP 3 is never used for
 * navaids tuning. After the deactivation of the mode the RMP display defaults to the VHF page.
 */
describe('STBY RAD NAV rules', () => {
  it('RMP 1 and RMP 2 only', () => {
    expect([1, 2, 3].map(hasStandbyRadioNavigation)).toEqual([true, true, false]);
  });

  it('each key press switches the mode on or off, RMP 3 stays off', () => {
    expect(standbyRadioNavigationAfterKeyPress(1, false)).toBe(true);
    expect(standbyRadioNavigationAfterKeyPress(1, true)).toBe(false);
    expect(standbyRadioNavigationAfterKeyPress(2, false)).toBe(true);
    expect(standbyRadioNavigationAfterKeyPress(3, false)).toBe(false);
  });

  it('active only on an RMP that is on', () => {
    expect(isStandbyRadioNavigationActive(true, RmpState.On)).toBe(true);
    for (const state of [RmpState.OffFailed, RmpState.OffStandby, RmpState.OnFailed]) {
      expect(isStandbyRadioNavigationActive(true, state)).toBe(false);
    }
    expect(isStandbyRadioNavigationActive(false, RmpState.On)).toBe(false);
  });

  it('back to the VHF page at the deactivation only', () => {
    expect(returnsToVhfPage(true, false)).toBe(true);
    expect(returnsToVhfPage(false, true)).toBe(false);
    expect(returnsToVhfPage(false, false)).toBe(false);
    expect(returnsToVhfPage(true, true)).toBe(false);
  });
});

describe('STBY RAD NAV key (KeypadController + StandbyRadioNavigationManager)', () => {
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
   * Creates the keypad controller and the STBY RAD NAV manager of one RMP on a new bus.
   * @param rmpIndex the RMP number
   * @returns the key and RMP state inputs, the mode and the system keys published
   */
  function setup(rmpIndex: 1 | 2 | 3): {
    pressKey: () => void;
    setState: (state: RmpState) => void;
    active: () => boolean;
    systemKeys: SystemKeys[];
  } {
    const bus = new EventBus();
    const _keypad = new KeypadController(bus, rmpIndex);
    const _manager = new StandbyRadioNavigationManager(bus, rmpIndex);
    const systemKeys: SystemKeys[] = [];
    bus
      .getSubscriber<KeypadEvents>()
      .on('keypad_system_key_pressed')
      .handle((key) => systemKeys.push(key));
    let active = false;
    bus
      .getSubscriber<StandbyRadioNavigationEvents>()
      .on('rmp_stby_rad_nav_active')
      .handle((v) => (active = v));
    const pub = bus.getPublisher<HEvent & RmpStateControllerEvents>();
    return {
      // the H events of rmp.xml FBW_A380X_RMP_Button STBY_RAD_NAV
      pressKey: () => {
        pub.pub('hEvent', `RMP_${rmpIndex}_STBY_RAD_NAV_PRESSED`);
        pub.pub('hEvent', `RMP_${rmpIndex}_STBY_RAD_NAV_RELEASED`);
      },
      setState: (state) => pub.pub('rmp_state', state),
      active: () => active,
      systemKeys,
    };
  }
  const light = (rmpIndex: number): number => Number(SimVar.GetSimVarValue(`L:A380X_RMP_${rmpIndex}_STBY_NAV`, 'bool'));

  it('the H event is a system key', () => {
    const rmp = setup(1);
    rmp.setState(RmpState.On);
    rmp.pressKey();
    expect(rmp.systemKeys).toEqual([SystemKeys.StandbyRadNav]);
  });

  it('RMP 1: the key switches the mode and its light on, then off', () => {
    const rmp = setup(1);
    rmp.setState(RmpState.On);
    rmp.pressKey();
    expect(rmp.active()).toBe(true);
    expect(light(1)).toBe(1);
    rmp.pressKey();
    expect(rmp.active()).toBe(false);
    expect(light(1)).toBe(0);
  });

  it('RMP 2: the mode is lost while the RMP is failed and comes back with it', () => {
    const rmp = setup(2);
    rmp.setState(RmpState.On);
    rmp.pressKey();
    expect(light(2)).toBe(1);
    rmp.setState(RmpState.OnFailed);
    expect(light(2)).toBe(0);
    rmp.setState(RmpState.On);
    expect(light(2)).toBe(1);
  });

  it('RMP 3: no STBY RAD NAV', () => {
    const rmp = setup(3);
    rmp.setState(RmpState.On);
    rmp.pressKey();
    expect(rmp.active()).toBe(false);
    expect(light(3)).toBe(0);
  });
});
