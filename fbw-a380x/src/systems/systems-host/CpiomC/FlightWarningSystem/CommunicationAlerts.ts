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
 * Also the ATA 46 information system COM alerts (PRO-ABN-ECAM-10-46, l.169812-169959, PDF p.5719-5723): COM ADS
 * DATALINK FAULT, COM ATC DATALINK FAULT, COM NSS DATA TO AVNCS XFR FAULT and COM NSS/AVNCS DATA XFR FAULT.
 */

/**
 * CAB COM CIDS 1+2+3 FAULT, CAB COM CIDS CABIN COM FAULT, COM CAPT (F/O)(THIRD OCCUPANT) PTT STUCK, COM DATALINK FAULT,
 * COM VHF 1(2)(3) EMITTING and COM VHF 3 DATALINK FAULT: flight phases 3 to 7, 9 and 10 (PDF p.4811, 4813, 4816, 4817,
 * 4829, 4830)
 */
export const COM_ALERT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** CAB COM COM DEGRADED: flight phases 3 to 11 (PDF p.4815) */
export const COM_DEGRADED_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The alert ids (ata21-22-23.ts) */
export const COM_ALERT_IDS = {
  cids123Fault: '230800001',
  cidsCabinComFault: '230800002',
  comDegraded: '230800003',
  /** CAPT, F/O, THIRD OCCUPANT PTT STUCK */
  pttStuck: ['230800004', '230800005', '230800006'],
  datalinkFault: '230800007',
  /** VHF 1, 2, 3 EMITTING */
  vhfEmitting: ['230800022', '230800023', '230800024'],
  vhf3DatalinkFault: '230800025',
} as const;

/** STATUS INOP SYS ALL PHASES of CAB COM CIDS 1+2+3 FAULT: CIDS 1+2+3 (l.137066-137071) */
export const CIDS_123_FAULT_INOP_SYS = ['230300001'];

/** STATUS INOP SYS of COM VHF 3 DATALINK FAULT: VHF 3 DATALINK (l.137614-137618) */
export const VHF3_DATALINK_FAULT_INOP_SYS = ['230300021'];

/** The CIDS failures of the flyPad */
export interface CidsInputs {
  /** CIDS director 1, 2 and 3 failed */
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
  /** STATUS INOP SYS of CIDS CABIN COM FAULT, "(If affected)" (l.137119-137127) */
  readonly cabinComFaultInopSys: string[];
  readonly comDegraded: boolean;
  /** PA DEGRADED, CABIN INTERPHONE DEGRADED */
  readonly comDegradedLines: boolean[];
}

/**
 * The CAB COM alerts:
 * - CIDS 1+2+3 FAULT: "The Cabin Data Communication Systems (CIDS) 1, 2 and 3 are failed." (l.137033)
 * - CIDS CABIN COM FAULT: "At least one of the following functions of the CIDS is failed: The cabin interphone, The
 *   upper deck Passenger Address (PA), The main deck PA." (l.137086-137089); the LOWER DECK PA FAULT line "may appear"
 *   with them (l.137107-137112), it does not trigger the alert.
 * - COM DEGRADED: "Some functions of the Passenger Address (PA) or the cabin interphone are failed in some areas of the
 *   cabin" (l.137144-137146).
 * Design choice: with the three CIDS failed (all the cabin communication lost, l.137060-137064) only CIDS 1+2+3 FAULT is
 * shown; the other two are not active while it is (notActiveWhenItemActive).
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
  // UPPER DECK PA, MAIN DECK PA, LOWER DECK PA, CABIN INTERPHONE (EcamInopSys 230300002-005)
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
export const RMP_TRANSMISSION_KEYS = [
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

/** The transmission keys selected on one RMP */
export interface RmpTransmissionKeys {
  /** VHF 1, 2, 3 transmission key selected */
  readonly vhf: readonly boolean[];
  /** The PA transmission key selected */
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
 * PA IN USE: "The flight crew presses and maintains the PA transmission key, in order to make an announcement in the
 * cabin." (DSC-23-20, l.49491-49492). The PA key of the sim RMPs latches on (AudioControlManager onKeyPressed), so the
 * memo shows while the PA transmission key of any RMP is on. No flight phase inhibition figure for it (PDF p.1607).
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
  /** The keys of RMP 1, 2, 3: "RMP 1 controls the microphones for the Captain, RMP 2 ... the First Officer, RMP 3 ...
   * the third occupant" (DSC-23-20, l.47990-47993) */
  readonly rmpKeys: readonly RmpTransmissionKeys[];
}

