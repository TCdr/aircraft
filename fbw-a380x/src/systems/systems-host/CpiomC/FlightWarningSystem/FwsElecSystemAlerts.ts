// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X ELEC (ATA 24) alerts of the battery, external power, RAT generator and TR monitoring failures (flyPad ATA 24):
 * ELEC BAT 1(2)(ESS) FAULT, ELEC APU BAT FAULT, ELEC BAT 1(2)(ESS)(APU) OFF, ELEC EXT PWR 1(2)(3)(4) FAULT,
 * ELEC RAT FAULT, ELEC TR 1(2)(ESS) MONITORING FAULT and ELEC DRIVE 1(2)(3)(4) DISC FAULT. Also the STATUS (INOP SYS,
 * INFO) lines of the generator, TR and APU alerts of FwsElecAlerts.
 *
 * The Rust electrical system (a380_systems/src/electrical) simulates the failures and publishes what the aircraft
 * detects: the BAT pb-sw FAULT lights, L:A32NX_ELEC_EXT_PWR_n_FAULT, L:A32NX_ELEC_RAT_FAULT and
 * L:A32NX_ELEC_ENG_GEN_n_DRIVE_DISC_FAULT. Design choice: the TR monitoring failures change nothing in the electrical
 * network (the TRs keep working), so the FWS reads them from the flyPad failures directly.
 */

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { A380Failure } from '@failures';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import { Four } from './FwsElecAlerts';

/** TR 1, TR 2, TR ESS */
export type Three<T> = [T, T, T];

/** Index of APU BAT in the battery arrays (BAT 1, BAT 2, BAT ESS, APU BAT: the Rust battery numbers 1 to 4) */
const APU_BAT = 3;

/** The battery pb-sw names of the L:vars, in the order BAT 1, BAT 2, BAT ESS, APU BAT */
const BAT_PB_NAMES: Four<string> = ['1', '2', 'ESS', 'APU'];

/** The flyPad failures of the TR 1, TR 2 and TR ESS monitoring functions */
export const TR_MONITORING_FAILURES: Three<number> = [
  A380Failure.TransformerRectifier1Monitoring,
  A380Failure.TransformerRectifier2Monitoring,
  A380Failure.TransformerRectifierEssMonitoring,
];

/**
 * Flight phases in which the alerts are inhibited. `battery` covers ELEC (APU) BAT FAULT and ELEC BAT ... OFF (master
 * caution and SC); EXT PWR FAULT, RAT FAULT and TR MONITORING FAULT have no master light and no audio; DRIVE DISC FAULT
 * has master caution and SC.
 */
export const ELEC_SYSTEM_PHASE_INHIBITION: {
  battery: number[];
  extPwrFault: number[];
  ratFault: number[];
  trMonitoringFault: number[];
  driveDiscFault: number[];
} = {
  battery: [3, 4, 5, 6, 7, 9, 10],
  extPwrFault: [3, 4, 5, 6, 7, 8, 9, 10],
  ratFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  trMonitoringFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  driveDiscFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** What the FWS reads for these alerts, as real booleans */
export interface ElecSystemInputs {
  /** FAULT light of the BAT 1, BAT 2, BAT ESS and APU BAT pb-sw: the battery failure the BCRU detected */
  batFaultLight: Four<boolean>;
  /** BAT 1, BAT 2, BAT ESS and APU BAT pb-sw in AUTO */
  batPbAuto: Four<boolean>;
  /** ELEC APU TR FAULT is active (its procedure may ask APU BAT OFF) */
  apuTrFault: boolean;
  /** EXT PWR 1-4 fault reported by its GGPCU */
  extPwrFault: Four<boolean>;
  extPwrPbOn: Four<boolean>;
  /** RAT generator fault */
  ratFault: boolean;
  /** TR 1, TR 2, TR ESS monitoring function failed (flyPad failures) */
  trMonitoringFailed: Three<boolean>;
  /** Disconnection function of DRIVE 1-4 failed */
  driveDiscFault: Four<boolean>;
  /** APU available: the "If APU off" lines of the generator alert STATUS */
  apuAvailable: boolean;
}

/**
 * Reads the inputs with `read` (SimVar.GetSimVarValue(name, Bool) in the sim, which returns the number 1 for true) and
 * `isFailureActive` (FailuresConsumer.isActive).
 */
export function readElecSystemInputs(
  read: (name: string) => number,
  isFailureActive: (failure: number) => boolean,
  apuTrFault: boolean,
  apuAvailable: boolean,
): ElecSystemInputs {
  const isOn = (name: string): boolean => read(name) > 0;
  return {
    batFaultLight: BAT_PB_NAMES.map((bat) => isOn(`L:A32NX_OVHD_ELEC_BAT_${bat}_PB_HAS_FAULT`)) as Four<boolean>,
    batPbAuto: BAT_PB_NAMES.map((bat) => isOn(`L:A32NX_OVHD_ELEC_BAT_${bat}_PB_IS_AUTO`)) as Four<boolean>,
    apuTrFault,
    extPwrFault: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_ELEC_EXT_PWR_${n}_FAULT`)) as Four<boolean>,
    extPwrPbOn: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_OVHD_ELEC_EXT_PWR_${n}_PB_IS_ON`)) as Four<boolean>,
    ratFault: isOn('L:A32NX_ELEC_RAT_FAULT'),
    trMonitoringFailed: TR_MONITORING_FAILURES.map((failure) => isFailureActive(failure)) as Three<boolean>,
    driveDiscFault: [1, 2, 3, 4].map((n) => isOn(`L:A32NX_ELEC_ENG_GEN_${n}_DRIVE_DISC_FAULT`)) as Four<boolean>,
    apuAvailable,
  };
}

