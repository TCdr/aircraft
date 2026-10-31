// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/EcamSystemPages';
import {
  DRIVE_OIL_LEVEL_LO_KEYS,
  DRIVE_OIL_OVHT_KEYS,
  DRIVE_OIL_PHASE_INHIBITION,
  DRIVE_OIL_PRESS_LO_KEYS,
  DriveOilInputs,
  ElecDriveOilAlerts,
  elecDriveOilAbnormalItems,
  readDriveOilInputs,
} from './FwsElecDriveOilAlerts';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';

/** Title (without the ELEC prefix codes) and item names of an ECAM procedure */
function alert(key: number): { title: string; items: string[] } | undefined {
  const procedure = EcamAbnormalProcedures[key];
  if (!procedure) {
    return undefined;
  }
  const prefix = '\x1b<4m\x1b4mELEC\x1bm ';
  return {
    title: procedure.title.startsWith(prefix) ? procedure.title.slice(prefix.length) : '',
    items: procedure.items.map((item) => item.name),
  };
}

/** Inputs of a normal aircraft */
function normal(): DriveOilInputs {
  return {
    oilLevelLow: [false, false, false, false],
    oilOverheat: [false, false, false, false],
    oilLowPressure: [false, false, false, false],
    drivePbReleased: [false, false, false, false],
    genPbOn: [true, true, true, true],
    apuAvailable: false,
  };
}

function alertsWith(inputs: Partial<DriveOilInputs>): ElecDriveOilAlerts {
  const alerts = new ElecDriveOilAlerts();
  alerts.update({ ...normal(), ...inputs });
  return alerts;
}

describe('ELEC DRIVE OIL LEVEL LO, OIL OVHT and OIL PRESS LO conditions', () => {
  it('raises no alert on a normal aircraft', () => {
    const a = alertsWith({});
    expect(a.oilLevelLo.map((s) => s.get())).toEqual([false, false, false, false]);
    expect(a.oilOvht.map((s) => s.get())).toEqual([false, false, false, false]);
    expect(a.oilPressLo.map((s) => s.get())).toEqual([false, false, false, false]);
  });

  it('raises each alert of the drive whose GCU sends the signal', () => {
    const a = alertsWith({
      oilLevelLow: [false, true, false, false],
      oilOverheat: [false, false, true, false],
      oilLowPressure: [false, false, false, true],
    });
    expect(a.oilLevelLo.map((s) => s.get())).toEqual([false, true, false, false]);
    expect(a.oilOvht.map((s) => s.get())).toEqual([false, false, true, false]);
    expect(a.oilPressLo.map((s) => s.get())).toEqual([false, false, false, true]);
  });

  it('reads the L:vars the Rust drive model writes (SimVar Bool reads return the number 1)', () => {
    const on = new Set([
      'L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_LEVEL_LOW',
      'L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_OVERHEAT',
      'L:A32NX_ELEC_ENG_GEN_3_IDG_OIL_LOW_PRESSURE',
      'L:A32NX_OVHD_ELEC_IDG_4_PB_IS_RELEASED',
    ]);
    const inputs = readDriveOilInputs((name) => (on.has(name) ? 1 : 0), [true, false, true, true], true);
    expect(inputs).toEqual({
      oilLevelLow: [true, false, false, false],
      oilOverheat: [false, true, false, false],
      oilLowPressure: [false, false, true, false],
      drivePbReleased: [false, false, false, true],
      genPbOn: [true, false, true, true],
      apuAvailable: true,
    });
  });
});

