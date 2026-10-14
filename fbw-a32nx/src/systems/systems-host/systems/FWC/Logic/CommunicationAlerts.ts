// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, NO_STATUS, cautionItem } from './FwcAlertItem';

/*
 * The ATA 23 COMMUNICATIONS alerts and memo of the A320 FWC (A320 FCOM, a320_fcom.txt; the title colours and the flight
 * phase inhibition figures are images, read on the FCOM PDF "A320 Neo FCOM_1.pdf", page given at each one):
 * - COM CIDS 1 + 2 FAULT (PRO-ABN-COM l.73578-73603, PDF p.4488): "This alert triggers when there is a total loss of
 *   CIDS"; crew awareness; STATUS INOP SYS CIDS.
 * - COM SINGLE PTT STUCK (l.73725-73785, PDF p.4492-4493, the standard of MSN 01767-08541 and most later ones): "any PTT
 *   transmission selector is jammed in the transmit position for more than 40 s (VHF) or for more than 180 s (HF)";
 *   ACP1 VHF 1(2)(3) TX DESELECT, IF UNSUCCESSFUL: ACP2 ..., IF UNSUCCESSFUL: ACP3 ...; "When the ACP linked to the
 *   faulty PTT is detected, the previous ECAM actions are replaced by": AUDIO SWTG DO NOT USE, ON AFFECTED ACP: ALL TX
 *   KEYS DO NOT USE, ON ALL OTHER ACP: VHF 1(2)(3) TX RESELECT; STATUS AUDIO SWTG DO NOT USE, INOP SYS SINGLE PTT.
 * - COM VHF 1(2)(3) EMITTING (l.73797-73829, PDF p.4496): "the alert triggers when the transmitter emits more than 30 s
 *   or 60 s depending on aircraft configuration"; the procedure is crew notes (release the PTT, deselect the TX key,
 *   pull the VHF C/B), no ECAM action line.
 * - COM VHF 3 DATA FAULT (l.73841-73865, PDF p.4497): "data communication via VHF 3 are inoperative"; crew awareness;
 *   STATUS INOP SYS VHF 3 DATA.
 * - AUDIO 3 XFRD memo (DSC-23-50 l.36144-36150): "This memo appears in green, if the AUDIO SWITCHING selector is not on
 *   NORM".
 *
 * Inputs: the flyPad failures 23007 (VHF 3), 23008/23009 (CIDS directors), 23017/23018 (CAPT, F/O PTT stuck in
 * transmit) and 23020-23022 (VHF transmitter stuck emitting); the transmission key of ACP 1 and 2
 * (L:XMLVAR_COM_PANEL1(2)_Transmit_Channel: 0, 1, 2 = VHF 1, 2, 3, AirlinerCommon.xml), the VHF supplies (systems.cfg:
 * VHF 1 on DC ESS, VHF 2 on DC 2, VHF 3 on DC 1), the VHF 3 DATA mode (A:COM ACTIVE FREQUENCY:3 = 0, as atsu.ts) and the
 * AUDIO SWITCHING selector (L:KNOB_OVHD_AUDIOSWITCH_Position, 1 = NORM).
 * Not simulated: HF 1(2) EMITTING and the HF TX lines (the A32NX has no HF), ACP 3 and the third occupant PTT (no
 * failure, the ACP3 line is still shown as in the FCOM), COM ACARS FAULT (the A32NX has an ATSU, not an ACARS MU: its
 * failure is DATALINK ATSU FAULT, Logic/DatalinkAlerts).
 *
 * Design choices:
 * - A stuck PTT transmits on the VHF its ACP has the TX key on. SINGLE PTT STUCK latches the VHF it saw, and stays until
 *   the PTT failure is cleared. "The ACP linked to the faulty PTT is detected" when that ACP has no VHF TX key any more
 *   (the transmission stopped after a DESELECT on it).
 * - The ACP DESELECT lines are sensed (gone once the ACP has no TX key on that VHF), the next ACP comes after the IF
 *   UNSUCCESSFUL line once the previous one is done; the RESELECT line is gone once the other ACP has the key again.
 * - VHF EMITTING uses 60 s, the longer of the two FCOM times, so that SINGLE PTT STUCK (40 s) comes first with a stuck
 *   PTT, as its procedure ends the emission. A VHF emits when it is supplied and not failed (23005-23007), and VHF 3 in
 *   DATA mode does not take voice from a PTT.
 * - VHF 3 DATA FAULT: VHF 3 failed (23007) in DATA mode (the supply loss is in the ELEC alerts).
 * - CIDS 1 + 2 FAULT and VHF 3 DATA FAULT are crew awareness: level 1 (FCOM DSC-31 l.45551-45556). SINGLE PTT STUCK
 *   (procedure) and VHF EMITTING (crew action) are level 2.
 * - The memo has the flight phase inhibition of the VHF3 VOICE memo: 3, 4, 5, 7, 8 (the FCOM memo page gives none).
 */

