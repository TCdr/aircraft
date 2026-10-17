// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StatusLines } from './CondStatus';

/**
 * AUTO FLT A/THR OFF after a non standard (involuntary) disconnection has an ECAM STATUS: CAT 2 ONLY; INOP SYS A/THR,
 * CAT 3. The FWC keeps the alert (and so the STATUS) until the A/THR is engaged again.
 */
export function autoThrustOffInvoluntaryStatus(): StatusLines {
  return { left: ['240200102'], inopSys: ['240300131', '240300128'] };
}

/** The STATUS codes (StatusMessages) of the AUTO FLT AP OFF STATUS */
const AP_OFF_STATUS = {
  ap1: '240300129',
  ap2: '240300130',
  ap12: '270300027',
  cat2: '270300028',
} as const;

/**
 * AUTO FLT AP OFF after an involuntary disengagement (by other means than the takeover pb) has an ECAM STATUS: INOP SYS
 * the affected AP, and CAT 2 if both APs are lost.
 * The affected AP is the one its FMGC reports lost: FMGC discrete word 4 bit 19 "AP Inop" (A32NXFGBusPublisher), or no
 * valid word from that FMGC. Not shown: the GLS AUTOLAND option line.
 * @param ap1Lost AP 1 is lost (FMGC 1)
 * @param ap2Lost AP 2 is lost (FMGC 2)
 * @returns the STATUS lines, none when no AP is lost (the AP was disconnected by the FCU pb or a sidestick force)
 */
export function autoPilotOffInvoluntaryStatus(ap1Lost: boolean, ap2Lost: boolean): StatusLines {
  if (ap1Lost && ap2Lost) {
    return { left: [], inopSys: [AP_OFF_STATUS.ap12, AP_OFF_STATUS.cat2] };
  }
  if (ap1Lost) {
    return { left: [], inopSys: [AP_OFF_STATUS.ap1] };
  }
  return { left: [], inopSys: ap2Lost ? [AP_OFF_STATUS.ap2] : [] };
}