describe('ELEC DRIVE oil alert entries', () => {
  it('uses the alert keys of the ECAM procedures with the titles and lines', () => {
    for (let drive = 0; drive < 4; drive++) {
      const n = drive + 1;
      expect(alert(DRIVE_OIL_LEVEL_LO_KEYS[drive])).toEqual({ title: `DRIVE ${n} OIL LEVEL LO`, items: [`GEN ${n}`] });
      expect(alert(DRIVE_OIL_OVHT_KEYS[drive])).toEqual({
        title: `DRIVE ${n} OIL OVHT`,
        items: [`DRIVE ${n}`, `GEN ${n}`],
      });
      expect(alert(DRIVE_OIL_PRESS_LO_KEYS[drive])).toEqual({
        title: `DRIVE ${n} OIL PRESS LO`,
        items: [`DRIVE ${n}`, `GEN ${n}`],
      });
    }
  });

  it('has the flight phase inhibitions of the aircraft', () => {
    const items = elecDriveOilAbnormalItems(new ElecDriveOilAlerts());
    expect(items[240800040].flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(items[240800044].flightPhaseInhib).toEqual([1, 3, 4, 5, 6, 7, 9, 10, 12]);
    expect(items[240800048].flightPhaseInhib).toEqual([1, 4, 5, 6, 7, 9, 10, 12]);
    expect(DRIVE_OIL_PHASE_INHIBITION.oilOvht).not.toContain(8);
    expect(DRIVE_OIL_PHASE_INHIBITION.oilPressLo).toContain(1);
  });

  it('are master cautions; OIL OVHT and OIL PRESS LO call the ELEC AC page, OIL LEVEL LO no page', () => {
    const items = elecDriveOilAbnormalItems(new ElecDriveOilAlerts());
    for (let drive = 0; drive < 4; drive++) {
      expect(items[DRIVE_OIL_LEVEL_LO_KEYS[drive]].failure).toBe(2);
      expect(items[DRIVE_OIL_OVHT_KEYS[drive]].failure).toBe(2);
      expect(items[DRIVE_OIL_PRESS_LO_KEYS[drive]].failure).toBe(2);
      expect(items[DRIVE_OIL_LEVEL_LO_KEYS[drive]].sysPage).toBe(SdPages.None);
      expect(items[DRIVE_OIL_OVHT_KEYS[drive]].sysPage).toBe(SdPages.ElecAc);
      expect(items[DRIVE_OIL_PRESS_LO_KEYS[drive]].sysPage).toBe(SdPages.ElecAc);
    }
  });

  it('follows its alert state and its procedure lines', () => {
    const a = alertsWith({ oilOverheat: [false, true, false, false], oilLevelLow: [false, false, true, false] });
    const items = elecDriveOilAbnormalItems(a);
    expect(items[240800045].simVarIsActive.get()).toBe(true);
    expect(items[240800044].simVarIsActive.get()).toBe(false);
    expect(items[240800042].simVarIsActive.get()).toBe(true);

    // OIL OVHT: DRIVE 2 ... DISC shown, the GEN 2 line of the ECAM procedure hidden (not in the aircraft procedure)
    expect(items[240800045].whichItemsToShow()).toEqual([true, false]);
    expect(items[240800045].whichItemsChecked()).toEqual([false, false]);
    // OIL LEVEL LO: GEN 3 ... OFF
    expect(items[240800042].whichItemsToShow()).toEqual([true]);
    expect(items[240800042].whichItemsChecked()).toEqual([false]);

    a.update({
      ...normal(),
      oilOverheat: [false, true, false, false],
      oilLevelLow: [false, false, true, false],
      drivePbReleased: [false, true, false, false],
      genPbOn: [true, true, false, true],
    });
    expect(items[240800045].whichItemsChecked()).toEqual([true, false]);
    expect(items[240800042].whichItemsChecked()).toEqual([true]);
  });

  it('has the STATUS of a lost engine generator', () => {
    const a = alertsWith({});
    const items = elecDriveOilAbnormalItems(a);
    // INOP SYS GEN 1 .. GEN 4 (the ELEC GEN FAULT keys)
    expect(items[240800040].inopSysAllPhases?.([])).toEqual(['240300010']);
    expect(items[240800047].inopSysAllPhases?.([])).toEqual(['240300013']);
    expect(items[240800049].inopSysAllPhases?.([])).toEqual(['240300011']);
    // CAT 3 DUAL lost and CAT 3 SINGLE ONLY only with the APU off
    expect(items[240800049].inopSysApprLdg?.([])).toEqual(['220300028']);
    expect(items[240800049].info?.([])).toEqual(['220200016']);
    a.update({ ...normal(), apuAvailable: true });
    expect(items[240800049].inopSysApprLdg?.([])).toEqual([]);
    expect(items[240800049].info?.([])).toEqual([]);
  });
});
