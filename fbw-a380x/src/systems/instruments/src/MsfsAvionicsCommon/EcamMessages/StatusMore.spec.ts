// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { isStatusMoreAvailable } from '@shared/EcamSdMore';
import { EcamAbnormalProcedures } from './index';
import type { AbnormalProcedure } from './index';
import {
  alertsImpactingLandingPerformance,
  alertsWithMoreInfo,
  EcamMoreInfo,
  procedureImpactsLandingPerformance,
} from './StatusMore';

/* The procedures here are made up; the real ones are checked in the tests that say so. */

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
    expect(procedureImpactsLandingPerformance(EcamAbnormalProcedures['990900009'])).toBe(true);
    expect(procedureImpactsLandingPerformance(EcamAbnormalProcedures['990900008'])).toBe(false);
  });
});

describe('STATUS MORE: MORE INFO', () => {
  it('has the MORE INFO of MISC OIS FAULT', () => {
    expect(EcamMoreInfo[990900008].join(' ')).toBe(
      'IF CAPT + F/O OITs AFFECTED, CONSIDER NSS FLT OPS RESET PROCEDURE.',
    );
    expect(alertsWithMoreInfo(['990900009', '990900008', '990900008'])).toEqual(['990900008']);
    // The MORE INFO line is not an item of the procedure: it comes from EcamMoreInfo only
    expect(EcamAbnormalProcedures['990900008'].items.some((item) => /MORE INFO/.test(item.name))).toBe(false);
  });
});

describe('STATUS MORE page available (MORE label and MORE pb)', () => {
  it('is available with only alerts impacting LDG PERF or only MORE INFO', () => {
    expect(isStatusMoreAvailable([], [])).toBe(false);
    expect(isStatusMoreAvailable([], [], ['990900009'])).toBe(true);
    expect(isStatusMoreAvailable([], [], [], ['990900008'])).toBe(true);
  });
});
