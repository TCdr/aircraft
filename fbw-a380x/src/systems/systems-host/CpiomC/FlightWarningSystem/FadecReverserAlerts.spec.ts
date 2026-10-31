// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import {
  FADEC_FAULT_PHASE_INHIBITION,
  THR_LEVER_FAULT_PHASE_INHIBITION,
  REVERSER_UNLOCKED_PHASE_INHIBITION,
  REVERSER_SELECTED_PHASE_INHIBITION,
  fadecFaultItemsChecked,
  fadecFaultItemsShown,
  isReverserInoperative,
  isReverserSelectedInFlight,
  isThrLeverInClimbDetent,
  REVERSER_INHIBITED_PHASE_INHIBITION,
  REVERSER_MAINTENANCE_ALERTS_LEVEL,
  REVERSER_MINOR_FAULT_PHASE_INHIBITION,
  reverserInopItemsShown,
  reverserSelectedItemsShown,
  reverserUnlockedItemsChecked,
  reverserUnlockedItemsShown,
  thrLeverFaultInfo,
  thrLeverFaultItemsChecked,
  thrLeverFaultItemsShown,
} from './FadecReverserAlerts';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const itemCount = (key: number) => EcamAbnormalProcedures[key].items.length;

describe('ENG FADEC FAULT', () => {
  it('asks to adjust the thrust lever by hand only with the A/THR engaged', () => {
    expect(fadecFaultItemsShown(true)).toEqual([true, true, true, true, true]);
    expect(fadecFaultItemsShown(false)).toEqual([false, true, true, true, true]);
    expect(fadecFaultItemsShown(false)).toHaveLength(itemCount(701800013));
  });

  it('checks the lever at idle and the master off', () => {
    expect(fadecFaultItemsChecked(true, false)).toEqual([false, false, false, true, false]);
    expect(fadecFaultItemsChecked(true, true)).toEqual([false, false, false, true, true]);
  });
});

describe('ENG THR LEVER FAULT', () => {
  it('is IDLE ONLY on ground and CLB ONLY in flight', () => {
    expect(thrLeverFaultItemsShown(true, false)).toEqual([true, true, false, false]);
    expect(thrLeverFaultItemsShown(false, false)).toEqual([false, false, true, true]);
  });

  it('adds the landing distance line for the engines with a reverser', () => {
    expect(thrLeverFaultItemsShown(false, true)).toEqual([false, false, true, true, true]);
    expect(thrLeverFaultItemsShown(false, true)).toHaveLength(itemCount(701800130));
    expect(thrLeverFaultItemsShown(false, false)).toHaveLength(itemCount(701800129));
    expect(thrLeverFaultItemsChecked(false, true, true)).toEqual([false, false, false, true, false]);
  });

  it('reads the CL detent', () => {
    expect(isThrLeverInClimbDetent(25)).toBe(true);
    expect(isThrLeverInClimbDetent(35)).toBe(false);
  });

  it('gives the STATUS INFO IDLE ONLY on ground, CLB ONLY in flight', () => {
    expect(thrLeverFaultInfo(true, true)).toEqual({ idleOnly: true, clbOnly: false });
    expect(thrLeverFaultInfo(true, false)).toEqual({ idleOnly: false, clbOnly: true });
    expect(thrLeverFaultInfo(false, false)).toEqual({ idleOnly: false, clbOnly: false });
  });
});

