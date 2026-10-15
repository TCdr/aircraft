// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { describe, expect, it } from 'vitest';
import {
  ALL_AIR_DATA_ITEM_ADR_PBS_OFF,
  ALL_AIR_DATA_ITEM_SPEED_BRAKES,
  AirDataAlertInputs,
  FwsAirDataAlerts,
  readAirDataAlertInputs,
} from './FwsAirDataAlerts';

function inputs(overrides: Partial<AirDataAlertInputs> = {}): AirDataAlertInputs {
  return {
    adrRejected: [false, false, false],
    stbyRejected: false,
    allRejected: false,
    aoaRejected: [false, false, false],
    altitudeFt: 35_000,
    thrustLeverAboveClimb: false,
    adrPbOn: [true, true, true],
    ...overrides,
  };
}

function alertsWith(overrides: Partial<AirDataAlertInputs>): FwsAirDataAlerts {
  const alerts = new FwsAirDataAlerts();
  alerts.update(inputs(overrides));
  return alerts;
}

/** The item names of one procedure of ata34.ts, read from the source text (importing EcamMessages in a test fails) */
function procedureItemNames(id: string): string[] {
  const source = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34.ts'),
    'utf-8',
  );
  const start = source.indexOf(`  ${id}: {`);
  expect(start).toBeGreaterThan(0);
  const block = source.slice(start, source.indexOf('\n  },', start));
  return [...block.matchAll(/\{ name: '([^']+)'/g)].map((match) => match[1]);
}

describe('NAV AIR DATA DISAGREE / ALL AIR DATA DISAGREE / AOA DISAGREE triggers (A380 FCOM PRO-ABN-ECAM-10-34-10)', () => {
  it('nothing without a rejection', () => {
    const alerts = alertsWith({});
    expect(alerts.airDataDisagree.get()).toBe(false);
    expect(alerts.allAirDataDisagree.get()).toBe(false);
    expect(alerts.aoaDisagree.get()).toBe(false);
  });

  it.each([[{ adrRejected: [false, true, false] as [boolean, boolean, boolean] }], [{ stbyRejected: true }]])(
    'one source rejected by the PRIMs: AIR DATA DISAGREE',
    (overrides) => {
      const alerts = alertsWith(overrides);
      expect(alerts.airDataDisagree.get()).toBe(true);
      expect(alerts.allAirDataDisagree.get()).toBe(false);
    },
  );

  it('all air data rejected: ALL AIR DATA DISAGREE only', () => {
    const alerts = alertsWith({ allRejected: true, adrRejected: [true, true, true], stbyRejected: true });
    expect(alerts.allAirDataDisagree.get()).toBe(true);
    expect(alerts.airDataDisagree.get()).toBe(false);
  });

  it('one rejected AOA gives no NAV alert (FCOM l.136361-136362), two give AOA DISAGREE', () => {
    expect(alertsWith({ aoaRejected: [false, false, true] }).aoaDisagree.get()).toBe(false);
    expect(alertsWith({ aoaRejected: [true, true, false] }).aoaDisagree.get()).toBe(true);
  });
});