/** The flight phase inhibitions, from the figures of the FCOM PDF ("A320 Neo FCOM_1.pdf") */
export const COM_PHASE_INHIBITION = {
  /** COM CIDS 1 + 2 FAULT, page 4488 */
  cidsFault: [3, 4, 5, 7, 8],
  /** COM SINGLE PTT STUCK, page 4492 */
  singlePttStuck: [3, 4, 5, 7, 8],
  /** COM VHF 1(2)(3) EMITTING, page 4496 */
  vhfEmitting: [3, 4, 5, 7, 8],
  /** COM VHF 3 DATA FAULT, page 4497 */
  vhf3DataFault: [3, 4, 5, 7, 8],
  /** AUDIO 3 XFRD memo, as the VHF3 VOICE memo (design choice, see above) */
  audio3XfrdMemo: [3, 4, 5, 7, 8],
};

/** "jammed in the transmit position for more than 40 s (VHF)" (l.73735-73736), in seconds */
export const PTT_STUCK_TIME_S = 40;

/** "the transmitter emits more than 30 s or 60 s depending on aircraft configuration" (l.73806-73807), in seconds */
export const VHF_EMITTING_TIME_S = 60;

/** The alert keys, the first digits of their EwdMessages codes */
export const COM_CIDS_FAULT_KEY = '2300010';
export const COM_SINGLE_PTT_STUCK_KEY = '2300020';
/** COM VHF 1, 2, 3 EMITTING */
export const COM_VHF_EMITTING_KEYS = ['2300030', '2300040', '2300050'];
export const COM_VHF3_DATA_FAULT_KEY = '2300060';

/** The AUDIO 3 XFRD memo key and code */
export const AUDIO_3_XFRD_MEMO_KEY = '0000568';
export const AUDIO_3_XFRD_MEMO_CODE = '000056801';

/** The SINGLE PTT STUCK lines (index in its codes): the ACP lines have one line per VHF, VHF 1 first */
export const PttStuckLines = {
  title: 0,
  acp1Deselect: 1,
  ifUnsuccessfulAcp2: 4,
  acp2Deselect: 5,
  ifUnsuccessfulAcp3: 8,
  acp3Deselect: 9,
  audioSwitchingDoNotUse: 12,
  onAffectedAcp: 13,
  allTxKeysDoNotUse: 14,
  onAllOtherAcp: 15,
  vhfReselect: 16,
  count: 19,
} as const;

/** STATUS codes (StatusMessages) */
export const ComStatusCodes = {
  audioSwitchingDoNotUse: '230400001',
  cids: '230300001',
  singlePtt: '230300002',
  vhf3Data: '230300003',
} as const;

/** The transmission key of an ACP: 0 none (or not a VHF), 1 to 3 the VHF */
export type AcpTransmitVhf = 0 | 1 | 2 | 3;

/** The data of the alerts that are not timed */
export interface CommunicationInputs {
  /** The PTT of the CAPT (ACP 1) and of the F/O (ACP 2) is stuck in transmit (flyPad failures) */
  pttStuck: [boolean, boolean];
  /** The VHF transmission key of ACP 1 and ACP 2 */
  acpTransmitVhf: [AcpTransmitVhf, AcpTransmitVhf];
  /** VHF 1, 2, 3 transmitter stuck emitting (flyPad failures) */
  vhfStuckEmitting: [boolean, boolean, boolean];
  /** VHF 1, 2, 3 failed (flyPad failures 23005-23007) */
  vhfFailed: [boolean, boolean, boolean];
  /** VHF 1, 2, 3 supplied */
  vhfSupplied: [boolean, boolean, boolean];
  /** VHF 3 is in DATA mode */
  vhf3DataMode: boolean;
  /** CIDS 1 and 2 failed (flyPad failures) */
  cidsFailed: [boolean, boolean];
  /** The AUDIO SWITCHING selector is on NORM */
  audioSwitchingNorm: boolean;
}

