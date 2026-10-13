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
  isEgtOverLimitAlertTriggered,
  isN1N2OverLimit,
  isStallAlertShown,
} from './EngineParameterAlerts';

const climb: EngineOverLimitInputs = {
  displayedEgtDegrees: 800,
  n1Percent: 85,
  n3Percent: 95,
  thrustLimitType: 1,
  alphaFloor: false,
  secondsAtOrAboveRedLine: 0,
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

/*
 * ENG EGT OVER LIMIT (a380_fcom.txt l.171488-171494): above the red line (1 002 °C) during takeoff and go-around, with
 * the thrust reversers selected or in alpha floor, above the EGT limit (970 °C) at or below MCT. During takeoff the red
 * indication it goes with is at or above 1 022 °C, or at or above 1 002 °C for more than 20 s (l.113170-113177).
 */
describe('ENG EGT OVER LIMIT', () => {
  it('triggers above the 970 °C EGT limit at or below MCT', () => {
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 970 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 971 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 2, displayedEgtDegrees: 971 })).toBe(true);
  });

  it('at TOGA and FLEX triggers from 1 022 °C, or from 1 002 °C held for more than 20 s', () => {
    const toga = { ...climb, thrustLimitType: 4 };
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1021 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1022 })).toBe(true);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 15 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 21 })).toBe(true);
    expect(
      isEgtOverLimit({ ...climb, thrustLimitType: 3, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 21 }),
    ).toBe(true);
  });

  it('with the reversers selected or in alpha floor triggers at the red line, without the takeoff tolerance', () => {
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 5, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 5, displayedEgtDegrees: 1002 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, alphaFloor: true, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, alphaFloor: true, displayedEgtDegrees: 1002 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 4, alphaFloor: true, displayedEgtDegrees: 1002 })).toBe(true);
  });

  it('FwsCore counts the time at or above the red line of each engine on the EGT the EWD shows', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain('this.egtRedLineTimers[index].update(displayedEgtDegrees, deltaTime / 1000);');
    expect(core).toContain('secondsAtOrAboveRedLine: this.egtRedLineTimers[index].secondsAtOrAboveRedLine,');
  });
});

/* FCOM ENG FADEC FAULT l.171597-171600: "the ENG 1(2)(3)(4) EGT OVER LIMIT ECAM will not trigger in the case of EGT
 * exceedance" */
describe('ENG EGT OVER LIMIT with ENG FADEC FAULT', () => {
  it('does not trigger with the FADEC FAULT of the engine', () => {
    expect(isEgtOverLimitAlertTriggered(true, false)).toBe(true);
    expect(isEgtOverLimitAlertTriggered(true, true)).toBe(false);
    expect(isEgtOverLimitAlertTriggered(false, false)).toBe(false);
  });

  it('FwsCore gates the alert with the FADEC FAULT of the same engine, the EWD attention box keeps the exceedance', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain(
      'this.engEgtOverLimit[index].set(isEgtOverLimitAlertTriggered(egtExceeded[index], this.fadecFault[index].get()));',
    );
    expect(core).toContain('primaryAbnormal.get() || egtExceeded[index] ||');
    // the FADEC FAULT is read before the EGT alert in the same update
    expect(core.indexOf('this.fadecFault[engineIndex].set(fadecFault);')).toBeLessThan(
      core.indexOf('isEgtOverLimitAlertTriggered(egtExceeded'),
    );
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
    // Audio and Master Light only, no SD page (FCOM l.171495 and l.172346, PDF p.5769 and p.5794); STALL has the ENGINE page
    expect(egt).toContain('sysPage: SdPages.None');
    expect(n1n2).toContain('sysPage: SdPages.None');
    expect(stall).toContain('sysPage: SdPages.Eng');

    const itemCount = (id: number) => (block(ata70, id).match(/\{ name:/g) ?? []).length;
    expect(itemCount(701800113 + index)).toBe(ENG_STALL_ITEMS_SHOWN.length);
    expect(itemCount(701800009 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    expect(itemCount(701800073 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    // N1/N2 OVER LIMIT is a red warning (FCOM PDF page 5794)
    expect(block(ata70, 701800073 + index)).toContain("title: '\\x1b<2m");
  });
});
