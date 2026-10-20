// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isReactiveWindshearDetectionAvailable } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { A380Failure } from '@failures';
import { isSurvSystemLost } from '../../Misc/SurvSystemFailures';
import { splitSurvFaults, SurvFaultAlerts } from './FwsSurvAlerts';

/*
 * The SURV alerts of the surveillance systems as a whole and of their WXR functions, and SURV REACTIVE W/S DET FAULT:
 *
 * - SURV SYS 1(2)(1+2) FAULT: the AESU of the system is failed or reset. Its other SURV alerts (XPDR, TCAS, TAWS,
 *   GPWS, TERR SYS) give way to it.
 * - SURV WXR 1(2)(1+2) FAULT, SURV TURB 1(2)(1+2) FAULT, SURV PRED W/S 1(2)(1+2) FAULT: the WX display, the turbulence
 *   detection or the predictive windshear function of the system is failed, the system itself working.
 * - SURV SYS DEGRADED: the links between both SURV systems are failed: the crew keeps WXR/TAWS and XPDR/TCAS on the same
 *   system with the SURV panel.
 * - SURV REACTIVE W/S DET FAULT: the reactive windshear detection of the PRIMs is lost. It runs while one PRIM is
 *   healthy on the data of the first valid ADR and IR (PrimReactiveWindshear), so it is lost with its own failure, the
 *   three PRIMs, the three ADRs or the three IRs. Crew awareness, no aural, no master light.
 *
 * Like the other SURV alerts, a system alert needs the busbar of that system powered: the ELEC bus alerts list the SURV
 * functions they lose themselves.
 */

export const SURV_SYS_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 10];

export const SURV_SYS_DEGRADED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 10];

/** SURV WXR and SURV TURB FAULT */
export const WXR_TURB_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 10];

export const PRED_WS_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 10, 11];

export const REACTIVE_WS_DET_FAULT_PHASE_INHIBITION = [1, 3, 4, 5, 6, 7, 10, 11, 12];

/** STATUS INOP SYS codes (EcamInopSys) */
export const SURV_INOP_SYS = {
  wxr: ['340300037', '340300038', '340300043'],
  xpdr: ['340300053', '340300056', '340300057'],
  tcas: ['340300011', '340300012', '340300029'],
  taws: ['340300055', '340300058', '340300059'],
  turb: ['341300004', '341300005', '341300006'],
  predWs: ['341300001', '341300002', '341300003'],
  apFdTcasMode: '220300020',
  survSysDegraded: '341300007',
  reactiveWsDet: '220300021',
};

/** One value per SURV system: index 0 = SYS 1, 1 = SYS 2 */
type SystemPair<T> = readonly [T, T];

/** What the alerts read */
export interface SurvSystemAlertInputs {
  /** SURV SYS 1, 2 lost as a whole (AESU failed or reset) */
  systemLost: SystemPair<boolean>;
  /** The busbar of SYS 1 (AC ESS) and SYS 2 (AC 4) is powered */
  powered: SystemPair<boolean>;
  /** L:A32NX_WXR_n_FAILED: the WX display function failed (also when the system is lost or unpowered) */
  wxDisplayFailed: SystemPair<boolean>;
  /** L:A32NX_WXR_n_TURB_FAILED */
  turbulenceFailed: SystemPair<boolean>;
  /** L:A32NX_WXR_n_PRED_WS_FAILED */
  predictiveWindshearFailed: SystemPair<boolean>;
  /** The links between both SURV systems are failed */
  linkFailed: boolean;
  /** The reactive windshear detection function itself is failed */
  reactiveWindshearDetectionFailed: boolean;
  /** PRIM 1, 2, 3 healthy */
  primHealthy: readonly [boolean, boolean, boolean];
  /** ADR 1, 2, 3 faulty (FAULT discrete or failure warning) */
  adrFaulty: readonly [boolean, boolean, boolean];
  /** IR 1, 2, 3 faulty */
  irFaulty: readonly [boolean, boolean, boolean];
}

/**
 * The fault conditions of a function of both systems: the function failed, its system powered and not lost (that is
 * SURV SYS FAULT, or an ELEC alert).
 * @param functionFailed the function failed on SYS 1, 2
 * @param inputs the inputs
 * @returns the SYS 1, 2 and 1+2 alerts
 */
function functionFaults(functionFailed: SystemPair<boolean>, inputs: SurvSystemAlertInputs): SurvFaultAlerts {
  const condition = (index: 0 | 1) => functionFailed[index] && inputs.powered[index] && !inputs.systemLost[index];
  return splitSurvFaults(condition(0), condition(1));
}