describe('ENG 2(3) reverser alerts', () => {
  it('checks the takeoff performance before takeoff only', () => {
    expect(reverserInopItemsShown(true)).toEqual([true, true]);
    expect(reverserInopItemsShown(false)).toEqual([false, true]);
    for (const key of [701800137, 701800141, 701800145]) {
      expect(reverserInopItemsShown(true)).toHaveLength(itemCount(key));
    }
  });

  it('REVERSER UNLOCKED shuts the engine down on ground, and in flight if buffet', () => {
    expect(reverserUnlockedItemsShown(true)).toEqual([true, true, true, false, false]);
    expect(reverserUnlockedItemsShown(false)).toEqual([true, true, false, true, true]);
    expect(reverserUnlockedItemsShown(false)).toHaveLength(itemCount(701800149));
    expect(reverserUnlockedItemsChecked(true, true)).toEqual([false, true, true, false, true]);
  });

  it('REVERSER SELECTED triggers in flight only, with the lever line of the selected reversers', () => {
    expect(isReverserSelectedInFlight(-6, false)).toBe(true);
    expect(isReverserSelectedInFlight(-6, true)).toBe(false);
    expect(isReverserSelectedInFlight(0, false)).toBe(false);
    expect(reverserSelectedItemsShown(true, false)).toEqual([true, false, false]);
    expect(reverserSelectedItemsShown(true, true)).toEqual([false, false, true]);
    expect(reverserSelectedItemsShown(true, true)).toHaveLength(itemCount(701800154));
  });

  it('makes the reverser inoperative with a fault, a control fault, a failed lock or a thrust lever fault', () => {
    expect(isReverserInoperative(false, false, false, false, false)).toBe(false);
    expect(isReverserInoperative(true, false, false, false, false)).toBe(true);
    expect(isReverserInoperative(false, true, false, false, false)).toBe(true);
    expect(isReverserInoperative(false, false, true, false, false)).toBe(true);
    expect(isReverserInoperative(false, false, false, true, false)).toBe(true);
  });

  /* ENG 2(3) REVERSER INHIBITED and REVERSER MINOR FAULT */
  it('makes the reverser inoperative when it is inhibited by maintenance (INOP SYS ENG 2(3) REVERSER, BTV)', () => {
    expect(isReverserInoperative(false, false, false, false, true)).toBe(true);
  });

  it('REVERSER INHIBITED checks the takeoff performance before takeoff, as REVERSER LOCKED', () => {
    for (const key of [701800143, 701800144]) {
      expect(reverserInopItemsShown(true)).toHaveLength(itemCount(key));
    }
  });

  it('REVERSER INHIBITED and MINOR FAULT: no audio, no master light, the inhibitions of the aircraft', () => {
    expect(REVERSER_MAINTENANCE_ALERTS_LEVEL).toBe(1);
    expect(REVERSER_INHIBITED_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    // Shown only after landing: phases 1 to 10 inhibited
    expect(REVERSER_MINOR_FAULT_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('FwsAbnormalSensed wiring of the FADEC, thrust lever and reverser alerts', () => {
  const { core, simVars } = createFws();
  const sensed = (key: number) => core.abnormalSensed.ewdAbnormalSensed[key];

  it('wires every alert as an amber caution', () => {
    const keys = [
      [701800013, 701800014, 701800015, 701800016],
      [701800021, 701800022, 701800023, 701800024],
      [701800025, 701800026, 701800027, 701800028],
      [701800129, 701800130, 701800131, 701800132],
      [701800137, 701800138, 701800139, 701800140, 701800141, 701800142],
      [701800145, 701800146, 701800149, 701800150, 701800154],
    ].reduce((all, group) => all.concat(group), []);
    for (const key of keys) {
      expect(sensed(key).failure, `${key}`).toBe(2);
    }
  });

  it('wires REVERSER INHIBITED and REVERSER MINOR FAULT from the reverser variables', () => {
    for (const reverserIndex of [0, 1]) {
      expect(sensed(701800143 + reverserIndex).simVarIsActive).toBe(core.reverserInhibited[reverserIndex]);
      expect(sensed(701800147 + reverserIndex).simVarIsActive).toBe(core.reverserMinorFault[reverserIndex]);
    }
    simVars.set('L:A32NX_REVERSER_2_INHIBITED', 1);
    simVars.set('L:A32NX_REVERSER_3_MINOR_FAULT', 1);
    runFwsCycle(core);
    expect(core.reverserInhibited.map((alert) => alert.get())).toEqual([true, false]);
    expect(core.reverserMinorFault.map((alert) => alert.get())).toEqual([false, true]);
    // an inhibited reverser is inoperative
    expect(core.reverserFailureInop[0].get()).toBe(true);
    expect(core.reverserFailureInop[1].get()).toBe(false);
  });

  it('uses the flight phase inhibitions', () => {
    expect(sensed(701800013).flightPhaseInhib).toEqual(FADEC_FAULT_PHASE_INHIBITION);
    expect(sensed(701800130).flightPhaseInhib).toEqual(THR_LEVER_FAULT_PHASE_INHIBITION);
    expect(sensed(701800149).flightPhaseInhib).toEqual(REVERSER_UNLOCKED_PHASE_INHIBITION);
    expect(sensed(701800154).flightPhaseInhib).toEqual(REVERSER_SELECTED_PHASE_INHIBITION);
  });
});
