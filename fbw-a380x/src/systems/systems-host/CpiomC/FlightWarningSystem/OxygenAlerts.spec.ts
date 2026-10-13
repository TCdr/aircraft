// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { cabinOxygenMinimumPressurePsi, OXYGEN_ALERT_IDS, OxygenAlertInputs, oxygenAlerts } from './OxygenAlerts';

const normal: OxygenAlertInputs = {
  ckptBottlePressurePsi: 1850,
  cabinBottlePressurePsi: 1850,
  cabinValveClosed: false,
  oneEngineRunning: true,
  fmsPassengers: 500,
  cabinAltitudeFt: 8000,
  masksReleased: false,
};

/* A380 FCOM PRO-ABN-ECAM-10-35 OXY CKPT BOTTLE PRESS LO, a380_fcom.txt l.167516-167521 */
describe('OXY CKPT BOTTLE PRESS LO', () => {
  it('triggers below 350 PSI', () => {
    expect(oxygenAlerts({ ...normal, ckptBottlePressurePsi: 349 }).ckptBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...normal, ckptBottlePressurePsi: 350 }).ckptBottlePressLo).toBe(false);
    expect(oxygenAlerts(normal)).toEqual({
      cabinBottlePressLo: false,
      cabinValveClosed: false,
      ckptBottlePressLo: false,
    });
  });

  it('is inhibited above 13 800 ft of cabin altitude or with the masks released (MASK MAN ON pb)', () => {
    const low = { ...normal, ckptBottlePressurePsi: 100 };
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: 14_000 }).ckptBottlePressLo).toBe(false);
    expect(oxygenAlerts({ ...low, masksReleased: true }).ckptBottlePressLo).toBe(false);
    // Without cabin altitude (no CPCS data) only the MASK MAN ON pb inhibits it
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: null }).ckptBottlePressLo).toBe(true);
  });
});

/* OXY CABIN BOTTLE PRESS LO, l.167425-167439, and the EMERGENCY DESCENT table of LIM-35 (2019 FCOM PDF p.6312) */
describe('OXY CABIN BOTTLE PRESS LO', () => {
  it('takes the minimum pressure of the emergency descent for the FMS passengers', () => {
    expect(cabinOxygenMinimumPressurePsi(100)).toBe(286);
    expect(cabinOxygenMinimumPressurePsi(500)).toBe(1003);
    expect(cabinOxygenMinimumPressurePsi(550)).toBeCloseTo(1090.5);
    expect(cabinOxygenMinimumPressurePsi(800)).toBe(1526);
    expect(cabinOxygenMinimumPressurePsi(0)).toBe(286);
    expect(cabinOxygenMinimumPressurePsi(853)).toBe(1526);

    expect(oxygenAlerts({ ...normal, cabinBottlePressurePsi: 1000 }).cabinBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...normal, cabinBottlePressurePsi: 1010 }).cabinBottlePressLo).toBe(false);
  });

  it('triggers below 800 PSI before one engine starts', () => {
    const beforeStart = { ...normal, oneEngineRunning: false, fmsPassengers: 800 };
    expect(oxygenAlerts({ ...beforeStart, cabinBottlePressurePsi: 799 }).cabinBottlePressLo).toBe(true);
    expect(oxygenAlerts({ ...beforeStart, cabinBottlePressurePsi: 801 }).cabinBottlePressLo).toBe(false);
  });

  it('is inhibited in a depressurization', () => {
    const low = { ...normal, cabinBottlePressurePsi: 100 };
    expect(oxygenAlerts({ ...low, cabinAltitudeFt: 14_000 }).cabinBottlePressLo).toBe(false);
    expect(oxygenAlerts({ ...low, masksReleased: true }).cabinBottlePressLo).toBe(false);
  });
});

/* OXY CABIN VLV CLOSED, l.167490-167491 */
describe('OXY CABIN VLV CLOSED', () => {
  it('follows the closed regulator supply valve', () => {
    expect(oxygenAlerts({ ...normal, cabinValveClosed: true }).cabinValveClosed).toBe(true);
  });
});

describe('OXY alert definitions', () => {
  const procedures = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42.ts'),
    'utf-8',
  );
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

  it('defines the three procedures and their FWS entries', () => {
    for (const id of Object.values(OXYGEN_ALERT_IDS)) {
      expect(procedures).toContain(`  ${id}: {`);
    }
    for (const key of Object.keys(OXYGEN_ALERT_IDS)) {
      expect(abnormalSensed).toContain(`[OXYGEN_ALERT_IDS.${key}]: {`);
    }
  });
});
