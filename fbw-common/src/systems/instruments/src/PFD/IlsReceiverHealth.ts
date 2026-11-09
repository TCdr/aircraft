// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface IlsReceiverInfo {
  ident: string;
  /** MHz */
  frequency: number;
  hasDme: boolean;
}

export interface IlsReceiverInfoInputs extends IlsReceiverInfo {
  /** the MMR of this display's side has power */
  mmrPowered: boolean;
  /** the ILS receiver, or the whole MMR, of this display's side is failed */
  ilsReceiverFailed: boolean;
}

/**
 * What the ILS information block shows. The sim keeps decoding the tuned station whatever happens to the receiver in the
 * aircraft, so a dead receiver must not show the ident, the frequency or the DME distance it can no longer have.
 */
export function ilsReceiverInfo(inputs: IlsReceiverInfoInputs): IlsReceiverInfo {
  if (!inputs.mmrPowered || inputs.ilsReceiverFailed) {
    return { ident: '', frequency: 0, hasDme: false };
  }
  return { ident: inputs.ident, frequency: inputs.frequency, hasDme: inputs.hasDme };
}

const OWN_SIDE_ILS_HEALTH_TOPICS = [
  { mmrPowered: 'mmr1Powered', ilsFailed: 'ils1Failed' },
  { mmrPowered: 'mmr2Powered', ilsFailed: 'ils2Failed' },
] as const;

/** The simvar topics of the health of the MMR a PFD reads: PFD 1 the MMR 1, PFD 2 the MMR 2 */
export function ownSideIlsHealthTopics(displayIndex: number) {
  return OWN_SIDE_ILS_HEALTH_TOPICS[displayIndex === 2 ? 1 : 0];
}
