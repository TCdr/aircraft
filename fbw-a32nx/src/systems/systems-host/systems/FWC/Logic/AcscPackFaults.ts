// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What the FWC reads from the two air conditioning system controllers (ACSC) for the pack cautions. */
export interface AcscPackFaultInputs {
  /** The ACSC 1 output words are failure warning: both lanes of ACSC 1 are failed. */
  acsc1Failed: boolean;
  /** The ACSC 2 output words are failure warning: both lanes of ACSC 2 are failed. */
  acsc2Failed: boolean;
  /** Pack 1 flow control valve position disagrees with the commanded position (ACSC 1 discrete word 2, bit 21). */
  pack1ValveDisagrees: boolean;
  /** Pack 2 flow control valve position disagrees with the commanded position (ACSC 2 discrete word 2, bit 21). */
  pack2ValveDisagrees: boolean;
}

export interface AcscPackFaults {
  /** AIR PACK 1 FAULT */
  pack1Fault: boolean;
  /** AIR PACK 2 FAULT */
  pack2Fault: boolean;
  /** Both ACSCs failed, one of the AIR PACK 1+2 FAULT triggers */
  bothAcscFailed: boolean;
}

/**
 * FCOM PRO-ABN-AIR: PACK 1(2) FAULT triggers when the position of the pack flow control valve disagrees with the
 * commanded position; its STATUS also covers the loss of ACSC 1(2), which closes that pack (DSC-21-10-40, both lanes
 * failure). PACK 1+2 FAULT triggers when both ACSCs are failed, and then replaces the two single pack cautions.
 */
export function acscPackFaults(inputs: AcscPackFaultInputs): AcscPackFaults {
  const bothAcscFailed = inputs.acsc1Failed && inputs.acsc2Failed;
  return {
    pack1Fault: !bothAcscFailed && (inputs.acsc1Failed || inputs.pack1ValveDisagrees),
    pack2Fault: !bothAcscFailed && (inputs.acsc2Failed || inputs.pack2ValveDisagrees),
    bothAcscFailed,
  };
}