/** One flag per alert, true while its triggering condition is met */
export interface ElecSystemAlertFlags {
  /** BAT 1, BAT 2, BAT ESS, APU BAT */
  batFault: Four<boolean>;
  /** BAT 1, BAT 2, BAT ESS, APU BAT */
  batOff: Four<boolean>;
  extPwrFault: Four<boolean>;
  ratFault: boolean;
  trMonitoringFault: Three<boolean>;
  driveDiscFault: Four<boolean>;
}

/**
 * The triggering conditions.
 * - BAT ... FAULT: the BCRU detects the battery failure and lights the pb-sw FAULT light; the alert follows the light.
 * - BAT ... OFF: a battery is abnormally OFF. Design choices for "abnormally": not while the battery has its FAULT
 *   (its procedure asks BAT ... OFF), not the APU BAT while ELEC APU TR FAULT is active (its procedure asks APU BAT
 *   OFF), and not while all four batteries are OFF together (securing the aircraft, and the battery check that sets
 *   all BAT pb-sw OFF then ON).
 * - EXT PWR ... FAULT: the external power unit or its GGPCU is failed.
 * - RAT FAULT: the RAT generator is failed (no RAT uplock or heater in the simulation).
 * - TR ... MONITORING FAULT: the monitoring function of the TR is failed.
 * - DRIVE ... DISC FAULT: the function that disconnects the engine generator from its engine failed.
 */
export function elecSystemAlertFlags(i: ElecSystemInputs): ElecSystemAlertFlags {
  const allBatteriesOff = i.batPbAuto.every((auto) => !auto);
  return {
    batFault: [...i.batFaultLight],
    batOff: i.batPbAuto.map(
      (auto, bat) => !auto && !allBatteriesOff && !i.batFaultLight[bat] && !(bat === APU_BAT && i.apuTrFault),
    ) as Four<boolean>,
    extPwrFault: [...i.extPwrFault],
    ratFault: i.ratFault,
    trMonitoringFault: [...i.trMonitoringFailed],
    driveDiscFault: [...i.driveDiscFault],
  };
}

/**
 * The "EXT PWR 1(2)(3)(4) P/B ... RECYCLE" line: done once the pb has been set OFF, then ON again, while
 * the alert is active. Design choice: an alert that ends and comes back starts with the line not done.
 */
export class PushButtonRecycleMonitor {
  private seenOff = false;

  private recycled = false;

  /**
   * @param alertActive whether the alert of the line is active
   * @param pbOn whether the pb is ON
   * @returns whether the pb has been recycled since the alert came
   */
  public update(alertActive: boolean, pbOn: boolean): boolean {
    if (!alertActive) {
      this.seenOff = false;
      this.recycled = false;
    } else if (!pbOn) {
      this.seenOff = true;
    } else if (this.seenOff) {
      this.recycled = true;
    }
    return this.recycled;
  }
}

/** INOP SYS BAT 1, BAT 2, BAT ESS, APU BAT (EcamInopSys keys) */
const BAT_INOP_SYS: Four<string> = ['240300005', '240300006', '240300007', '240300001'];

