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
 * DATALINK STBY memo: data mode is available via at least one VHF/HF/SATCOM, but the datalink is temporarily lost.
 * No flight phase inhibition (none is published as data).
 * @param inputs the data mode and datalink states
 * @returns whether the memo is shown
 */
export function isDatalinkStby(inputs: DatalinkStbyInputs): boolean {
  return inputs.dataModeAvailable && inputs.linkTemporarilyLost;
}
