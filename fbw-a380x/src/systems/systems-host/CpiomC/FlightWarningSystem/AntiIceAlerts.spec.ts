// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { antiIceItemsChecked, ICE_DETECTED_PHASE_INHIBITION, isSevereIceDetected } from './AntiIceAlerts';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const ata30 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30.ts'),
  'utf-8',
);

/** The source of one alert entry of FwsAbnormalSensed, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('A-ICE ICE DETECTED and SEVERE ICE DETECTED', () => {
  it('SEVERE ICE DETECTED needs the WING A-ICE off', () => {
    expect(isSevereIceDetected(true, false)).toBe(true);
    expect(isSevereIceDetected(true, true)).toBe(false);
    expect(isSevereIceDetected(false, false)).toBe(false);
  });

  it('the ENG A-ICE lines, and WING A-ICE for SEVERE ICE DETECTED', () => {
    expect(antiIceItemsChecked([true, false, true, false], null)).toEqual([true, false, true, false]);
    expect(antiIceItemsChecked([true, true, true, true], false)).toEqual([true, true, true, true, false]);
  });

  it('both are active in flight phase 8 only', () => {
    expect(ICE_DETECTED_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it('have messages and are wired', () => {
    expect(ata30).toContain("title: '\\x1b<4m\\x1b4mA-ICE\\x1bm ICE DETECTED',");
    expect(ata30).toContain("title: '\\x1b<4m\\x1b4mA-ICE\\x1bm SEVERE ICE DETECTED',");
    expect(alertBlock('300800001')).toContain('simVarIsActive: this.fws.iceDetectedTimer2Status,');
    expect(alertBlock('300800001')).toContain("notActiveWhenItemActive: ['300800002'],");
    expect(alertBlock('300800002')).toContain('isSevereIceDetected(severeIcing, wingAntiIceOn)');
  });
});