export interface ComTransmissionAlerts {
  /** COM CAPT, F/O, THIRD OCCUPANT PTT STUCK */
  readonly pttStuck: boolean[];
  /** COM VHF 1, 2, 3 EMITTING */
  readonly vhfEmitting: boolean[];
}

/**
 * The time monitoring of the PTT switches and of the VHF transmissions:
 * - PTT STUCK: "The Captain (F/O)(Third Occupant) PTT sw is stuck in the transmit position for more than 40 s, and no
 *   transmission key is selected on the associated RMP." (l.137175-137176)
 * - VHF 1(2)(3) EMITTING: "VHF 1(2)(3) transmits (associated transmission key and PTT sw pressed) during more than 35 s.
 *   After 60 s: A single chime sounds, The master caution light goes on." (l.137574-137580)
 * Design choice: the FWS gives the single chime and the MASTER CAUT only when an alert appears (FwsCore), so VHF
 * EMITTING is raised after 60 s of transmission, with them and its "After 60 s of VHF emitting: RMP TX KEY ... DESELECT"
 * line (l.137590-137591); the 35 s to 60 s display without them is not shown.
 */
export class ComTransmissionMonitor {
  /** l.137175 */
  public static readonly PTT_STUCK_S = 40;

  /** l.137577-137580 */
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
  /** VHF 3 failed (flyPad failure 23007) */
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
 * - VHF 3 DATALINK FAULT: "VHF 2(3) is failed, or VHF 2(3) data mode is failed." (l.137608), here the VHF 3 failure.
 * - COM DATALINK FAULT: "This alert may also be triggered if all means of data communication (VHF 3, both HF transceivers
 *   and the SATCOM) are failed, or in voice mode. In this case, no Single Chime is generated, and the Master Caution does
 *   not go on." with the line VHF & HF & SATCOM DATA NOT AVAIL (l.137208-137211, l.137239-137240). The sim has no HF
 *   and no SATCOM: VHF 3 is the only data medium of the ACR (CpiomD/Acr.ts A380xVhfProvider), so the datalink is lost
 *   when VHF 3 is failed or in voice mode.
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
 * COM DATALINK FAULT lines (ata21-22-23.ts 230800007, l.137232-137240): 0 DATALINK INIT FAULT, 1 ATC COM VOICE ONLY,
 * 2 VHF & HF & SATCOM DATA NOT AVAIL. Only the last one is simulated (no ACR failure).
 */
export const DATALINK_FAULT_ITEMS_TO_SHOW = [false, false, true];

/*
 * ATA 46 INFORMATION SYSTEM: the COM alerts of the ATC datalink applications (CPIOM D) and of the NSS / avionics data
 * exchange (the two Secure Communication Interfaces, SCI).
 */

/**
 * COM ADS DATALINK FAULT, COM ATC DATALINK FAULT, COM NSS DATA TO AVNCS XFR FAULT and COM NSS/AVNCS DATA XFR FAULT:
 * flight phases 3 to 7, 9 and 10 (FCOM figures, PDF p.5719, 5720, 5722, 5723)
 */
export const INFO_SYS_ALERT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** The alert ids (ata46-49-52-56.ts) */
export const INFO_SYS_ALERT_IDS = {
  adsDatalinkFault: '460800001',
  atcDatalinkFault: '460800002',
  nssDataToAvncsXfrFault: '460800003',
  nssAvncsDataXfrFault: '460800004',
} as const;

/** STATUS INOP SYS ALL PHASES of COM ADS DATALINK FAULT: ADS DATALINK (l.169827-169831) */
export const ADS_DATALINK_FAULT_INOP_SYS = ['460300001'];

/** STATUS INOP SYS ALL PHASES of COM ATC DATALINK FAULT: ATC DATALINK (l.169878-169884) */
export const ATC_DATALINK_FAULT_INOP_SYS = ['460300002'];

