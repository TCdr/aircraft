// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The radio navigation receivers of the A32NX, two of each */
export type NavigationReceiverKind = 'VOR' | 'DME' | 'ADF' | 'ILS';

/** Receiver 1 or 2 */
export type NavigationReceiverIndex = 1 | 2;

/**
 * The L:var that tells the displays that a radio navigation receiver has failed (flyPad ATA 34 failures). Written by
 * the systems host (NavigationReceiverFailures).
 */
export function navigationReceiverFailedVar(kind: NavigationReceiverKind, index: NavigationReceiverIndex): string {
  return `L:A32NX_${kind}_${index}_FAILED`;
}

/** The ADF selection key of the RMP: mode 10 of L:A32NX_RMP_{side}_SELECTED_MODE (A32NX_Interior_RMP.xml) */
export const RMP_ADF_MODE = 10;

/**
 * The RMP BFO key: with the ADF selected, pressing it activates the BFO. The ADF is selected in the NAV backup mode
 * only (the STBY NAV keys work with the NAV key on). Pressing the key again deactivates the BFO, which must be off to
 * hear the audio identification of some ADF stations.
 * @param navBackupSelected the NAV key of this RMP is on
 * @param selectedMode the selected mode of this RMP
 * @param bfoOn the BFO of the ADF of this RMP is on
 * @returns the new BFO state, or null when the key has no effect
 */
export function bfoAfterRmpBfoKey(navBackupSelected: boolean, selectedMode: number, bfoOn: boolean): boolean | null {
  if (!navBackupSelected || selectedMode !== RMP_ADF_MODE) {
    return null;
  }
  return !bfoOn;
}

/** The receivers whose failure removes a VorBusPublisher signal, by sim radio */
export const NAV_RADIO_RECEIVERS: Readonly<
  Record<1 | 2 | 3 | 4, { bearing: [NavigationReceiverKind, NavigationReceiverIndex]; dme?: NavigationReceiverIndex }>
> = {
  // NAV 1 and 2: VOR 1 and 2 with their DME (systems.cfg [RADIOS])
  1: { bearing: ['VOR', 1], dme: 1 },
  2: { bearing: ['VOR', 2], dme: 2 },
  // NAV 3 and 4: the ILS receivers of MMR 1 and 2 (fbw-common navigation/ils.rs)
  3: { bearing: ['ILS', 1] },
  4: { bearing: ['ILS', 2] },
};

/**
 * A receiver signal as the displays get it: lost while the receiver is failed.
 * @param received the signal of the sim radio (a Bool simvar value)
 * @param failed the receiver is failed (its navigationReceiverFailedVar)
 * @returns whether the signal is received
 */
export function isSignalReceived(received: number | boolean, failed: number | boolean): boolean {
  return !!received && !failed;
}
