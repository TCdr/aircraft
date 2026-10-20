// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';
import { Arinc429Register, Arinc429WordData } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';

/*
 * F/CTL alerts of the slat and flap control: control units, FLAPS lever, wing tip brakes and maintenance tests. The
 * SFCCs report the control units and the FLAPS lever in their slat/flap component status word, the wing tip brakes and
 * the lever out of detent in their slat/flap system status word (a380_systems hydraulic/sfcc). The overdue maintenance
 * tests come from the flyPad failures only.
 *
 * Design choice: the FLAPS (SLATS) LOCKED STATUS leaves out F/CTL PROT and ALTN LAW : PROT LOST: the PRIM models do not
 * revert to the alternate law when the wing tip brakes lock, and the law-driven F/CTL ALTN LAW alert shows these lines
 * when the PRIMs do.
 */

const SYSTEM_STATUS_SLAT_WING_TIP_BRAKES_ENGAGED_BIT = 15;
const SYSTEM_STATUS_FLAP_WING_TIP_BRAKES_ENGAGED_BIT = 16;
const SYSTEM_STATUS_LEVER_OUT_OF_DETENT_BIT = 27;
const COMPONENT_STATUS_SLAT_CONTROL_UNIT_FAULT_BIT = 11;
const COMPONENT_STATUS_FLAP_CONTROL_UNIT_FAULT_BIT = 12;
const COMPONENT_STATUS_LEVER_POSITION_LOST_BIT = 13;

export const FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];
export const FLAPS_LEVER_SYS_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
export const FLAPS_LEVER_OUT_OF_DETENT_PHASE_INHIBITION = [4, 5, 6];
export const FLAPS_SLATS_LOCKED_PHASE_INHIBITION = [4, 5, 6, 7, 10];
/** SAFETY TEST REQUIRED and TIP BRK TEST REQUIRED: shown in phases 1 and 12 only */
export const SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export interface SlatFlapMaintenanceFailures {
  /** SFCC 1 and 2 */
  flapSafetyTestOverdue: [boolean, boolean];
  slatSafetyTestOverdue: [boolean, boolean];
  slatWingTipBrakeTestOverdue: boolean;
  flapWingTipBrakeTestOverdue: boolean;
}

/**
 * Reads the overdue maintenance tests.
 * @param failureActive whether a flyPad failure is active
 * @returns the overdue tests
 */
export function readSlatFlapMaintenanceFailures(
  failureActive: (failure: number) => boolean,
): SlatFlapMaintenanceFailures {
  return {
    flapSafetyTestOverdue: [
      failureActive(A380Failure.Sfcc1FlapSafetyTestOverdue),
      failureActive(A380Failure.Sfcc2FlapSafetyTestOverdue),
    ],
    slatSafetyTestOverdue: [
      failureActive(A380Failure.Sfcc1SlatSafetyTestOverdue),
      failureActive(A380Failure.Sfcc2SlatSafetyTestOverdue),
    ],
    slatWingTipBrakeTestOverdue: failureActive(A380Failure.SlatWingTipBrakeTestOverdue),
    flapWingTipBrakeTestOverdue: failureActive(A380Failure.FlapWingTipBrakeTestOverdue),
  };
}

export interface SlatFlapAlertStates {
  /** SFCC 1 and 2 */
  flapCtlFault: [boolean, boolean];
  slatCtlFault: [boolean, boolean];
  flapsLeverSysFault: [boolean, boolean];
  flapsLeverOutOfDetent: boolean;
  flapsLocked: boolean;
  slatsLocked: boolean;
  flapSafetyTestRequired: [boolean, boolean];
  slatSafetyTestRequired: [boolean, boolean];
  slatsTipBrakeTestRequired: boolean;
  flapsTipBrakeTestRequired: boolean;
}

/**
 * @param systemStatusWords the slat/flap system status words of SFCC 1 and 2
 * @param componentStatusWords the slat/flap component status words of SFCC 1 and 2
 * @param maintenance the overdue maintenance tests
 * @returns the alert states
 */