/** COM CIDS 1 + 2 FAULT: "a total loss of CIDS" */
export function cidsFaultAlert(inputs: CommunicationInputs): boolean {
  return inputs.cidsFailed[0] && inputs.cidsFailed[1];
}

/** COM VHF 3 DATA FAULT: VHF 3 failed in DATA mode */
export function vhf3DataFaultAlert(inputs: CommunicationInputs): boolean {
  return inputs.vhf3DataMode && inputs.vhfFailed[2];
}

/** AUDIO 3 XFRD: the AUDIO SWITCHING selector is not on NORM */
export function audio3XfrdMemo(inputs: CommunicationInputs): boolean {
  return !inputs.audioSwitchingNorm;
}

/** Each VHF transmits now: a stuck transmitter, or a stuck PTT whose ACP has its TX key (voice mode), when it works */
export function vhfTransmitting(inputs: CommunicationInputs): [boolean, boolean, boolean] {
  const transmitting = (index: number): boolean => {
    const vhf = index + 1;
    const works = inputs.vhfSupplied[index] && !inputs.vhfFailed[index];
    const voiceMode = vhf !== 3 || !inputs.vhf3DataMode;
    const keyedByStuckPtt = [0, 1].some(
      (station) => inputs.pttStuck[station] && inputs.acpTransmitVhf[station] === vhf,
    );
    return works && (inputs.vhfStuckEmitting[index] || (voiceMode && keyedByStuckPtt));
  };
  return [transmitting(0), transmitting(1), transmitting(2)];
}

/** The SINGLE PTT STUCK state: the stuck PTT (0 CAPT / ACP 1, 1 F/O / ACP 2) and the VHF it transmitted on */
export interface PttStuckState {
  station: 0 | 1;
  vhf: 1 | 2 | 3;
}

/** The lines of SINGLE PTT STUCK (indexes in its codes, see PttStuckLines) */
export function singlePttStuckLines(state: PttStuckState, acpTransmitVhf: [AcpTransmitVhf, AcpTransmitVhf]): number[] {
  const vhfOffset = state.vhf - 1;
  const affectedAcpDetected = acpTransmitVhf[state.station] === 0;
  if (affectedAcpDetected) {
    const otherAcp = state.station === 0 ? 1 : 0;
    return [
      PttStuckLines.title,
      PttStuckLines.audioSwitchingDoNotUse,
      PttStuckLines.onAffectedAcp,
      PttStuckLines.allTxKeysDoNotUse,
      PttStuckLines.onAllOtherAcp,
      ...(acpTransmitVhf[otherAcp] !== state.vhf ? [PttStuckLines.vhfReselect + vhfOffset] : []),
    ];
  }
  if (acpTransmitVhf[0] === state.vhf) {
    return [PttStuckLines.title, PttStuckLines.acp1Deselect + vhfOffset];
  }
  if (acpTransmitVhf[1] === state.vhf) {
    return [PttStuckLines.title, PttStuckLines.ifUnsuccessfulAcp2, PttStuckLines.acp2Deselect + vhfOffset];
  }
  return [PttStuckLines.title, PttStuckLines.ifUnsuccessfulAcp3, PttStuckLines.acp3Deselect + vhfOffset];
}

/** The time monitoring of the PTT switches and of the VHF transmissions */
export class ComTransmissionMonitor {
  private readonly pttKeyedTimeS = [0, 0];

  private readonly vhfTransmitTimeS = [0, 0, 0];

  /** SINGLE PTT STUCK, latched until the PTT is no longer stuck; null when not triggered */
  public pttStuck: PttStuckState | null = null;

  /** COM VHF 1, 2, 3 EMITTING */
  public readonly vhfEmitting: [boolean, boolean, boolean] = [false, false, false];

  /**
   * @param inputs the PTT switches, the ACP TX keys and the VHFs
   * @param deltaTimeS the time since the last update, in seconds
   */
  update(inputs: CommunicationInputs, deltaTimeS: number): void {
    if (this.pttStuck !== null && !inputs.pttStuck[this.pttStuck.station]) {
      this.pttStuck = null;
    }
    for (const station of [0, 1] as const) {
      const vhf = inputs.acpTransmitVhf[station];
      const keyedOnVhf = inputs.pttStuck[station] && vhf !== 0;
      this.pttKeyedTimeS[station] = keyedOnVhf ? this.pttKeyedTimeS[station] + deltaTimeS : 0;
      if (this.pttStuck === null && vhf !== 0 && this.pttKeyedTimeS[station] > PTT_STUCK_TIME_S) {
        this.pttStuck = { station, vhf };
      }
    }
    const transmitting = vhfTransmitting(inputs);
    for (let index = 0; index < 3; index++) {
      this.vhfTransmitTimeS[index] = transmitting[index] ? this.vhfTransmitTimeS[index] + deltaTimeS : 0;
      this.vhfEmitting[index] = this.vhfTransmitTimeS[index] > VHF_EMITTING_TIME_S;
    }
  }
}

