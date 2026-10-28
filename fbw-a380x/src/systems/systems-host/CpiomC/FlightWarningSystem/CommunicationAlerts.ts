// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATA 23 COMMUNICATION alerts of the A380X FWS (A380 FCOM PRO-ABN-ECAM-10-23, a380_fcom.txt l.137020-137620,
 * airbus-a380-fcom PDF p.4811-4830) and the PA IN USE memo (DSC-23-20 MEMO, l.49491-49492, PDF p.1607).
 * Fed by flyPad failures (A380Failure 23008-23019) for what the sim does not model (the CIDS, the PTT switches), by the
 * RMP transmission keys (L:A380X_RMP_<n>_<key>, RMP AudioControlManager) and by VHF 3 (failure 23007, data or voice
 * mode on the RMP).
 * Not simulated: HF 1(2) EMITTING, HF 1(2) DATALINK FAULT and the SATCOM alerts (no HF or SATCOM radio), the ACR failure
 * part of COM DATALINK FAULT (DATALINK INIT FAULT, ATC COM VOICE ONLY).
 */

/**
 * Inhibited in flight phases 3 to 7, 9 and 10: CAB COM CIDS 1+2+3 FAULT, CAB COM CIDS CABIN COM FAULT, COM CAPT
 * (F/O)(THIRD OCCUPANT) PTT STUCK, COM DATALINK FAULT, COM VHF 1(2)(3) EMITTING and COM VHF 3 DATALINK FAULT
 */
export const COM_ALERT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

export const COM_DEGRADED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export const COM_ALERT_IDS = {
  cids123Fault: '230800001',
  cidsCabinComFault: '230800002',
  comDegraded: '230800003',
  pttStuck: ['230800004', '230800005', '230800006'],
  datalinkFault: '230800007',
  vhfEmitting: ['230800022', '230800023', '230800024'],
  vhf3DatalinkFault: '230800025',
} as const;

/** STATUS INOP SYS ALL PHASES of CAB COM CIDS 1+2+3 FAULT: CIDS 1+2+3 */
export const CIDS_123_FAULT_INOP_SYS = ['230300001'];

/** STATUS INOP SYS of COM VHF 3 DATALINK FAULT: VHF 3 DATALINK */
export const VHF3_DATALINK_FAULT_INOP_SYS = ['230300021'];

/** The CIDS failures of the flyPad */
export interface CidsInputs {
  readonly directorFailed: readonly boolean[];
  readonly upperDeckPaFailed: boolean;
  readonly mainDeckPaFailed: boolean;
  readonly lowerDeckPaFailed: boolean;
  readonly cabinInterphoneFailed: boolean;
  /** PA failed in some areas of the cabin only */
  readonly paDegraded: boolean;
  /** Cabin interphone failed at some stations only */
  readonly cabinInterphoneDegraded: boolean;
}

export interface CidsAlerts {
  readonly cids123Fault: boolean;
  readonly cabinComFault: boolean;
  /** UPPER DECK PA FAULT, MAIN DECK PA FAULT, LOWER DECK PA FAULT, CABIN INTERPHONE FAULT */
  readonly cabinComFaultLines: boolean[];
  /** STATUS INOP SYS of CIDS CABIN COM FAULT: only the functions that are failed */
  readonly cabinComFaultInopSys: string[];
  readonly comDegraded: boolean;
  /** PA DEGRADED, CABIN INTERPHONE DEGRADED */
  readonly comDegradedLines: boolean[];
}

/**
 * The CAB COM alerts:
 * - CIDS 1+2+3 FAULT: the three CIDS directors are failed.
 * - CIDS CABIN COM FAULT: the cabin interphone, the upper deck PA or the main deck PA is failed; the LOWER DECK PA
 *   FAULT line can come with them but does not trigger the alert.
 * - COM DEGRADED: some PA or cabin interphone functions are failed in some areas of the cabin only.
 * Design choice: with the three CIDS failed (all the cabin communication is lost) only CIDS 1+2+3 FAULT is shown; the
 * other two are not active while it is (notActiveWhenItemActive).
 * @param inputs the CIDS failures
 * @returns the alerts and their lines
 */
