// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { Tyre, TYRES } from '../../../../shared/src/TyrePressures';
import {
  isWheelTyreLoPr,
  TyrePressureAlertInputs,
  WHEEL_TYRE_LO_PR_CODES,
  WHEEL_TYRE_LO_PR_LEVEL,
  WHEEL_TYRE_LO_PR_PHASE_INHIBITION,
} from './TyrePressureAlerts';

/** TPIS installed, every tyre at its nominal pressure (main 200, nose 180 PSI), on the ground (phase 1) */
const normal: TyrePressureAlertInputs = {
  tpisInstalled: true,
  pressuresPsi: TYRES.map((tyre) => (tyre >= Tyre.Nose1 ? 180 : 200)),
  nominal: { mainPsi: 200, nosePsi: 180 },
  fwcFlightPhase: 1,
};

/** The inputs with some tyre pressures changed (index = Tyre) */
function withPressures(
  changes: Partial<Record<Tyre, number | null>>,
  others: Partial<TyrePressureAlertInputs> = {},
): TyrePressureAlertInputs {
  return {
    ...normal,
    ...others,
    pressuresPsi: normal.pressuresPsi.map((pressure, tyre) =>
      tyre in changes ? changes[tyre as Tyre] ?? null : pressure,
    ),
  };
}

/** The visible texts of formatted lines, without the colour codes */
// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '').split('\r');

describe('WHEEL TYRE LO PR', () => {
  it('is not triggered with every tyre at its nominal pressure', () => {
    expect(isWheelTyreLoPr(normal)).toBe(false);
  });

  it('triggers on one tyre below 89 % of nominal outside liftoff to engines shutdown', () => {
    // a deflated left nose tyre (flyPad failure 32304) on the ground: 89 % of 180 = 160.2 PSI
    expect(isWheelTyreLoPr(withPressures({ [Tyre.Nose1]: 160, [Tyre.Nose2]: 160 }))).toBe(true);
    expect(isWheelTyreLoPr(withPressures({ [Tyre.Nose1]: 161, [Tyre.Nose2]: 161 }))).toBe(false);
  });

  it('triggers on one tyre below 74 % of nominal between liftoff and engines shutdown', () => {
    // 74 % of 200 = 148 PSI, both tyres of the axle low so that the axle difference does not trigger
    const lowAxle = { [Tyre.Main3]: 150, [Tyre.Main4]: 150 };
    expect(isWheelTyreLoPr(withPressures(lowAxle, { fwcFlightPhase: 6 }))).toBe(false);
    expect(isWheelTyreLoPr(withPressures(lowAxle, { fwcFlightPhase: 10 }))).toBe(true);
    expect(isWheelTyreLoPr(withPressures({ [Tyre.Main3]: 147, [Tyre.Main4]: 147 }, { fwcFlightPhase: 6 }))).toBe(true);
  });

  it('triggers on an axle difference above 15 % (other cases) or 21 % (liftoff to shutdown) of nominal', () => {
    const difference = { [Tyre.Main1]: 215, [Tyre.Main2]: 180 }; // 35 PSI: above 30, below 42, none low
    expect(isWheelTyreLoPr(withPressures(difference, { fwcFlightPhase: 2 }))).toBe(true);
    expect(isWheelTyreLoPr(withPressures(difference, { fwcFlightPhase: 7 }))).toBe(false);
  });

  it('needs the TPIS installed (flyPad aircraft option)', () => {
    expect(isWheelTyreLoPr(withPressures({ [Tyre.Main1]: 0 }, { tpisInstalled: false }))).toBe(false);
    expect(isWheelTyreLoPr(withPressures({ [Tyre.Main1]: 0 }))).toBe(true);
  });

  it('is not triggered by TPIS data that is not valid (DC BUS 1 lost: failure warning SSM)', () => {
    expect(isWheelTyreLoPr({ ...normal, pressuresPsi: TYRES.map(() => null) })).toBe(false);
  });

  it('is a level 2 crew awareness caution inhibited in phases 3, 4, 5 and 8', () => {
    expect(WHEEL_TYRE_LO_PR_LEVEL).toBe(2);
    expect(WHEEL_TYRE_LO_PR_PHASE_INHIBITION).toEqual([3, 4, 5, 8]);
    expect(formatEwdMessages(WHEEL_TYRE_LO_PR_CODES).map((line) => visible(line).join('').trim())).toEqual([
      'WHEEL TYRE LO PR',
    ]);
  });

  it('is raised by PseudoFWC from the TPIS pressures and the flyPad option, with the WHEEL SD page', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('TyrePressure.isWheelTyreLoPr({');
    expect(fwc).toContain('Arinc429Word.fromSimVarValue(tyrePressureVar(tyre))');
    expect(fwc).toContain('TPIS_INSTALLED_SETTING,');
    const start = fwc.indexOf('3200490: {');
    const entry = fwc.slice(start, fwc.indexOf('\n    },', start));
    expect(entry).toContain('flightPhaseInhib: TyrePressure.WHEEL_TYRE_LO_PR_PHASE_INHIBITION');
    expect(entry).toContain('simVarIsActive: this.wheelTyreLoPr');
    expect(entry).toContain('codesToReturn: TyrePressure.WHEEL_TYRE_LO_PR_CODES');
    expect(entry).toContain('failure: TyrePressure.WHEEL_TYRE_LO_PR_LEVEL');
    expect(entry).toContain('sysPage: EcamSysPage.WHEEL');
    expect(entry).not.toContain('statusInfo');
    expect(entry).not.toContain('inopSys');
  });
});
