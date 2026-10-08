// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ENG_OVER_LIMIT_ITEMS_SHOWN,
  ENG_STALL_ITEMS_SHOWN,
  EngineOverLimitInputs,
  isEgtOverLimit,
  isN1N2OverLimit,
  isStallAlertShown,
} from './EngineParameterAlerts';

const climb: EngineOverLimitInputs = {
  displayedEgtDegrees: 800,
  n1Percent: 85,
  n3Percent: 95,
  thrustLimitType: 1,
  alphaFloor: false,
};

describe('ENG STALL', () => {
  it('shows the stall of one engine outside the takeoff from V1 to 400 ft', () => {
    expect(isStallAlertShown(true, 1, 8)).toBe(true);
    expect(isStallAlertShown(true, 1, 2)).toBe(true);
    expect(isStallAlertShown(false, 0, 8)).toBe(false);
  });

  it('inhibits the stall of one engine from V1 to 400 ft, unless two or more engines stall', () => {
    expect(isStallAlertShown(true, 1, 5)).toBe(false);
    expect(isStallAlertShown(true, 1, 6)).toBe(false);
    expect(isStallAlertShown(true, 2, 5)).toBe(true);
    expect(isStallAlertShown(true, 3, 6)).toBe(true);
  });
});

describe('ENG EGT OVER LIMIT', () => {
  it('triggers above the EGT limit at or below MCT', () => {
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 850 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 860 })).toBe(true);
  });

  it('triggers above the red line at TOGA and in alpha floor only', () => {
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 4, displayedEgtDegrees: 880 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 4, displayedEgtDegrees: 910 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, alphaFloor: true, displayedEgtDegrees: 880 })).toBe(false);
  });
});

describe('ENG N1/N2 OVER LIMIT', () => {
  it('triggers above the N1 red limit of 111 % or the N2 (FBW N3) red limit of 118.7 %', () => {
    expect(isN1N2OverLimit(climb)).toBe(false);
    expect(isN1N2OverLimit({ ...climb, n1Percent: 112 })).toBe(true);
    expect(isN1N2OverLimit({ ...climb, n3Percent: 119 })).toBe(true);
  });
});

/* The alert entries, read from the source text (importing the EcamMessages tables in a test fails on a circular import) */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const ata70 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
  'utf-8',
);

/** The source of one entry, from its id to the end of its object (entries of ata70.ts at 2 spaces, of FwsAbnormalSensed at 4) */
function block(source: string, id: number): string {
  const indent = source === ata70 ? '  ' : '    ';
  const start = source.indexOf(`\n${indent}${id}: {`);
  expect(start).toBeGreaterThan(0);
  return source.slice(start, source.indexOf(`\n${indent}},`, start));
}

describe('the ENG STALL, EGT OVER LIMIT and N1/N2 OVER LIMIT alerts of the four engines', () => {
  it.each([0, 1, 2, 3])('engine %i: inhibition, level and number of items', (index) => {
    const stall = block(abnormalSensed, 701800113 + index);
    expect(stall).toContain(`this.fws.engStall[${index}]`);
    expect(stall).toContain('flightPhaseInhib: [],');
    expect(stall).toContain('failure: 2,');
    const egt = block(abnormalSensed, 701800009 + index);
    expect(egt).toContain(`this.fws.engEgtOverLimit[${index}]`);
    expect(egt).toContain('flightPhaseInhib: [4, 5, 6],');
    expect(egt).toContain('failure: 2,');
    const n1n2 = block(abnormalSensed, 701800073 + index);
    expect(n1n2).toContain(`this.fws.engN1N2OverLimit[${index}]`);
    expect(n1n2).toContain('flightPhaseInhib: [5, 6],');
    expect(n1n2).toContain('failure: 3,');

    const itemCount = (id: number) => (block(ata70, id).match(/\{ name:/g) ?? []).length;
    expect(itemCount(701800113 + index)).toBe(ENG_STALL_ITEMS_SHOWN.length);
    expect(itemCount(701800009 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    expect(itemCount(701800073 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    // N1/N2 OVER LIMIT is a red warning (FCOM PDF page 5794)
    expect(block(ata70, 701800073 + index)).toContain("title: '\\x1b<2m");
  });
});
