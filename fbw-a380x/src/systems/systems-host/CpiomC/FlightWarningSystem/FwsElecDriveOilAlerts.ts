// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X ELEC (ATA 24) alerts of the oil system of the generator drives: ELEC DRIVE 1(2)(3)(4) OIL LEVEL LO,
 * ELEC DRIVE 1(2)(3)(4) OIL OVHT and ELEC DRIVE 1(2)(3)(4) OIL PRESS LO (FCOM gap report 2026-10-10, A380X ATA 24
 * row #22).
 *
 * Source: A380 FCOM PRO-ABN-ECAM-10-24 "ELEC" (KAL fleet, 16 AUG 11). "l." = line of the text copy
 * references/manuals/a380_fcom.txt; the flight phase inhibitions and master lights are figures, read from
 * airbus-a380-fcom_compress.pdf ("PDF p.").
 *
 * The Rust drive model (systems electrical::engine_generator DirectDrive) gives the signals of the generator control
 * units: L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LEVEL_LOW, L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_OVERHEAT and
 * L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LOW_PRESSURE. They are all false once the drive is disconnected, so that these
 * alerts make way for ELEC DRIVE 1(2)(3)(4) DISCONNECTED after the DRIVE ... DISC line.
 */

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import { Four } from './FwsElecAlerts';
import { ENG_GEN_INOP_SYS, engineGeneratorLostApprLdg, engineGeneratorLostInfo } from './FwsElecSystemAlerts';

/**
 * Flight phase inhibitions (FCOM figures), all three with the master caution and the single chime:
 * - OIL LEVEL LO (PDF p.4920): phases 2 to 11, so only on ground before the first engine start and after the last
 *   engine shutdown. No SD page.
 * - OIL OVHT (PDF p.4922): phases 1, 3 to 7, 9, 10 and 12. DRIVE pb FAULT light, ELEC AC SD page.
 * - OIL PRESS LO (PDF p.4924): phases 1, 4 to 7, 9, 10 and 12. DRIVE pb FAULT light, ELEC AC SD page.
 */
export const DRIVE_OIL_PHASE_INHIBITION: {
  oilLevelLo: number[];
  oilOvht: number[];
  oilPressLo: number[];
} = {
  oilLevelLo: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  oilOvht: [1, 3, 4, 5, 6, 7, 9, 10, 12],
  oilPressLo: [1, 4, 5, 6, 7, 9, 10, 12],
};

/** What the FWS reads for these alerts, as real booleans */
export interface DriveOilInputs {
  /** Low oil level of DRIVE 1-4 (L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LEVEL_LOW) */
  oilLevelLow: Four<boolean>;
  /** Oil temperature of DRIVE 1-4 above 200 degrees C (L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_OVERHEAT) */
  oilOverheat: Four<boolean>;
  /** Oil pressure of DRIVE 1-4 below 35 PSI (L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LOW_PRESSURE) */
  oilLowPressure: Four<boolean>;
  /** DRIVE 1-4 pb released (DISC) */
  drivePbReleased: Four<boolean>;
  /** GEN 1-4 pb-sw ON */
  genPbOn: Four<boolean>;
  /** APU available: the "If APU off" lines of the STATUS */
  apuAvailable: boolean;
}

/**
 * Reads the inputs with `read` (SimVar.GetSimVarValue(name, Bool) in the sim, which returns the number 1 for true).
 * @param read the simvar reader
 * @param genPbOn GEN 1-4 pb-sw ON
 * @param apuAvailable APU available
 * @returns the inputs
 */
export function readDriveOilInputs(
  read: (name: string) => number,
  genPbOn: Four<boolean>,
  apuAvailable: boolean,
): DriveOilInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  return {
    oilLevelLow: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_ELEC_ENG_GEN_${n}_IDG_OIL_LEVEL_LOW`)) as Four<boolean>,
    oilOverheat: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_ELEC_ENG_GEN_${n}_IDG_OIL_OVERHEAT`)) as Four<boolean>,
    oilLowPressure: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_ELEC_ENG_GEN_${n}_IDG_OIL_LOW_PRESSURE`)) as Four<boolean>,
    drivePbReleased: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_OVHD_ELEC_IDG_${n}_PB_IS_RELEASED`)) as Four<boolean>,
    genPbOn: [...genPbOn] as Four<boolean>,
    apuAvailable,
  };
}

/**
 * The procedure lines (FCOM text). The ata24.ts entries have the two lines DRIVE ... DISC and GEN ... OFF for OIL OVHT
 * and OIL PRESS LO; the FCOM procedures have the DRIVE ... DISC line only (l.141346, l.141413), so the GEN line is
 * hidden, as ELEC DRIVE ... DISCONNECTED does with its GEN line.
 * - OIL LEVEL LO: GEN 1(2)(3)(4) ... OFF (l.141264), done when the GEN pb-sw is OFF.
 * - OIL OVHT, OIL PRESS LO: DRIVE 1(2)(3)(4) ... DISC, done when the DRIVE pb is released.
 */
