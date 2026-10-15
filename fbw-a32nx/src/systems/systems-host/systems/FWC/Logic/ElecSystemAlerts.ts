// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/*
 * ELEC alerts of the electrical system failures modelled in Rust (A320 FCOM PRO-ABN-ELEC, a320_fcom.txt):
 * - ELEC BAT 1(2) FAULT, l.76136-76175: "This alert triggers when the charging current increases at an abnormal rate."
 *   "Battery contactor is opened automatically by the battery charge limiter." Crew awareness. STATUS: APU BAT START NOT
 *   AVAIL, INOP SYS BAT 1(2).
 * - ELEC BCL 1(2) FAULT, l.76215-76252: "This alert triggers when the battery charge limiter 1(2) is failed." Crew
 *   awareness. STATUS: APU BAT START NOT AVAIL, INOP SYS BCL 1(2).
 * - ELEC GEN 1(2) OR APU GEN OVERLOAD, l.77964-77988: "This alert triggers when the load of one generator is above 100%
 *   of rated output." GALY/CAB ... OFF. STATUS: INOP SYS GALY/CAB.
 * - ELEC IDG 1(2) OIL LO PR/OVHT, l.78147-78199: "The alert ELEC IDG 1(2) OIL LO PR triggers when the IDG 1(2) oil
 *   pressure is low. The alert ELEC IDG 1(2) OIL OVHT triggers when the IDG 1(2) outlet oil temperature rises above
 *   180 °C." IDG (AFFECTED) ... OFF. STATUS: CAT 3 SINGLE ONLY; INOP SYS MAIN GALLEY (only if APU GEN is not online),
 *   GEN 1(2), CAT 3 DUAL.
 * - ELEC STATIC INV FAULT, l.78201-78213: "The alert triggers when the static inverter is failed." Crew awareness.
 *
 * The flight phase inhibitions are images, read on the 2019 FCOM PDF (Docs/A320 Neo FCOM_1.pdf): BAT FAULT page 4649,
 * BCL FAULT page 4651, GEN OVERLOAD page 4745 and STATIC INV FAULT page 4759 inhibited in phases 3, 4, 5, 7 and 8; IDG
 * OIL LO PR/OVHT page 4756 in phases 1, 4, 5, 7, 8 and 10. All are amber cautions (titles in amber in the FCOM).
 */

export const BAT_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];
export const BCL_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];
export const GEN_OVERLOAD_PHASE_INHIBITION = [3, 4, 5, 7, 8];
export const IDG_OIL_PHASE_INHIBITION = [1, 4, 5, 7, 8, 10];
export const STATIC_INV_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** A320 FCOM PRO-ABN-ELEC l.78158-78159 and DSC-24-20 l.37133: the IDG oil outlet overheat threshold */
export const IDG_OIL_OVERHEAT_CELSIUS = 180;

/** The electrical system state the alerts need, from the Rust electrical system (see Acquisition/ElecSystemAcquisition) */
export interface ElecSystemInputs {
  /** L:A32NX_ELEC_BCL_n_BAT_FAULT: the BCL saw an abnormal charge and opened the battery contactor */
  bclBatteryFault: readonly [boolean, boolean];
  /** L:A32NX_ELEC_BCL_n_FAULT: the BCL has failed */
  bclFault: readonly [boolean, boolean];
  /** L:A32NX_ELEC_ENG_GEN_n_IDG_IS_CONNECTED */
  idgConnected: readonly [boolean, boolean];
  /** L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_LOW_PRESSURE: the GCU signal, already inhibited below N2 14 % */
  idgOilLowPressure: readonly [boolean, boolean];
  /** L:A32NX_ELEC_ENG_GEN_n_IDG_OIL_OUTLET_TEMPERATURE in °C */
  idgOilOutletTemperature: readonly [number, number];
  /** L:A32NX_ELEC_ENG_GEN_n_LOAD_NORMAL */
  engineGeneratorLoadNormal: readonly [boolean, boolean];
  /** L:A32NX_ELEC_CONTACTOR_9XU1(2)_IS_CLOSED: the generator line contactor */
  engineGeneratorLineContactorClosed: readonly [boolean, boolean];
  /** L:A32NX_ELEC_APU_GEN_1_LOAD_NORMAL */
  apuGeneratorLoadNormal: boolean;
  /** L:A32NX_ELEC_CONTACTOR_3XS_IS_CLOSED: the APU generator line contactor */
  apuGeneratorContactorClosed: boolean;
  /** L:A32NX_ELEC_STAT_INV_FAULT */
  staticInverterFault: boolean;
}

export interface ElecSystemAlertStates {
  batFault: [boolean, boolean];
  bclFault: [boolean, boolean];
  idgOilLowPressure: [boolean, boolean];
  idgOilOverheat: [boolean, boolean];
  genOverload: [boolean, boolean];
  apuGenOverload: boolean;
  staticInverterFault: boolean;
}