export function slatFlapAlerts(
  systemStatusWords: [Arinc429WordData, Arinc429WordData],
  componentStatusWords: [Arinc429WordData, Arinc429WordData],
  maintenance: SlatFlapMaintenanceFailures,
): SlatFlapAlertStates {
  const componentBit = (bit: number): [boolean, boolean] => [
    componentStatusWords[0].bitValueOr(bit, false),
    componentStatusWords[1].bitValueOr(bit, false),
  ];
  const eitherSystemStatusBit = (bit: number) =>
    systemStatusWords[0].bitValueOr(bit, false) || systemStatusWords[1].bitValueOr(bit, false);

  return {
    flapCtlFault: componentBit(COMPONENT_STATUS_FLAP_CONTROL_UNIT_FAULT_BIT),
    slatCtlFault: componentBit(COMPONENT_STATUS_SLAT_CONTROL_UNIT_FAULT_BIT),
    flapsLeverSysFault: componentBit(COMPONENT_STATUS_LEVER_POSITION_LOST_BIT),
    flapsLeverOutOfDetent: eitherSystemStatusBit(SYSTEM_STATUS_LEVER_OUT_OF_DETENT_BIT),
    flapsLocked: eitherSystemStatusBit(SYSTEM_STATUS_FLAP_WING_TIP_BRAKES_ENGAGED_BIT),
    slatsLocked: eitherSystemStatusBit(SYSTEM_STATUS_SLAT_WING_TIP_BRAKES_ENGAGED_BIT),
    flapSafetyTestRequired: maintenance.flapSafetyTestOverdue,
    slatSafetyTestRequired: maintenance.slatSafetyTestOverdue,
    slatsTipBrakeTestRequired: maintenance.slatWingTipBrakeTestOverdue,
    flapsTipBrakeTestRequired: maintenance.flapWingTipBrakeTestOverdue,
  };
}

/** The FWS states of the slat and flap control alerts */
export class SlatFlapAlertMonitor {
  private readonly componentStatusWords: [Arinc429Register, Arinc429Register] = [
    Arinc429Register.empty(),
    Arinc429Register.empty(),
  ];

  /** SFCC 1 and 2 */
  public readonly flapCtlFault = [Subject.create(false), Subject.create(false)];
  public readonly slatCtlFault = [Subject.create(false), Subject.create(false)];
  public readonly flapsLeverSysFault = [Subject.create(false), Subject.create(false)];
  public readonly flapsLeverOutOfDetent = Subject.create(false);
  public readonly flapsLocked = Subject.create(false);
  public readonly slatsLocked = Subject.create(false);
  public readonly flapSafetyTestRequired = [Subject.create(false), Subject.create(false)];
  public readonly slatSafetyTestRequired = [Subject.create(false), Subject.create(false)];
  public readonly slatsTipBrakeTestRequired = Subject.create(false);
  public readonly flapsTipBrakeTestRequired = Subject.create(false);

  /**
   * @returns the slat/flap component status words of SFCC 1 and 2
   */
  public readComponentStatusWords(): [Arinc429Register, Arinc429Register] {
    this.componentStatusWords[0].setFromSimVar('L:A32NX_SFCC_1_SLAT_FLAP_COMPONENT_STATUS_WORD');
    this.componentStatusWords[1].setFromSimVar('L:A32NX_SFCC_2_SLAT_FLAP_COMPONENT_STATUS_WORD');
    return this.componentStatusWords;
  }

  /**
   * Updates the alert states.
   * @param systemStatusWords the slat/flap system status words of SFCC 1 and 2
   * @param componentStatusWords the slat/flap component status words of SFCC 1 and 2
   * @param failureActive whether a flyPad failure is active
   */
  public update(
    systemStatusWords: [Arinc429WordData, Arinc429WordData],
    componentStatusWords: [Arinc429WordData, Arinc429WordData],
    failureActive: (failure: number) => boolean,
  ) {
    const states = slatFlapAlerts(
      systemStatusWords,
      componentStatusWords,
      readSlatFlapMaintenanceFailures(failureActive),
    );
    for (const sfcc of [0, 1]) {
      this.flapCtlFault[sfcc].set(states.flapCtlFault[sfcc]);
      this.slatCtlFault[sfcc].set(states.slatCtlFault[sfcc]);
      this.flapsLeverSysFault[sfcc].set(states.flapsLeverSysFault[sfcc]);
      this.flapSafetyTestRequired[sfcc].set(states.flapSafetyTestRequired[sfcc]);
      this.slatSafetyTestRequired[sfcc].set(states.slatSafetyTestRequired[sfcc]);
    }
    this.flapsLeverOutOfDetent.set(states.flapsLeverOutOfDetent);
    this.flapsLocked.set(states.flapsLocked);
    this.slatsLocked.set(states.slatsLocked);
    this.slatsTipBrakeTestRequired.set(states.slatsTipBrakeTestRequired);
    this.flapsTipBrakeTestRequired.set(states.flapsTipBrakeTestRequired);
  }
}

