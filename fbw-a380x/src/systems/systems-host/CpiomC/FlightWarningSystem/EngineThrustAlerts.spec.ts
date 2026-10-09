// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  THRUST_LOSS_PHASE_INHIBITION,
  TO_THRUST_DISAGREE_PHASE_INHIBITION,
  isTakeoffThrustDisagree,
  isThrustLoss,
  thrustLossItemsChecked,
} from './EngineThrustAlerts';

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) THRUST LOSS, a380_fcom.txt l.173388-173390 */
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

  it('is shown in phase 3 only (FCOM PDF page 5822)', () => {
    const shown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (phase) => !THRUST_LOSS_PHASE_INHIBITION.includes(phase),
    );
    expect(shown).toEqual([3]);
  });
});

/* A380 FCOM PRO-ABN-ECAM-10-70 ENG T.O THRUST DISAGREE, a380_fcom.txt l.175060 */
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

  it('is shown in phases 2 and 11 only (FCOM PDF page 5857)', () => {
    const shown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (phase) => !TO_THRUST_DISAGREE_PHASE_INHIBITION.includes(phase),
    );
    expect(shown).toEqual([2, 11]);
  });
});

describe('FWS wiring of the engine thrust alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf8');
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf8',
  );

  it('reads the max THR and the take-off mode of the four FADECs', () => {
    expect(core).toContain('L:A32NX_ENGINE_${engineNumber}_FADEC_MAX_THR');
    expect(core).toContain('L:A32NX_ENGINE_${engineNumber}_FADEC_TAKEOFF_MODE');
  });

  it('raises ENG 1(2)(3)(4) THRUST LOSS (701800133-136) and ENG T.O THRUST DISAGREE (701800155)', () => {
    for (const code of [701800133, 701800134, 701800135, 701800136, 701800155]) {
      expect(abnormalSensed).toMatch(new RegExp(`${code}: \\{\\s*// ENG [1-4T]`));
    }
    expect(abnormalSensed.match(/simVarIsActive: this\.fws\.engineThrustLoss\[[0-3]\]/g)).toHaveLength(4);
    expect(abnormalSensed).toContain('simVarIsActive: this.fws.takeoffThrustDisagree');
  });

  it('shows the THRUST LOSS lines of the FCOM', () => {
    for (const engine of [1, 2, 3, 4]) {
      const code = 701800132 + engine;
      const procedure = ata70.slice(ata70.indexOf(`${code}: {`), ata70.indexOf(`${code + 1}: {`));
      expect(procedure).toContain(` ${engine} THRUST LOSS',`);
      expect(procedure).toContain(`{ name: 'THR LEVER ${engine}', sensed: true, labelNotCompleted: 'IDLE' }`);
      expect(procedure).toContain(`{ name: 'ENG ${engine} MASTER', sensed: true, labelNotCompleted: 'OFF' }`);
    }
  });
});