/** INOP SYS BAT 1+2 */
const BAT_1_2_INOP_SYS = '240300008';

/**
 * INOP SYS of ELEC BAT 1(2)(ESS) FAULT and ELEC APU BAT FAULT: the faulty battery, or BAT 1+2 when BAT 1 and BAT 2
 * are both faulty.
 * @param bat 0 to 3 for BAT 1, BAT 2, BAT ESS, APU BAT
 * @param batFault the BAT FAULT alerts, in the same order
 */
export function batteryFaultInopSys(bat: number, batFault: readonly boolean[]): string[] {
  if (bat < 2 && batFault[0] && batFault[1]) {
    return [BAT_1_2_INOP_SYS];
  }
  return [BAT_INOP_SYS[bat]];
}

/** INFO of ELEC APU BAT FAULT: APU BAT START NOT AVAIL when the APU TR is failed too */
export function apuBatFaultInfo(apuTrFault: boolean): string[] {
  return apuTrFault ? ['240200001'] : [];
}

/** INFO of ELEC APU TR FAULT: APU START NOT AVAIL when the APU BAT is failed too */
export function apuTrFaultInfo(apuBatFault: boolean): string[] {
  return apuBatFault ? ['240200002'] : [];
}

/** INOP SYS EXT PWR 1, 2, 3, 4 */
export const EXT_PWR_INOP_SYS: Four<string> = ['240300016', '240300017', '240300018', '240300019'];

export const RAT_INOP_SYS = '240300029';

/** INOP SYS GEN 1, 2, 3, 4 */
export const ENG_GEN_INOP_SYS: Four<string> = ['240300010', '240300011', '240300012', '240300013'];

/** INOP SYS APU GEN A, APU GEN B */
export const APU_GEN_INOP_SYS: [string, string] = ['240300014', '240300015'];

/** INOP SYS TR 1, TR 2, TR ESS */
export const TR_INOP_SYS: Three<string> = ['240300034', '240300035', '240300036'];

export const APU_TR_INOP_SYS = '240300004';

/**
 * STATUS APPR & LDG INOP SYS of ELEC GEN 1(2)(3)(4) FAULT, ELEC GEN 1(2)(3)(4) OFF and ELEC DRIVE 1(2)(3)(4)
 * DISCONNECTED: CAT 3 DUAL when the APU is off.
 */
export function engineGeneratorLostApprLdg(apuAvailable: boolean): string[] {
  return apuAvailable ? [] : ['220300028'];
}

/** STATUS INFO of the same alerts: CAT 3 SINGLE ONLY when the APU is off */
export function engineGeneratorLostInfo(apuAvailable: boolean): string[] {
  return apuAvailable ? [] : ['220200016'];
}

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class ElecSystemAlerts {
  /** BAT 1, BAT 2, BAT ESS, APU BAT */
  public readonly batFault = Array.from(Array(4), () => Subject.create(false));

  /** BAT 1, BAT 2, BAT ESS, APU BAT */
  public readonly batOff = Array.from(Array(4), () => Subject.create(false));

  /** BAT 1, BAT 2, BAT ESS, APU BAT pb-sw in AUTO, for the BAT ... OFF and BAT ... ON lines */
  public readonly batPbAuto = [true, true, true, true];

  public readonly extPwrFault = Array.from(Array(4), () => Subject.create(false));

  /** The EXT PWR ... RECYCLE line of each EXT PWR FAULT is done */
  public readonly extPwrRecycled = [false, false, false, false];

  public readonly ratFault = Subject.create(false);

  public readonly trMonitoringFault = Array.from(Array(3), () => Subject.create(false));

  public readonly driveDiscFault = Array.from(Array(4), () => Subject.create(false));

  /** ELEC APU TR FAULT active, for the INFO of ELEC APU BAT FAULT */
  public apuTrFault = false;

  private readonly recycleMonitors = [0, 1, 2, 3].map(() => new PushButtonRecycleMonitor());

  public update(i: ElecSystemInputs): void {
    const flags = elecSystemAlertFlags(i);
    flags.batFault.forEach((fault, bat) => this.batFault[bat].set(fault));
    flags.batOff.forEach((off, bat) => this.batOff[bat].set(off));
    i.batPbAuto.forEach((auto, bat) => (this.batPbAuto[bat] = auto));
    flags.extPwrFault.forEach((fault, n) => {
      this.extPwrFault[n].set(fault);
      this.extPwrRecycled[n] = this.recycleMonitors[n].update(fault, i.extPwrPbOn[n]);
    });
    this.ratFault.set(flags.ratFault);
    flags.trMonitoringFault.forEach((fault, tr) => this.trMonitoringFault[tr].set(fault));
    flags.driveDiscFault.forEach((fault, drive) => this.driveDiscFault[drive].set(fault));
    this.apuTrFault = i.apuTrFault;
  }

  /** The BAT FAULT alerts, in the order BAT 1, BAT 2, BAT ESS, APU BAT */
  public batFaultStates(): boolean[] {
    return this.batFault.map((fault) => fault.get());
  }
}