/** LIMITATIONS ON ECAM ALL PHASES of COM ATC DATALINK FAULT: ATC COM VOICE ONLY (l.169871-169876) */
export const ATC_DATALINK_FAULT_LIMITATIONS = ['460400001'];

/** STATUS INOP SYS ALL PHASES of COM NSS DATA TO AVNCS XFR FAULT: NSS DATA TO AVNCS (l.169920-169925) */
export const NSS_DATA_TO_AVNCS_XFR_FAULT_INOP_SYS = ['460300003'];

/** STATUS INOP SYS ALL PHASES of COM NSS/AVNCS DATA XFR FAULT: NSS/AVNCS DATA XFR (l.169954-169959) */
export const NSS_AVNCS_DATA_XFR_FAULT_INOP_SYS = ['460300004'];

export interface InformationSystemInputs {
  /**
   * CPIOM D1 available (L:A32NX_CPIOM_D1_AVAIL): it hosts the ATC datalink applications (CPDLC, ADS), CpiomD/AtcDatalink.ts
   * powers them down without it. "The ATC system is installed on CPIOM-D." (DSC-46-10-10-10, l.95659)
   */
  readonly cpiomD1Available: boolean;
  /** The ADS function failed (flyPad failure 46010): the sim has no ADS-C, only this failure stops it alone */
  readonly adsFunctionFailed: boolean;
  /**
   * The NSS DATA TO AVNCS pb-sw is OFF (L:A32NX_OVHD_NSS_DATA_TO_AVNCS_TOGGLE = 0, OFF light; 1 = normal, the value of
   * every flight file)
   */
  readonly nssDataToAvncsPbOff: boolean;
  /** SCI 1 and SCI 2 failed (flyPad failures 46008, 46009) */
  readonly sciFailed: readonly boolean[];
}

export interface InformationSystemAlerts {
  readonly adsDatalinkFault: boolean;
  readonly atcDatalinkFault: boolean;
  readonly nssDataToAvncsXfrFault: boolean;
  readonly nssAvncsDataXfrFault: boolean;
}

/**
 * - COM ATC DATALINK FAULT: "All ATC data-link application are stopped or when controller pilot data-link communication
 *   application is stopped." (l.169848-169849): CPIOM D1 not available, the ATC application of the sim is then powered
 *   down (CpiomD/AtcDatalink.ts). "If CPIOM D group is failed: ATC COM VOICE ONLY. All ATC datalink functions are
 *   failed (i.e. ADS, CPDLC, Digital ATIS)." (l.158374-158377).
 * - COM ADS DATALINK FAULT: "The Automatic Dependance Surveillance (ADS) function is stopped." (l.169820): the ADS
 *   failure, or CPIOM D1 lost. Design choice: with the whole ATC datalink lost only COM ATC DATALINK FAULT shows (its
 *   INFO "If ADS is operative: ADS DATALINK STILL AVAIL", l.169886-169889, tells the ADS state; FwsAbnormalSensed sets
 *   notActiveWhenItemActive), as AVIONICS NETWORK ALL SWITCHES FAULT lists ATC DATALINK and no ADS DATALINK (l.169381).
 * - COM NSS DATA TO AVNCS XFR FAULT: "The SCIs are declared faulty, or the NSS DATA TO AVNCS pb-sw is set to OFF."
 *   (l.169906): here the pb-sw OFF (the one-way SCI state), the SCI failures give the next alert.
 * - COM NSS/AVNCS DATA XFR FAULT: "Both SCIs are lost." (l.169942); it then replaces the previous one
 *   (notActiveWhenItemActive), the data exchange is lost both ways.
 * @param inputs the CPIOM D1, ADS, pb-sw and SCI states
 * @returns the alerts
 */
export function informationSystemAlerts(inputs: InformationSystemInputs): InformationSystemAlerts {
  const atcDatalinkFault = !inputs.cpiomD1Available;
  return {
    adsDatalinkFault: atcDatalinkFault || inputs.adsFunctionFailed,
    atcDatalinkFault,
    nssDataToAvncsXfrFault: inputs.nssDataToAvncsPbOff,
    nssAvncsDataXfrFault: inputs.sciFailed.length === 2 && inputs.sciFailed.every((failed) => failed),
  };
}