/** The STATUS lines */
export const comStatus = {
  /** COM CIDS 1 + 2 FAULT: INOP SYS CIDS (l.73598-73602) */
  cidsFault: (): StatusLines => ({ left: [], inopSys: [ComStatusCodes.cids] }),
  /** COM SINGLE PTT STUCK: AUDIO SWTG DO NOT USE, INOP SYS SINGLE PTT (l.73781-73786) */
  singlePttStuck: (): StatusLines => ({
    left: [ComStatusCodes.audioSwitchingDoNotUse],
    inopSys: [ComStatusCodes.singlePtt],
  }),
  /** COM VHF 3 DATA FAULT: INOP SYS VHF 3 DATA (l.73860-73864) */
  vhf3DataFault: (): StatusLines => ({ left: [], inopSys: [ComStatusCodes.vhf3Data] }),
};

/** A level 1 caution (crew awareness): amber, no MASTER CAUTION, no aural, no SD page (FCOM l.45551-45556) */
function awarenessItem(
  key: string,
  active: Subject<boolean>,
  flightPhaseInhib: number[],
  status: () => StatusLines,
): FwcAlertItem {
  return { ...cautionItem(key, 1, active, flightPhaseInhib, () => [0], EcamSysPage.NONE, status), failure: 1 };
}

/** The part of the failures consumer the alerts use */
export type ComFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** The failures the alerts read, in the order they are registered */
export const COM_FAILURES = [
  A320Failure.Vhf1,
  A320Failure.Vhf2,
  A320Failure.Vhf3,
  A320Failure.CidsDirector1,
  A320Failure.CidsDirector2,
  A320Failure.CaptPttStuck,
  A320Failure.FoPttStuck,
  A320Failure.Vhf1StuckEmitting,
  A320Failure.Vhf2StuckEmitting,
  A320Failure.Vhf3StuckEmitting,
];

/** The inputs of the alerts that are not flyPad failures */
export type ComSystemInputs = Pick<
  CommunicationInputs,
  'acpTransmitVhf' | 'vhfSupplied' | 'vhf3DataMode' | 'audioSwitchingNorm'
>;

/** The communication alerts and memo: reads the failures, gives the items the PseudoFWC adds */
export class CommunicationAlerts {
  private readonly monitor = new ComTransmissionMonitor();

  private acpTransmitVhf: [AcpTransmitVhf, AcpTransmitVhf] = [0, 0];

  private readonly cidsFault = Subject.create(false);

  private readonly singlePttStuck = Subject.create(false);

  private readonly vhfEmitting = [Subject.create(false), Subject.create(false), Subject.create(false)];

  private readonly vhf3DataFault = Subject.create(false);

  /** AUDIO 3 XFRD, for the PseudoFWC memos (key AUDIO_3_XFRD_MEMO_KEY) */
  public readonly audio3Xfrd = Subject.create(false);