/**
 * The alert conditions. Design choices: a generator overload is only monitored while the generator supplies the network
 * (its line contactor closed), as an unpowered generator has no load; the IDG oil alerts need a connected IDG, as the
 * FCOM IDG pb (DSC-24-20 l.37135) "extinguishes when the IDG is disconnected".
 */
export function elecSystemAlertStates(inputs: ElecSystemInputs): ElecSystemAlertStates {
  const pair = (fn: (index: 0 | 1) => boolean): [boolean, boolean] => [fn(0), fn(1)];
  return {
    batFault: pair((i) => inputs.bclBatteryFault[i]),
    bclFault: pair((i) => inputs.bclFault[i]),
    idgOilLowPressure: pair((i) => inputs.idgConnected[i] && inputs.idgOilLowPressure[i]),
    idgOilOverheat: pair((i) => inputs.idgConnected[i] && inputs.idgOilOutletTemperature[i] > IDG_OIL_OVERHEAT_CELSIUS),
    genOverload: pair((i) => inputs.engineGeneratorLineContactorClosed[i] && !inputs.engineGeneratorLoadNormal[i]),
    apuGenOverload: inputs.apuGeneratorContactorClosed && !inputs.apuGeneratorLoadNormal,
    staticInverterFault: inputs.staticInverterFault,
  };
}

/** The alert subjects of the PseudoFWC entries */
export class ElecSystemAlertMonitor {
  public readonly batFault = [Subject.create(false), Subject.create(false)] as const;

  public readonly bclFault = [Subject.create(false), Subject.create(false)] as const;

  public readonly idgOilLowPressure = [Subject.create(false), Subject.create(false)] as const;

  public readonly idgOilOverheat = [Subject.create(false), Subject.create(false)] as const;

  public readonly genOverload = [Subject.create(false), Subject.create(false)] as const;

  public readonly apuGenOverload = Subject.create(false);

  public readonly staticInverterFault = Subject.create(false);

  public update(inputs: ElecSystemInputs): void {
    const states = elecSystemAlertStates(inputs);
    for (const index of [0, 1] as const) {
      this.batFault[index].set(states.batFault[index]);
      this.bclFault[index].set(states.bclFault[index]);
      this.idgOilLowPressure[index].set(states.idgOilLowPressure[index]);
      this.idgOilOverheat[index].set(states.idgOilOverheat[index]);
      this.genOverload[index].set(states.genOverload[index]);
    }
    this.apuGenOverload.set(states.apuGenOverload);
    this.staticInverterFault.set(states.staticInverterFault);
  }
}

export interface ElecSystemStatus {
  /** STATUS left column codes (StatusMessages) */
  left: string[];
  /** STATUS INOP SYS codes (StatusMessages) */
  inopSys: string[];
}

/** APU BAT START NOT AVAIL */
const APU_BAT_START_NOT_AVAIL = '240200201';

/** STATUS of ELEC BAT 1(2) FAULT (FCOM l.76173-76175) */
export function batFaultStatus(batteryNumber: 1 | 2): ElecSystemStatus {
  return { left: [APU_BAT_START_NOT_AVAIL], inopSys: [batteryNumber === 1 ? '240300201' : '240300202'] };
}

/** STATUS of ELEC BCL 1(2) FAULT (FCOM l.76250-76252) */
export function bclFaultStatus(bclNumber: 1 | 2): ElecSystemStatus {
  return { left: [APU_BAT_START_NOT_AVAIL], inopSys: [bclNumber === 1 ? '240300203' : '240300204'] };
}

/** STATUS of ELEC GEN 1(2) OR APU GEN OVERLOAD (FCOM l.77986-77988): INOP SYS GALY/CAB */
export function genOverloadStatus(): ElecSystemStatus {
  return { left: [], inopSys: ['240300205'] };
}

/**
 * STATUS of ELEC IDG 1(2) OIL LO PR/OVHT (FCOM l.78185-78199): CAT 3 SINGLE ONLY; INOP SYS MAIN GALLEY (only if the APU
 * GEN is not online), GEN 1(2), CAT 3 DUAL. The FCOM note "If available, the APU may be started and the APU GEN used." is
 * not a STATUS line.
 */
export function idgOilStatus(idgNumber: 1 | 2, apuGenOnline: boolean): ElecSystemStatus {
  const inopSys = apuGenOnline ? [] : ['240300001'];
  inopSys.push(idgNumber === 1 ? '240300002' : '240300003', '220300001');
  return { left: ['220200001'], inopSys };
}

/** The E/WD lines of ELEC IDG 1(2) OIL LO PR (or OVHT): title, IDG 1(2) OFF (FCOM l.78165) */
export function idgOilLines(): number[] {
  return [0, 1];
}

/** The E/WD lines of ELEC GEN 1(2) / APU GEN OVERLOAD: title, GALY/CAB OFF until done (FCOM l.77980) */
export function genOverloadLines(galyAndCabOff: boolean): (number | null)[] {
  return [0, galyAndCabOff ? null : 1];
}
