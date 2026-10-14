// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The DCDU side of the datalink failures (systems-host AtsuFailureStates, A320 FCOM a320_fcom.txt):
 * - One DCDU "on the CAPT and F/O side" (DSC-46-10-10 l.59032): DCDU 1 is the captain DCDU, its keys send the MPL
 *   events; DCDU 2 the first officer DCDU, MPR. Both screens show the one DCDU gauge (panel.cfg VCockpit07): a failed
 *   DCDU (flyPad 46002/46003, L:A32NX_DCDU_n_FAILED) is blanked by its screen (model EMISSIVE_CODE) and its keys do
 *   nothing here; the other DCDU keeps working.
 * - The ATSU reset is to be attempted when '"INVALID DATA" is displayed on the DCDU' (PRO-ABN-ABN-RESET l.67771): a
 *   supplied DCDU without a running ATSU (not supplied, C/B pulled, failed: L:A32NX_ATSU_OFF) has no data to show and
 *   shows INVALID DATA in place of its messages, until the ATSU runs again.
 */

/** The DCDU keys of a side: MPL on DCDU 1 (captain), MPR on DCDU 2 (first officer) */
export type DcduKeySide = 'MPL' | 'MPR';

/** The DCDU failure states, from L:A32NX_DCDU_1_FAILED and L:A32NX_DCDU_2_FAILED */
export interface DcduFailureStates {
  dcdu1Failed: boolean;
  dcdu2Failed: boolean;
}

/**
 * @param side the side of the key event
 * @param failures the DCDU failure states
 * @returns the key of that side works: its DCDU is not failed
 */
export function dcduKeyWorks(side: DcduKeySide, failures: DcduFailureStates): boolean {
  return side === 'MPL' ? !failures.dcdu1Failed : !failures.dcdu2Failed;
}

/**
 * @param side the side
 * @param key the key name of the event, e.g. PRINT or MS0PLUS
 * @returns the interaction event of that key, e.g. A32NX_DCDU_BTN_MPL_PRINT
 */
export function dcduKeyEvent(side: DcduKeySide, key: string): string {
  return `A32NX_DCDU_BTN_${side}_${key}`;
}