/** The alert keys (EcamAbnormalProcedures, ata24.ts) */
const BAT_FAULT_KEYS: Four<number> = [240800017, 240800018, 240800087, 240800013];
const BAT_OFF_KEYS: Four<number> = [240800088, 240800089, 240800090, 240800091];
const EXT_PWR_FAULT_KEYS: Four<number> = [240800056, 240800057, 240800058, 240800059];
const RAT_FAULT_KEY = 240800072;
const TR_MONITORING_FAULT_KEYS: Three<number> = [240800084, 240800085, 240800086];
const DRIVE_DISC_FAULT_KEYS: Four<number> = [240800032, 240800033, 240800034, 240800035];

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param a the alert state (FwsCore.elecSystemAlerts)
 */
export function elecSystemAbnormalItems(a: ElecSystemAlerts): { [key: number]: EwdAbnormalItem } {
  const items: { [key: number]: EwdAbnormalItem } = {};

  BAT_FAULT_KEYS.forEach((key, bat) => {
    items[key] = {
      flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.battery,
      simVarIsActive: a.batFault[bat],
      notActiveWhenItemActive: [],
      // BAT ... OFF
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!a.batPbAuto[bat]],
      inopSysAllPhases: () => batteryFaultInopSys(bat, a.batFaultStates()),
      info: () => (bat === APU_BAT ? apuBatFaultInfo(a.apuTrFault) : []),
      failure: 2,
      sysPage: SdPages.ElecDc,
    };
  });

  BAT_OFF_KEYS.forEach((key, bat) => {
    items[key] = {
      flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.battery,
      simVarIsActive: a.batOff[bat],
      notActiveWhenItemActive: [],
      // Design choice, as ELEC GEN OFF: 5 s, so that setting the batteries ON one after the other (cockpit
      // preparation) does not flash this alert
      monitorConfirmTime: 5,
      // BAT ... ON
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [a.batPbAuto[bat]],
      failure: 2,
      sysPage: SdPages.ElecDc,
    };
  });

  EXT_PWR_FAULT_KEYS.forEach((key, n) => {
    items[key] = {
      flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.extPwrFault,
      simVarIsActive: a.extPwrFault[n],
      notActiveWhenItemActive: [],
      // EXT PWR ... RECYCLE
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [a.extPwrRecycled[n]],
      inopSysAllPhases: () => [EXT_PWR_INOP_SYS[n]],
      failure: 1,
      // This alert calls no SD page
      sysPage: SdPages.None,
    };
  });

  items[RAT_FAULT_KEY] = {
    flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.ratFault,
    simVarIsActive: a.ratFault,
    notActiveWhenItemActive: [],
    // Crew awareness only; RAT NOT LOCKED UP and HEATER FAULT are not simulated
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
    inopSysAllPhases: () => [RAT_INOP_SYS],
    failure: 1,
    sysPage: SdPages.ElecAc,
  };

  TR_MONITORING_FAULT_KEYS.forEach((key, tr) => {
    items[key] = {
      flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.trMonitoringFault,
      simVarIsActive: a.trMonitoringFault[tr],
      notActiveWhenItemActive: [],
      // Crew awareness only, no STATUS
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.ElecDc,
    };
  });

  DRIVE_DISC_FAULT_KEYS.forEach((key, drive) => {
    items[key] = {
      flightPhaseInhib: ELEC_SYSTEM_PHASE_INHIBITION.driveDiscFault,
      simVarIsActive: a.driveDiscFault[drive],
      notActiveWhenItemActive: [],
      // Crew awareness only, no STATUS
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  });

  return items;
}