describe('NAV AIR DATA DISAGREE lines', () => {
  it('has one display rule per line of ata34.ts', () => {
    expect(alertsWith({}).airDataDisagreeItemsToShow()).toHaveLength(procedureItemNames('340800009').length);
  });

  it('shows the rejected ADR, AIR DATA XCHECK and AIR DATA SWTG', () => {
    const shown = alertsWith({ adrRejected: [false, true, false] }).airDataDisagreeItemsToShow();
    expect(shown).toEqual([false, true, false, false, false, true, true]);
  });

  it('two sources rejected: RISK OF UNDUE OVERSPEED WARNING; standby alone: no AIR DATA SWTG', () => {
    const two = alertsWith({ adrRejected: [true, false, false], stbyRejected: true });
    expect(two.airDataDisagreeItemsToShow()).toEqual([true, false, false, true, true, true, true]);
    expect(two.twoSourcesRejected()).toBe(true);
    expect(alertsWith({ stbyRejected: true }).airDataDisagreeItemsToShow()).toEqual([
      false,
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('NAV ALL AIR DATA DISAGREE lines: "The ECAM displays only the appropriate pitch"', () => {
  const names = procedureItemNames('340800010');
  const shownLines = (overrides: Partial<AirDataAlertInputs>) => {
    const shown = alertsWith({ allRejected: true, ...overrides }).allAirDataDisagreeItemsToShow();
    return names.filter((_name, index) => shown[index]);
  };
  const lineIndex = (name: string, occurrence = 0) =>
    names.map((n, i) => (n === name ? i : -1)).filter((i) => i >= 0)[occurrence];

  it('has one display rule per line of ata34.ts', () => {
    expect(alertsWith({ allRejected: true }).allAirDataDisagreeItemsToShow()).toHaveLength(names.length);
    expect(names[ALL_AIR_DATA_ITEM_SPEED_BRAKES]).toBe('SPEED BRAKES');
    expect(names[ALL_AIR_DATA_ITEM_ADR_PBS_OFF]).toBe('ADR 1+2+3 P/Bs');
  });

  it('before thrust reduction below 10 000 ft: TOGA and 12.5°, the below FL 250 actions', () => {
    const alerts = alertsWith({ allRejected: true, thrustLeverAboveClimb: true, altitudeFt: 3_000 });
    const shown = alerts.allAirDataDisagreeItemsToShow();
    expect(shown[lineIndex('ALL THR LEVERS', 0)]).toBe(true); // TOGA
    expect(shown[lineIndex('ALL THR LEVERS', 1)]).toBe(false); // CLB
    expect(shown[lineIndex('PITCH ATT TRGT', 0)]).toBe(true); // 12.5°
    expect(shown[lineIndex('PITCH ATT TRGT', 1)]).toBe(false);
    expect(shown[lineIndex('PITCH ATT TRGT', 2)]).toBe(false);
    expect(shownLines({ thrustLeverAboveClimb: true, altitudeFt: 3_000 })).toContain('ADR 1+2+3 P/Bs');
    expect(shownLines({ thrustLeverAboveClimb: true, altitudeFt: 3_000 })).not.toContain('FLY PITCH AND THRUST');
  });

  it('before thrust reduction above 10 000 ft: 10°', () => {
    const shown = alertsWith({
      allRejected: true,
      thrustLeverAboveClimb: true,
      altitudeFt: 27_000,
    }).allAirDataDisagreeItemsToShow();
    expect([0, 1, 2].map((n) => shown[lineIndex('PITCH ATT TRGT', n)])).toEqual([false, true, false]);
  });

  it('after thrust reduction above 25 000 ft: CLB, 5°, fly pitch and thrust', () => {
    const shown = alertsWith({ allRejected: true, altitudeFt: 37_000 }).allAirDataDisagreeItemsToShow();
    expect(shown[lineIndex('ALL THR LEVERS', 0)]).toBe(false);
    expect(shown[lineIndex('ALL THR LEVERS', 1)]).toBe(true);
    expect([0, 1, 2].map((n) => shown[lineIndex('PITCH ATT TRGT', n)])).toEqual([false, false, true]);
    expect(shownLines({ altitudeFt: 37_000 })).toContain('FLY PITCH AND THRUST');
    expect(shownLines({ altitudeFt: 37_000 })).not.toContain('ADR 1+2+3 P/Bs');
  });

  it('after thrust reduction between 10 000 ft and 25 000 ft: 10°', () => {
    const shown = alertsWith({ allRejected: true, altitudeFt: 18_000 }).allAirDataDisagreeItemsToShow();
    expect([0, 1, 2].map((n) => shown[lineIndex('PITCH ATT TRGT', n)])).toEqual([false, true, false]);
  });

  it('SPEED BRAKES and ADR 1+2+3 P/Bs are sensed', () => {
    const alerts = alertsWith({ allRejected: true, adrPbOn: [false, false, false] });
    const checked = alerts.allAirDataDisagreeItemsChecked(false);
    expect(checked[ALL_AIR_DATA_ITEM_SPEED_BRAKES]).toBe(true);
    expect(checked[ALL_AIR_DATA_ITEM_ADR_PBS_OFF]).toBe(true);
    expect(alerts.allAirDataDisagreeItemsChecked(true)[ALL_AIR_DATA_ITEM_SPEED_BRAKES]).toBe(false);
  });

  it('STATUS and LIMITATIONS: ADR 1+2+3, TCAS 1+2, SPD BRK and MANEUVER WITH CARE only with all ADRs off', () => {
    const on = alertsWith({ allRejected: true });
    expect(on.allAirDataDisagreeLimitations().filter((key) => key)).toEqual(['240400002']);
    expect(on.allAirDataDisagreeInopSysAllPhases()).not.toContain('340300010');
    const off = alertsWith({ allRejected: true, adrPbOn: [false, false, false] });
    expect(off.allAirDataDisagreeLimitations()).toEqual(['240400002', '240400003', '240400004']);
    expect(off.allAirDataDisagreeInopSysAllPhases()).toContain('340300010');
    expect(off.allAirDataDisagreeInopSysAllPhases()).toContain('340300029');
  });
});

describe('readAirDataAlertInputs', () => {
  const arinc = (value: number, ssm: Arinc429SignStatusMatrix) => Arinc429Word.getRawWord(value, ssm);
  const NORMAL = Arinc429SignStatusMatrix.NormalOperation;
  const FAILURE_WARNING = Arinc429SignStatusMatrix.FailureWarning;

  it('reads the rejections, the GPS altitude first and the thrust levers', () => {
    const values: Record<string, number> = {
      'L:A32NX_PRIM_ADR_2_REJECTED': 1,
      'L:A32NX_PRIM_AOA_3_REJECTED': 1,
      'L:A32NX_GPS_1_ALTITUDE': arinc(0, FAILURE_WARNING),
      'L:A32NX_GPS_2_ALTITUDE': arinc(31_000, NORMAL),
      'L:A32NX_ADIRS_ADR_1_ALTITUDE': arinc(20_000, NORMAL),
      'L:A32NX_AUTOTHRUST_TLA:3': 45,
      'L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON': 1,
    };
    const read = readAirDataAlertInputs((name) => values[name] ?? 0);
    expect(read.adrRejected).toEqual([false, true, false]);
    expect(read.aoaRejected).toEqual([false, false, true]);
    expect(read.altitudeFt).toBe(31_000);
    expect(read.thrustLeverAboveClimb).toBe(true);
    expect(read.adrPbOn).toEqual([true, false, false]);
  });
});

describe('FwsAbnormalSensed entries (A380 FCOM flight phase inhibition figures, PDF pages 5555, 5557, 5565)', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const alertBlock = (id: string) => {
    const start = abnormalSensed.indexOf(`    ${id}: {`);
    expect(start).toBeGreaterThan(0);
    return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
  };

  it.each([
    ['340800009', 'airDataDisagree', '[4, 5, 6, 7, 9, 10]', 'failure: 2'],
    ['340800010', 'allAirDataDisagree', '[4, 5, 10]', 'failure: 3'],
    ['340800014', 'aoaDisagree', '[4, 5, 6, 7, 9, 10]', 'failure: 2'],
  ])('%s is raised by %s, inhibited in phases %s, %s', (id, signal, phases, level) => {
    const block = alertBlock(id);
    expect(block).toContain(`simVarIsActive: this.fws.airDataAlerts.${signal},`);
    expect(block).toContain(`flightPhaseInhib: ${phases},`);
    expect(block).toContain(level);
  });
});
