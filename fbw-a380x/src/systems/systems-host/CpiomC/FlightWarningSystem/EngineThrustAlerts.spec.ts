// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  THRUST_LOSS_PHASE_INHIBITION,
  TO_THRUST_DISAGREE_PHASE_INHIBITION,
  isEngineThrustLocked,
  isTakeoffThrustDisagree,
  isThrustLoss,
  thrustLossItemsChecked,
} from './EngineThrustAlerts';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

describe('ENG 1(2)(3)(4) THRUST LOSS', () => {
  it('triggers on the engine whose max THR is 10 % lower than at least two other engines', () => {
    // engine 2 with the max thrust miscalculation of the FADEC (85 %)
    const maxThr = [100, 85, 100, 100];
    expect(maxThr.map((_, index) => isThrustLoss(maxThr, index))).toEqual([false, true, false, false]);
  });

  it('triggers at exactly 10 % lower, not at 9 %', () => {
    expect(isThrustLoss([90, 100, 100, 100], 0)).toBe(true);
    expect(isThrustLoss([91, 100, 100, 100], 0)).toBe(false);
  });

  it('needs at least two other engines with a higher max THR', () => {
    // engines 1, 2 and 3 low: each one has only one engine (4) 10 % higher
    const threeLow = [85, 85, 85, 100];
    expect(threeLow.map((_, index) => isThrustLoss(threeLow, index))).toEqual([false, false, false, false]);
    // engines 1 and 2 low: both see engines 3 and 4 higher
    const twoLow = [85, 85, 100, 100];
    expect(twoLow.map((_, index) => isThrustLoss(twoLow, index))).toEqual([true, true, false, false]);
  });

  it('does not trigger with four healthy FADECs, nor before the FADECs send their max THR', () => {
    expect([0, 1, 2, 3].some((index) => isThrustLoss([100, 100, 100, 100], index))).toBe(false);
    expect([0, 1, 2, 3].some((index) => isThrustLoss([0, 0, 0, 0], index))).toBe(false);
  });

  it('checks THR LEVER IDLE and ENG MASTER OFF', () => {
    expect(thrustLossItemsChecked(false, true)).toEqual([false, false]);
    expect(thrustLossItemsChecked(true, false)).toEqual([true, true]);
  });

  it('is shown in phase 3 only', () => {
    const shown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (phase) => !THRUST_LOSS_PHASE_INHIBITION.includes(phase),
    );
    expect(shown).toEqual([3]);
  });
});

describe('ENG T.O THRUST DISAGREE', () => {
  it('triggers when the FADECs do not all have the same take-off mode', () => {
    // FADEC 4 without the FLEX TEMP: TOGA (0), the others FLEX (1)
    expect(isTakeoffThrustDisagree([1, 1, 1, 0])).toBe(true);
    expect(isTakeoffThrustDisagree([0, 1, 1, 1])).toBe(true);
  });

  it('does not trigger when all FADECs are in FLEX or all in TOGA', () => {
    expect(isTakeoffThrustDisagree([1, 1, 1, 1])).toBe(false);
    expect(isTakeoffThrustDisagree([0, 0, 0, 0])).toBe(false);
  });

  it('is shown in phases 2 and 11 only', () => {
    const shown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (phase) => !TO_THRUST_DISAGREE_PHASE_INHIBITION.includes(phase),
    );
    expect(shown).toEqual([2, 11]);
  });
});

describe('FWS wiring of the engine thrust alerts', () => {
  const { core, simVars } = createFws();
  const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];

  it('reads the max THR and the take-off mode of the four FADECs', () => {
    [100, 100, 100, 100].forEach((maxThr, index) => simVars.set(`L:A32NX_ENGINE_${index + 1}_FADEC_MAX_THR`, maxThr));
    simVars.set('L:A32NX_ENGINE_2_FADEC_MAX_THR', 50);
    simVars.set('L:A32NX_ENGINE_4_FADEC_TAKEOFF_MODE', 1);
    runFwsCycle(core);
    expect(core.engineThrustLoss.map((alert) => alert.get())).toEqual([false, true, false, false]);
    expect(core.takeoffThrustDisagree.get()).toBe(true);
  });

  it('raises ENG 1(2)(3)(4) THRUST LOSS (701800133-136) and ENG T.O THRUST DISAGREE (701800155)', () => {
    for (const engineIndex of [0, 1, 2, 3]) {
      const entry = sensed(701800133 + engineIndex);
      expect(entry.simVarIsActive).toBe(core.engineThrustLoss[engineIndex]);
      expect(entry.flightPhaseInhib).toEqual(THRUST_LOSS_PHASE_INHIBITION);
    }
    const disagree = sensed(701800155);
    expect(disagree.simVarIsActive).toBe(core.takeoffThrustDisagree);
    expect(disagree.flightPhaseInhib).toEqual(TO_THRUST_DISAGREE_PHASE_INHIBITION);
  });

  it('shows the THRUST LOSS lines of the aircraft', () => {
    for (const engine of [1, 2, 3, 4]) {
      const code = 701800132 + engine;
      const procedure = EcamAbnormalProcedures[code];
      expect(procedure.title).toContain(` ${engine} THRUST LOSS`);
      expect(procedure.items).toContainEqual({ name: `THR LEVER ${engine}`, sensed: true, labelNotCompleted: 'IDLE' });
      expect(procedure.items).toContainEqual({ name: `ENG ${engine} MASTER`, sensed: true, labelNotCompleted: 'OFF' });
      const entry = sensed(code);
      expect(entry.whichItemsToShow()).toEqual([true, true]);
      expect(entry.whichItemsChecked()).toEqual(
        thrustLossItemsChecked(
          (core as any)[`thrustLever${engine}Idle`].get(),
          !!(core as any)[`engine${engine}Master`].get(),
        ),
      );
    }
  });
});

describe('ENG THRUST LOCKED', () => {
  it('triggers on the A/THR thrust lock', () => {
    expect(isEngineThrustLocked(true, [false, false, false, false])).toBe(true);
  });

  it('triggers when a FADEC in DEGRADED mode keeps the thrust of the reversion', () => {
    expect(isEngineThrustLocked(false, [false, false, true, false])).toBe(true);
    expect(isEngineThrustLocked(false, [false, false, false, false])).toBe(false);
  });
});