export function cidsAlerts(inputs: CidsInputs): CidsAlerts {
  const cids123Fault = inputs.directorFailed.length === 3 && inputs.directorFailed.every((failed) => failed);
  const cabinComFault = inputs.upperDeckPaFailed || inputs.mainDeckPaFailed || inputs.cabinInterphoneFailed;
  const cabinComFaultLines = [
    inputs.upperDeckPaFailed,
    inputs.mainDeckPaFailed,
    inputs.lowerDeckPaFailed,
    inputs.cabinInterphoneFailed,
  ];
  // INOP SYS in the order of the lines: UPPER DECK PA, MAIN DECK PA, LOWER DECK PA, CABIN INTERPHONE
  const cabinComFaultInopSys = ['230300002', '230300003', '230300004', '230300005'].filter(
    (_, index) => cabinComFaultLines[index],
  );
  return {
    cids123Fault,
    cabinComFault,
    cabinComFaultLines,
    cabinComFaultInopSys,
    comDegraded: inputs.paDegraded || inputs.cabinInterphoneDegraded,
    comDegradedLines: [inputs.paDegraded, inputs.cabinInterphoneDegraded],
  };
}

/** The transmission keys of an RMP, in the L:A380X_RMP_<n>_<key> names of the RMP AudioControlManager */
const RMP_TRANSMISSION_KEYS = [
  'VHF_TX_1',
  'VHF_TX_2',
  'VHF_TX_3',
  'HF_TX_1',
  'HF_TX_2',
  'TEL_TX_1',
  'TEL_TX_2',
  'INT_TX',
  'CAB_TX',
  'PA_TX',
] as const;

export interface RmpTransmissionKeys {
  readonly vhf: readonly boolean[];
  readonly pa: boolean;
  /** Any transmission key selected (VHF, HF, TEL, INT, CAB, PA) */
  readonly any: boolean;
}

/**
 * @param rmp the RMP number, 1 to 3
 * @param readBool reads a Bool L:var
 * @returns the transmission keys selected on that RMP
 */
export function readRmpTransmissionKeys(rmp: number, readBool: (name: string) => boolean): RmpTransmissionKeys {
  const selected = RMP_TRANSMISSION_KEYS.map((key) => readBool(`L:A380X_RMP_${rmp}_${key}`));
  return {
    vhf: selected.slice(0, 3),
    pa: selected[RMP_TRANSMISSION_KEYS.indexOf('PA_TX')],
    any: selected.some((on) => on),
  };
}

/**
 * PA IN USE: the crew holds the PA transmission key to make a cabin announcement. The PA key of the sim RMPs latches on
 * (AudioControlManager onKeyPressed), so the memo shows while the PA transmission key of any RMP is on. Not inhibited
 * in any flight phase.
 * @param rmpKeys the keys of RMP 1, 2, 3
 * @returns whether the memo is shown
 */
export function isPaInUse(rmpKeys: readonly RmpTransmissionKeys[]): boolean {
  return rmpKeys.some((keys) => keys.pa);
}

export interface ComTransmissionInputs {
  /**
   * The PTT sw of the CAPT, the F/O and the third occupant is in the transmit position. No PTT sw is modelled: only
   * their "stuck in transmit" flyPad failures set it.
   */
  readonly pttPressed: readonly boolean[];
  /** The keys of RMP 1, 2, 3: each RMP controls the microphone of its seat (CAPT, F/O, third occupant) */
  readonly rmpKeys: readonly RmpTransmissionKeys[];
}

export interface ComTransmissionAlerts {
  readonly pttStuck: boolean[];
  readonly vhfEmitting: boolean[];
}