  /** The AUDIO SWITCHING selector is on NORM (ELEC DC ESS BUS FAULT: AUDIO SWTG SELECT, Logic/ElecBusAlerts) */
  public audioSwitchingNorm = true;

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: ComFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of COM_FAILURES) {
      this.failuresConsumer.register(failure);
    }
  }

  /**
   * @param system the ACP TX keys, the VHF supplies and modes, the AUDIO SWITCHING selector
   * @param deltaTimeS the time since the last update, in seconds
   */
  update(system: ComSystemInputs, deltaTimeS: number): void {
    this.failuresConsumer.update();
    const failed = (failure: number) => this.failuresConsumer.isActive(failure);
    const inputs: CommunicationInputs = {
      ...system,
      pttStuck: [failed(A320Failure.CaptPttStuck), failed(A320Failure.FoPttStuck)],
      vhfStuckEmitting: [
        failed(A320Failure.Vhf1StuckEmitting),
        failed(A320Failure.Vhf2StuckEmitting),
        failed(A320Failure.Vhf3StuckEmitting),
      ],
      vhfFailed: [failed(A320Failure.Vhf1), failed(A320Failure.Vhf2), failed(A320Failure.Vhf3)],
      cidsFailed: [failed(A320Failure.CidsDirector1), failed(A320Failure.CidsDirector2)],
    };
    this.monitor.update(inputs, deltaTimeS);
    this.acpTransmitVhf = inputs.acpTransmitVhf;
    this.audioSwitchingNorm = inputs.audioSwitchingNorm;
    this.cidsFault.set(cidsFaultAlert(inputs));
    this.singlePttStuck.set(this.monitor.pttStuck !== null);
    this.vhfEmitting.forEach((emitting, index) => emitting.set(this.monitor.vhfEmitting[index]));
    this.vhf3DataFault.set(vhf3DataFaultAlert(inputs));
    this.audio3Xfrd.set(audio3XfrdMemo(inputs));
  }

  /**
   * COM VHF 1(2)(3) EMITTING: an amber caution (level 2) without ECAM action line
   * @param index 0 to 2 for VHF 1 to 3
   */
  private vhfEmittingItem(index: number): FwcAlertItem {
    return cautionItem(
      COM_VHF_EMITTING_KEYS[index],
      1,
      this.vhfEmitting[index],
      COM_PHASE_INHIBITION.vhfEmitting,
      () => [0],
      EcamSysPage.NONE,
      NO_STATUS,
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [COM_CIDS_FAULT_KEY]: awarenessItem(
      COM_CIDS_FAULT_KEY,
      this.cidsFault,
      COM_PHASE_INHIBITION.cidsFault,
      comStatus.cidsFault,
    ),
    [COM_SINGLE_PTT_STUCK_KEY]: cautionItem(
      COM_SINGLE_PTT_STUCK_KEY,
      PttStuckLines.count,
      this.singlePttStuck,
      COM_PHASE_INHIBITION.singlePttStuck,
      () => (this.monitor.pttStuck ? singlePttStuckLines(this.monitor.pttStuck, this.acpTransmitVhf) : [0]),
      EcamSysPage.NONE,
      comStatus.singlePttStuck,
    ),
    [COM_VHF_EMITTING_KEYS[0]]: this.vhfEmittingItem(0),
    [COM_VHF_EMITTING_KEYS[1]]: this.vhfEmittingItem(1),
    [COM_VHF_EMITTING_KEYS[2]]: this.vhfEmittingItem(2),
    [COM_VHF3_DATA_FAULT_KEY]: awarenessItem(
      COM_VHF3_DATA_FAULT_KEY,
      this.vhf3DataFault,
      COM_PHASE_INHIBITION.vhf3DataFault,
      comStatus.vhf3DataFault,
    ),
  };
}

/**
 * The VHF transmission key of an ACP from its L:XMLVAR_COM_PANEL<n>_Transmit_Channel (AirlinerCommon.xml TRANSMIT_ID:
 * 0 VHF 1, 1 VHF 2, 2 VHF 3; 4 is no key)
 * @param transmitChannel the L:var value
 */
export function acpTransmitVhf(transmitChannel: number): AcpTransmitVhf {
  switch (transmitChannel) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    default:
      return 0;
  }
}

/* Acquisition (not unit tested: SimVar reads only) */

/** The ACP TX keys, the VHF supplies and modes and the AUDIO SWITCHING selector, read from their sim variables */
export function readComSystemInputs(): ComSystemInputs {
  return {
    acpTransmitVhf: [
      acpTransmitVhf(SimVar.GetSimVarValue('L:XMLVAR_COM_PANEL1_Transmit_Channel', 'number')),
      acpTransmitVhf(SimVar.GetSimVarValue('L:XMLVAR_COM_PANEL2_Transmit_Channel', 'number')),
    ],
    vhfSupplied: [
      SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'bool') > 0,
      SimVar.GetSimVarValue('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', 'bool') > 0,
      SimVar.GetSimVarValue('L:A32NX_ELEC_DC_1_BUS_IS_POWERED', 'bool') > 0,
    ],
    vhf3DataMode: SimVar.GetSimVarValue('A:COM ACTIVE FREQUENCY:3', 'MHz') === 0,
    // the selector of the overhead AUDIO SWITCHING panel: 0 CAPT 3, 1 NORM, 2 F/O 3 (A320_NEO_INTERIOR.xml INIT_VALUE 1)
    audioSwitchingNorm: SimVar.GetSimVarValue('L:KNOB_OVHD_AUDIOSWITCH_Position', 'number') === 1,
  };
}
