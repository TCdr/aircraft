// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The EcamMemos code of the DATALINK STBY memo */
export const DATALINK_STBY_MEMO = '230000017';

export interface DatalinkStbyInputs {
  /**
   * Data mode available via at least one VHF/HF/SATCOM. The sim has no HF and no SATCOM: VHF 3 working and in data mode,
   * i.e. no COM DATALINK FAULT (CommunicationAlerts datalinkAlerts).
   */
  readonly dataModeAvailable: boolean;
  /**
   * The datalink itself is temporarily lost: the ACARS provider of the ACR router (CpiomD/Acr.ts) answered, then stopped
   * answering, and the reconnection attempts go on (AcarsConnector.isLinkTemporarilyLost).
   */
  readonly linkTemporarilyLost: boolean;
}

/**
 * DATALINK STBY memo: "Data mode is available, via at least one VHF/HF/SATCOM, but the datalink is temporarily lost."
 * (A380 FCOM DSC-23-20 MEMO, a380_fcom.txt l.49460-49461). Its flight phase inhibition is a figure only: none here.
 * @param inputs the data mode and datalink states
 * @returns whether the memo is shown
 */
export function isDatalinkStby(inputs: DatalinkStbyInputs): boolean {
  return inputs.dataModeAvailable && inputs.linkTemporarilyLost;
}