/**
 * The SURV SYS 1, 2 and 1+2 FAULT alerts.
 * @param inputs the inputs
 * @returns the alerts
 */
function survSystemFaults(inputs: SurvSystemAlertInputs): SurvFaultAlerts {
  return splitSurvFaults(inputs.systemLost[0] && inputs.powered[0], inputs.systemLost[1] && inputs.powered[1]);
}

/**
 * The reactive windshear detection is lost.
 * @param inputs the inputs
 * @returns whether SURV REACTIVE W/S DET FAULT is active (before the other alerts that list REACTIVE W/S DET)
 */
export function isReactiveWindshearDetectionLost(inputs: SurvSystemAlertInputs): boolean {
  const all = (units: readonly boolean[]) => units.every((u) => u);
  return (
    !isReactiveWindshearDetectionAvailable(inputs.primHealthy, inputs.reactiveWindshearDetectionFailed) ||
    all(inputs.adrFaulty) ||
    all(inputs.irFaulty)
  );
}

/**
 * The "WXR & TAWS ..... SYS 2(1)" line of SURV TURB 1(2) and PRED W/S 1(2) FAULT: the WXR, TURB and PRED W/S
 * functions of the other system are all operative.
 * @param other the other system index
 * @param inputs the inputs
 * @returns whether the line is shown
 */
function otherWxrFullyOperative(other: 0 | 1, inputs: SurvSystemAlertInputs): boolean {
  return !inputs.wxDisplayFailed[other] && !inputs.turbulenceFailed[other] && !inputs.predictiveWindshearFailed[other];
}

/**
 * The lines of SURV TURB 1(2) FAULT (otherFunctionFailed: the PRED W/S of the other system) and SURV PRED W/S 1(2)
 * FAULT (the TURB of the other system): WXR & TAWS ..... SYS 2(1) while the other system has all its WXR functions;
 * [MFD SURV] STATUS & SWTG PAGE ..... CHECK and WXR & TAWS ..... AS RQRD while the other function is failed there.
 * @param failedSystem the system of the alert, index 0 or 1
 * @param otherFunctionFailed the other function failed on SYS 1, 2
 * @param inputs the inputs
 * @returns the 3 lines, true where shown
 */
function wxrFunctionFaultItemsToShow(
  failedSystem: 0 | 1,
  otherFunctionFailed: SystemPair<boolean>,
  inputs: SurvSystemAlertInputs,
): boolean[] {
  const other = failedSystem === 0 ? 1 : 0;
  const check = otherFunctionFailed[other];
  return [otherWxrFullyOperative(other, inputs), check, check];
}

/** The SURV system and WXR function alerts. One instance in FwsCore. */
export class FwsSurvSystemAlerts {
  public readonly survSys1Fault = Subject.create(false);
  public readonly survSys2Fault = Subject.create(false);
  public readonly survSys1And2Fault = Subject.create(false);

  public readonly wxr1Fault = Subject.create(false);
  public readonly wxr2Fault = Subject.create(false);
  public readonly wxr1And2Fault = Subject.create(false);

  public readonly turb1Fault = Subject.create(false);
  public readonly turb2Fault = Subject.create(false);
  public readonly turb1And2Fault = Subject.create(false);

  public readonly predWs1Fault = Subject.create(false);
  public readonly predWs2Fault = Subject.create(false);
  public readonly predWs1And2Fault = Subject.create(false);

  public readonly survSysDegraded = Subject.create(false);

  public readonly reactiveWsDetFault = Subject.create(false);

  /** The inputs of the last update, for the procedure lines */
  private inputs: SurvSystemAlertInputs | null = null;

  /** @param inputs the state of both SURV systems and of the reactive windshear detection */
  public update(inputs: SurvSystemAlertInputs): void {
    this.inputs = inputs;
    const sys = survSystemFaults(inputs);
    this.survSys1Fault.set(sys.sys1);
    this.survSys2Fault.set(sys.sys2);
    this.survSys1And2Fault.set(sys.sys1And2);

    const wxr = functionFaults(inputs.wxDisplayFailed, inputs);
    this.wxr1Fault.set(wxr.sys1);
    this.wxr2Fault.set(wxr.sys2);
    this.wxr1And2Fault.set(wxr.sys1And2);

    const turb = functionFaults(inputs.turbulenceFailed, inputs);
    this.turb1Fault.set(turb.sys1);
    this.turb2Fault.set(turb.sys2);
    this.turb1And2Fault.set(turb.sys1And2);

    const predWs = functionFaults(inputs.predictiveWindshearFailed, inputs);
    this.predWs1Fault.set(predWs.sys1);
    this.predWs2Fault.set(predWs.sys2);
    this.predWs1And2Fault.set(predWs.sys1And2);

    const bothOperative = [0, 1].every((i) => inputs.powered[i] && !inputs.systemLost[i]);
    this.survSysDegraded.set(inputs.linkFailed && bothOperative);

    this.reactiveWsDetFault.set(isReactiveWindshearDetectionLost(inputs));
  }