/**
 * The time monitoring of the PTT switches and of the VHF transmissions:
 * - PTT STUCK: the PTT sw of a seat stays in the transmit position for more than 40 s while no transmission key is
 *   selected on the RMP of that seat.
 * - VHF 1(2)(3) EMITTING: the VHF transmits (key and PTT pressed) for more than 35 s; after 60 s the single chime
 *   sounds and the MASTER CAUT comes on.
 * Design choice: the FWS gives the single chime and the MASTER CAUT only when an alert appears (FwsCore), so VHF
 * EMITTING is raised after 60 s of transmission, with them and its RMP TX KEY ... DESELECT line; the 35 s to 60 s
 * display without them is not shown.
 */
export class ComTransmissionMonitor {
  public static readonly PTT_STUCK_S = 40;

  public static readonly VHF_EMITTING_S = 60;

  private readonly pttStuckTimeS = [0, 0, 0];

  private readonly vhfTransmitTimeS = [0, 0, 0];

  /**
   * @param inputs the PTT switches and the RMP keys
   * @param deltaTimeMs the time since the last update, in milliseconds
   * @returns the alerts
   */
  public update(inputs: ComTransmissionInputs, deltaTimeMs: number): ComTransmissionAlerts {
    const deltaS = deltaTimeMs / 1000;
    const pttStuck = [0, 1, 2].map((station) => {
      const condition = inputs.pttPressed[station] && !inputs.rmpKeys[station].any;
      this.pttStuckTimeS[station] = condition ? this.pttStuckTimeS[station] + deltaS : 0;
      return condition && this.pttStuckTimeS[station] > ComTransmissionMonitor.PTT_STUCK_S;
    });
    const vhfEmitting = [0, 1, 2].map((vhf) => {
      const transmitting = [0, 1, 2].some((station) => inputs.pttPressed[station] && inputs.rmpKeys[station].vhf[vhf]);
      this.vhfTransmitTimeS[vhf] = transmitting ? this.vhfTransmitTimeS[vhf] + deltaS : 0;
      return transmitting && this.vhfTransmitTimeS[vhf] > ComTransmissionMonitor.VHF_EMITTING_S;
    });
    return { pttStuck, vhfEmitting };
  }
}

export interface DatalinkInputs {
  readonly vhf3Failed: boolean;
  /** VHF 3 is in data mode on the RMP */
  readonly vhf3DataMode: boolean;
}

export interface DatalinkAlerts {
  readonly vhf3DatalinkFault: boolean;
  /** COM DATALINK FAULT, here only its "all means of data communication are failed, or in voice mode" case */
  readonly datalinkFault: boolean;
}

/**
 * - VHF 3 DATALINK FAULT: VHF 3 or its data mode is failed; here the VHF 3 failure.
 * - COM DATALINK FAULT: also raised, without single chime or MASTER CAUT, when every data medium (VHF 3, both HF and
 *   the SATCOM) is failed or in voice mode, with the line VHF & HF & SATCOM DATA NOT AVAIL. The sim has no HF and no
 *   SATCOM: VHF 3 is the only data medium of the ACR (CpiomD/Acr.ts A380xVhfProvider), so the datalink is lost when VHF
 *   3 is failed or in voice mode.
 * @param inputs VHF 3
 * @returns the alerts
 */
export function datalinkAlerts(inputs: DatalinkInputs): DatalinkAlerts {
  return {
    vhf3DatalinkFault: inputs.vhf3Failed,
    datalinkFault: inputs.vhf3Failed || !inputs.vhf3DataMode,
  };
}

/**
 * COM DATALINK FAULT lines: 0 DATALINK INIT FAULT, 1 ATC COM VOICE ONLY, 2 VHF & HF & SATCOM DATA NOT AVAIL. Only the
 * last one is simulated (no ACR failure).
 */
export const DATALINK_FAULT_ITEMS_TO_SHOW = [false, false, true];
