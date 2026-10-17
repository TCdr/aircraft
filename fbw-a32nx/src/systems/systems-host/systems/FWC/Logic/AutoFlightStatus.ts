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
