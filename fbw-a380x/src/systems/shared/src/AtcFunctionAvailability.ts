//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

/**
 * The L: variable of the ATC function availability, written by the systems host (CpiomD/AtcDatalink.ts): the SD mailbox
 * shows MAILBOX NOT AVAIL and the MFD ATC COM NOT AVAIL while it is false.
 */
export const ATC_FUNCTION_AVAILABLE_VAR = 'L:A380X_ATC_FUNCTION_AVAIL';

/**
 * Whether the ATC datalink applications (CPDLC, ADS, ATIS) run. "The ATC system is installed on CPIOM-D." (A380 FCOM
 * DSC-46-10-10-10, a380_fcom.txt l.95659), and the ATC RESET pb of the overhead RESET panel stops it while pulled (A380
 * FCOM PRO-SUP-46 AIR TRAFFIC CONTROL (ATC) RESET, l.184545-184557: "ATC RESET ... PULL", "After 1 s: ATC RESET ...
 * PUSH"; "Following an ATC reset: All current CPDLC and ADS connections are lost - Mailbox messages are lost").
 * @param cpiomD1Available CPIOM D1 available (L:A32NX_CPIOM_D1_AVAIL)
 * @param atcResetPulled the ATC RESET pb pulled (L:A32NX_RESET_PANEL_ATC)
 * @returns whether the ATC function runs
 */
export function isAtcFunctionAvailable(cpiomD1Available: boolean, atcResetPulled: boolean): boolean {
  return cpiomD1Available && !atcResetPulled;
}
