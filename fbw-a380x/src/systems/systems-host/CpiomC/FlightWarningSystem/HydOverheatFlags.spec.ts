// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { isEnginePumpsTurnOffUnsuccessful, isHydSystemOverheat } from './HydOverheatFlags';

/* HYD G (Y) SYS OVHT: the reservoir is above 95 C, or an engine pump case drain is above 120 C */
describe('HYD SYS OVHT trigger', () => {
  it('is raised by the reservoir overheat', () => {
    expect(isHydSystemOverheat(true, [false, false, false, false])).toBe(true);
  });

  it('is raised by the overheat of any engine pump of the system (case drain term)', () => {
    expect(isHydSystemOverheat(false, [false, false, true, false])).toBe(true);
  });

  it('is not raised without an overheat', () => {
    expect(isHydSystemOverheat(false, [false, false, false, false])).toBe(false);
  });

  describe('in the FWS', () => {
    const overheatOf = (simVar: string) => {
      const { core, simVars } = createFws(new Set());
      simVars.set(simVar, true);
      runFwsCycle(core);
      return [core.greenRsvOverheat.get(), core.yellowRsvOverheat.get()];
    };

    it.each([
      ['L:A32NX_HYD_GREEN_RESERVOIR_OVHT', [true, false]],
      ['L:A32NX_HYD_GREEN_1A_EDPUMP_OVHT', [true, false]],
      ['L:A32NX_HYD_GREEN_1B_EDPUMP_OVHT', [true, false]],
      ['L:A32NX_HYD_GREEN_2A_EDPUMP_OVHT', [true, false]],
      ['L:A32NX_HYD_GREEN_2B_EDPUMP_OVHT', [true, false]],
      ['L:A32NX_HYD_YELLOW_RESERVOIR_OVHT', [false, true]],
      ['L:A32NX_HYD_YELLOW_3A_EDPUMP_OVHT', [false, true]],
      ['L:A32NX_HYD_YELLOW_3B_EDPUMP_OVHT', [false, true]],
      ['L:A32NX_HYD_YELLOW_4A_EDPUMP_OVHT', [false, true]],
      ['L:A32NX_HYD_YELLOW_4B_EDPUMP_OVHT', [false, true]],
    ])('is fed by %s: [green, yellow] SYS OVHT %j', (simVar, expected) => {
      expect(overheatOf(simVar)).toEqual(expected);
    });
  });

  describe('ENG PMP A+B DISC line in the FWS: the pump pressure switch is read at 2 500 PSI', () => {
    it.each([
      ['GREEN', 1, 'eng1PumpsOffUnsuccessful'],
      ['GREEN', 2, 'eng1PumpsOffUnsuccessful'],
      ['GREEN', 3, 'eng2PumpsOffUnsuccessful'],
      ['GREEN', 4, 'eng2PumpsOffUnsuccessful'],
      ['YELLOW', 1, 'eng3PumpsOffUnsuccessful'],
      ['YELLOW', 2, 'eng3PumpsOffUnsuccessful'],
      ['YELLOW', 3, 'eng4PumpsOffUnsuccessful'],
      ['YELLOW', 4, 'eng4PumpsOffUnsuccessful'],
    ])('%s pump %i keeping its pressure with ENG PMP OFF shows %s', (color, pump, signal) => {
      const { core, simVars } = createFws(new Set());
      const signals = core as unknown as Record<string, Subject<boolean>>;
      runFwsCycle(core);
      // all pumps OFF and depressurised
      expect(signals[signal].get()).toBe(false);
      simVars.set(`L:A32NX_HYD_${color}_PUMP_${pump}_SECTION_PRESSURE_SWITCH`, true);
      runFwsCycle(core);
      expect(signals[signal].get()).toBe(true);
    });
  });
});

/* The DISC line shows only when turning off ENG PMP A or B did not depressurise it */
describe('HYD SYS OVHT: ENG PMP A+B DISC line', () => {
  it('is hidden before the pumps are turned off', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(true, true, true, true)).toBe(false);
  });

  it('is hidden when both pumps depressurised once OFF', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(false, false, false, false)).toBe(false);
  });

  it('is shown when a pump OFF keeps its pressure', () => {
    expect(isEnginePumpsTurnOffUnsuccessful(false, true, false, false)).toBe(true);
    expect(isEnginePumpsTurnOffUnsuccessful(false, false, false, true)).toBe(true);
  });
});