export const DRIVE_OIL_LEVEL_LO_ITEMS_SHOWN = [true];
export const DRIVE_OIL_DISC_ITEMS_SHOWN = [true, false];

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class ElecDriveOilAlerts {
  /** ELEC DRIVE 1(2)(3)(4) OIL LEVEL LO, l.141248-141254: "The oil level of the engine driven generator is low." */
  public readonly oilLevelLo = Array.from(Array(4), () => Subject.create(false));

  /**
   * ELEC DRIVE 1(2)(3)(4) OIL OVHT, l.141309-141315: "The temperature, in the oil system that drives the applicable
   * generator, is too high." "higher than 200 degrees C".
   */
  public readonly oilOvht = Array.from(Array(4), () => Subject.create(false));

  /**
   * ELEC DRIVE 1(2)(3)(4) OIL PRESS LO, l.141380-141387: "The pressure, in the oil system that drives the applicable
   * generator, is abnormally low (lower than 35 PSI)."
   */
  public readonly oilPressLo = Array.from(Array(4), () => Subject.create(false));

  public readonly drivePbReleased = [false, false, false, false];

  public readonly genPbOn = [true, true, true, true];

  public apuAvailable = false;

  public update(i: DriveOilInputs): void {
    for (let drive = 0; drive < 4; drive++) {
      this.oilLevelLo[drive].set(i.oilLevelLow[drive]);
      this.oilOvht[drive].set(i.oilOverheat[drive]);
      this.oilPressLo[drive].set(i.oilLowPressure[drive]);
      this.drivePbReleased[drive] = i.drivePbReleased[drive];
      this.genPbOn[drive] = i.genPbOn[drive];
    }
    this.apuAvailable = i.apuAvailable;
  }
}

/** The alert keys (EcamAbnormalProcedures, ata24.ts) */
export const DRIVE_OIL_LEVEL_LO_KEYS: Four<number> = [240800040, 240800041, 240800042, 240800043];
export const DRIVE_OIL_OVHT_KEYS: Four<number> = [240800044, 240800045, 240800046, 240800047];
export const DRIVE_OIL_PRESS_LO_KEYS: Four<number> = [240800048, 240800049, 240800050, 240800051];

/**
 * The FwsAbnormalSensed entries of these alerts. STATUS of all three (l.141285-141295, l.141356-141366,
 * l.141423-141433): INOP SYS GEN 1(2)(3)(4), APPR & LDG CAT 3 DUAL (If APU off), INFO "If APU off: CAT 3 SINGLE ONLY".
 * @param a the alert state (FwsCore.elecDriveOilAlerts)
 * @returns the entries, by alert key
 */
export function elecDriveOilAbnormalItems(a: ElecDriveOilAlerts): { [key: number]: EwdAbnormalItem } {
  const items: { [key: number]: EwdAbnormalItem } = {};

  const status = (drive: number): Pick<EwdAbnormalItem, 'inopSysAllPhases' | 'inopSysApprLdg' | 'info'> => ({
    inopSysAllPhases: () => [ENG_GEN_INOP_SYS[drive]],
    inopSysApprLdg: () => engineGeneratorLostApprLdg(a.apuAvailable),
    info: () => engineGeneratorLostInfo(a.apuAvailable),
  });

  DRIVE_OIL_LEVEL_LO_KEYS.forEach((key, drive) => {
    items[key] = {
      flightPhaseInhib: DRIVE_OIL_PHASE_INHIBITION.oilLevelLo,
      simVarIsActive: a.oilLevelLo[drive],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => DRIVE_OIL_LEVEL_LO_ITEMS_SHOWN,
      whichItemsChecked: () => [!a.genPbOn[drive]],
      ...status(drive),
      failure: 2,
      sysPage: SdPages.None,
    };
  });

  DRIVE_OIL_OVHT_KEYS.forEach((key, drive) => {
    items[key] = {
      flightPhaseInhib: DRIVE_OIL_PHASE_INHIBITION.oilOvht,
      simVarIsActive: a.oilOvht[drive],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => DRIVE_OIL_DISC_ITEMS_SHOWN,
      whichItemsChecked: () => [a.drivePbReleased[drive], !a.genPbOn[drive]],
      ...status(drive),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  });

  DRIVE_OIL_PRESS_LO_KEYS.forEach((key, drive) => {
    items[key] = {
      flightPhaseInhib: DRIVE_OIL_PHASE_INHIBITION.oilPressLo,
      simVarIsActive: a.oilPressLo[drive],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => DRIVE_OIL_DISC_ITEMS_SHOWN,
      whichItemsChecked: () => [a.drivePbReleased[drive], !a.genPbOn[drive]],
      ...status(drive),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  });

  return items;
}