// EcamInopSys keys
const CAT_3_DUAL = '220300028';
const FLAP_SYS = ['290100003', '290100004'];
const SLAT_SYS = ['290100005', '290100006'];
const FLAPS = '290100012';
const SLATS = '290100013';
const BTV = '320300007';
const CAT_2 = '220300027';
const GLS_AUTOLAND = '220300010';
const FLAP_CTL_REDUND_LOSS = ['270300301', '270300302'];
const SLAT_CTL_REDUND_LOSS = ['270300303', '270300304'];
// EcamInfos keys
const CAT_3_SINGLE_ONLY = '220200016';
const FUEL_CONSUMPT_INCRSD_FMS_PRED_DISREGARD = '280200003';
const FOR_GA_MAINTAIN_SF_CONF = '270200301';
// EcamLimitations keys
const SLATS_SLOW = '290400001';
const FLAPS_SLOW = '290400002';
const FOR_LDG_FLAP_LVR_3 = '270400001';
const NO_AUTOLAND = '220400001';
const LDG_PERF_AFFECTED = '800400003';

/** The STATUS lines of an alert, in the fields of the abnormal sensed procedures */
export interface SlatFlapAlertStatus {
  inopSysAllPhases?: () => string[];
  inopSysApprLdg?: () => string[];
  info?: () => string[];
  redundLoss?: () => string[];
  limitationsAllPhases?: () => string[];
  limitationsApprLdg?: () => string[];
}

/**
 * STATUS of F/CTL FLAP (SLAT) CTL 1(2) FAULT.
 * @param surfaces the surfaces of the failed control unit
 * @param sfcc 0 for SFCC 1, 1 for SFCC 2
 * @returns the STATUS lines
 */
export function controlUnitFaultStatus(surfaces: 'flaps' | 'slats', sfcc: number): SlatFlapAlertStatus {
  return {
    inopSysApprLdg: () => [CAT_3_DUAL],
    info: () => [CAT_3_SINGLE_ONLY],
    redundLoss: () => [(surfaces === 'flaps' ? FLAP_CTL_REDUND_LOSS : SLAT_CTL_REDUND_LOSS)[sfcc]],
  };
}

/**
 * STATUS of F/CTL FLAPS LEVER SYS 1(2) FAULT: the slat and flap systems of that SFCC are lost.
 * @param sfcc 0 for SFCC 1, 1 for SFCC 2
 * @returns the STATUS lines
 */
export function flapsLeverSysFaultStatus(sfcc: number): SlatFlapAlertStatus {
  return {
    limitationsAllPhases: () => [SLATS_SLOW, FLAPS_SLOW],
    inopSysAllPhases: () => [FLAP_SYS[sfcc], SLAT_SYS[sfcc]],
  };
}

/**
 * STATUS of F/CTL FLAPS LOCKED or SLATS LOCKED.
 * @param surfaces the locked surfaces
 * @returns the STATUS lines
 */
export function surfacesLockedStatus(surfaces: 'flaps' | 'slats'): SlatFlapAlertStatus {
  return {
    limitationsApprLdg: () => [FOR_LDG_FLAP_LVR_3, NO_AUTOLAND, LDG_PERF_AFFECTED],
    inopSysApprLdg: () => [surfaces === 'flaps' ? FLAPS : SLATS, BTV, CAT_2, GLS_AUTOLAND],
    info: () => [FUEL_CONSUMPT_INCRSD_FMS_PRED_DISREGARD, FOR_GA_MAINTAIN_SF_CONF],
  };
}
