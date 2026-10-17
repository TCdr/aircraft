// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isStatusMoreAvailable } from '@shared/EcamSdMore';
import type { AbnormalProcedure } from './index';
import {
  alertsImpactingLandingPerformance,
  alertsWithMoreInfo,
  EcamMoreInfo,
  procedureImpactsLandingPerformance,
} from './StatusMore';

/*
 * The EcamMessages tables are not imported (an import cycle breaks them in a test, see FwsAbnormalSensedItems.spec.ts):
 * the procedures here are made up, and the real procedure lines are read from the source text.
 */

function procedure(...names: string[]): AbnormalProcedure {
  return { title: 'TEST', sensed: true, items: names.map((name) => ({ name, sensed: false })) };
}

const procedures: { [key: string]: AbnormalProcedure } = {
  990900008: procedure('AFFECTED SIDE LAPTOP', 'OIT (AFFECTED)'), // MISC OIS FAULT
  990900009: procedure('JETTISON PROC', 'LDG DIST AFFECTED'), // MISC OVERWEIGHT LDG
  1: procedure('LDG PERF AFFECTED'),
  2: procedure('LDG DIST: AFFECTED'),
  3: procedure('LDG DIST IMPACT ON WET/CONTAM RWY ONLY'),
  4: procedure('LDG PERF COMPUTATION'),
  5: procedure('LDG LIMITED TO MAX LDG WEIGHT', 'LDG STRATEGY'),
};

describe('STATUS MORE: ALERTS IMPACTING LDG PERF', () => {
  it('lists the alerts whose procedure has a landing performance line, each once, in the order of the alerts', () => {
    expect(alertsImpactingLandingPerformance(['4', '990900009', '1', '1', '2', '3'], procedures)).toEqual([
      '4',
      '990900009',
      '1',
      '2',
      '3',
    ]);
  });

  it('leaves out the alerts without a landing performance line, and unknown keys', () => {
    expect(procedureImpactsLandingPerformance(procedures[990900008])).toBe(false);
    expect(procedureImpactsLandingPerformance(procedures[5])).toBe(false);
    expect(alertsImpactingLandingPerformance(['990900008', '5', 'not-a-key'], procedures)).toEqual([]);
  });

  it('matches the landing performance lines of the real procedures', () => {
    const ata80 = readFileSync(resolve(__dirname, 'AbnormalSensed/ata80-rest.ts'), 'utf-8');
    const overweight = ata80.slice(ata80.indexOf('990900009: {'), ata80.indexOf('990900009: {') + 400);
    expect(overweight).toContain("name: 'LDG DIST AFFECTED'");
  });
});

describe('STATUS MORE: MORE INFO', () => {
  it('has the MORE INFO of MISC OIS FAULT', () => {
    expect(EcamMoreInfo[990900008].join(' ')).toBe(
      'IF CAPT + F/O OITs AFFECTED, CONSIDER NSS FLT OPS RESET PROCEDURE.',
    );
    expect(alertsWithMoreInfo(['990900009', '990900008', '990900008'])).toEqual(['990900008']);
    const ata80 = readFileSync(resolve(__dirname, 'AbnormalSensed/ata80-rest.ts'), 'utf-8');
    expect(ata80).toMatch(/990900008: \{\s*\/\/ The MORE INFO line of this procedure is in StatusMore\.ts/);
  });
});

describe('STATUS MORE page available (MORE label and MORE pb)', () => {
  it('is available with only alerts impacting LDG PERF or only MORE INFO', () => {
    expect(isStatusMoreAvailable([], [])).toBe(false);
    expect(isStatusMoreAvailable([], [], ['990900009'])).toBe(true);
    expect(isStatusMoreAvailable([], [], [], ['990900008'])).toBe(true);
  });
});