  /**
   * The lines of SURV TURB 1(2) FAULT.
   * @param failedSystem the system of the alert, index 0 or 1
   * @returns the 3 lines, true where shown
   */
  public turbFaultItemsToShow(failedSystem: 0 | 1): boolean[] {
    return this.inputs
      ? wxrFunctionFaultItemsToShow(failedSystem, this.inputs.predictiveWindshearFailed, this.inputs)
      : [false, false, false];
  }

  /**
   * The lines of SURV PRED W/S 1(2) FAULT.
   * @param failedSystem the system of the alert, index 0 or 1
   * @returns the 3 lines, true where shown
   */
  public predWsFaultItemsToShow(failedSystem: 0 | 1): boolean[] {
    return this.inputs
      ? wxrFunctionFaultItemsToShow(failedSystem, this.inputs.turbulenceFailed, this.inputs)
      : [false, false, false];
  }

  /**
   * The lines of SURV WXR 1+2 FAULT: [MFD SURV] STATUS & SWTG PAGE ..... CHECK and WXR & TAWS ..... AS RQRD, while a
   * TURB or PRED W/S function is still operative.
   * @returns the 2 lines, true where shown
   */
  public wxr1And2FaultItemsToShow(): boolean[] {
    const inputs = this.inputs;
    const anyOperative =
      inputs !== null &&
      [0, 1].some((system) => !inputs.turbulenceFailed[system] || !inputs.predictiveWindshearFailed[system]);
    return [anyOperative, anyOperative];
  }

  /**
   * The line WXR & TAWS ..... SYS 2(1) of SURV SYS 1(2) FAULT and SURV WXR 1(2) FAULT: the WXR of the other system is
   * operative.
   * @param failedSystem the system of the alert, index 0 or 1
   * @returns whether the line is shown
   */
  public otherWxrOperative(failedSystem: 0 | 1): boolean {
    return this.inputs !== null && !this.inputs.wxDisplayFailed[failedSystem === 0 ? 1 : 0];
  }
}

/**
 * Reads the inputs.
 * @param read reads a simvar (SimVar.GetSimVarValue in the sim)
 * @param isFailureActive whether a flyPad failure is active
 * @param powered the busbar of SYS 1 (AC ESS) and SYS 2 (AC 4) powered
 * @param adrFaulty ADR 1, 2, 3 faulty
 * @param irFaulty IR 1, 2, 3 faulty
 * @returns the inputs
 */
export function readSurvSystemAlertInputs(
  read: (name: string, unit: string) => number,
  isFailureActive: (failure: number) => boolean,
  powered: SystemPair<boolean>,
  adrFaulty: readonly [boolean, boolean, boolean],
  irFaulty: readonly [boolean, boolean, boolean],
): SurvSystemAlertInputs {
  const bool = (name: string) => read(name, 'bool') > 0;
  return {
    systemLost: [
      isSurvSystemLost(1, isFailureActive, bool('L:A32NX_RESET_PANEL_AESU1')),
      isSurvSystemLost(2, isFailureActive, bool('L:A32NX_RESET_PANEL_AESU2')),
    ],
    powered,
    wxDisplayFailed: [bool('L:A32NX_WXR_1_FAILED'), bool('L:A32NX_WXR_2_FAILED')],
    turbulenceFailed: [bool('L:A32NX_WXR_1_TURB_FAILED'), bool('L:A32NX_WXR_2_TURB_FAILED')],
    predictiveWindshearFailed: [bool('L:A32NX_WXR_1_PRED_WS_FAILED'), bool('L:A32NX_WXR_2_PRED_WS_FAILED')],
    linkFailed: isFailureActive(A380Failure.SurvSystemLink),
    reactiveWindshearDetectionFailed: isFailureActive(A380Failure.ReactiveWindshearDetection),
    primHealthy: [bool('L:A32NX_PRIM_1_HEALTHY'), bool('L:A32NX_PRIM_2_HEALTHY'), bool('L:A32NX_PRIM_3_HEALTHY')],
    adrFaulty,
    irFaulty,
  };
}
