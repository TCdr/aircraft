// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * Item rules of FwsAbnormalSensed, read from the source text (as FwsCdsDuFault.spec.ts does: importing the EcamMessages
 * tables in a test fails on a circular import).
 */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

/** The source of one alert entry, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('FwsAbnormalSensed item rules', () => {
  it('ALTN LAW: MAX SPEED 310 KT is not shown in ALT 1A (A380 FCOM, as FwsLimitations.ts)', () => {
    expect(alertBlock('271800008')).toMatch(/whichItemsToShow: \(\) => \[!this\.fws\.altn1ALawCondition\.get\(\)\]/);
  });

  it.each([
    ['290800021', 'G RSVR LEVEL LO'],
    ['290800031', 'G SYS OVHT'],
  ])('%s %s: the G ELEC PMP A and B OFF item checks the green pumps', (id) => {
    const checked = alertBlock(id).split('whichItemsChecked')[1];
    expect(checked).toContain('!this.fws.greenAPumpAuto.get() && !this.fws.greenBPumpAuto.get()');
    expect(checked).not.toContain('yellowAPumpAuto');
  });
});
