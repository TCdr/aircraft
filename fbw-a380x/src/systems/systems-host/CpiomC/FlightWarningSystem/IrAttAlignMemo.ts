// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/*
 * The IR 1(2)(3)(1+2)(2+3)(1+3) IN ATT ALIGN and ALL IRs IN ATT ALIGN memos (A380 FCOM DSC-34-10-30-20 MEMO,
 * a380_fcom.txt l.86019-86026): "The corresponding IRs started an alignment to recover the ATT mode." / "All IRs started
 * an alignment to recover the ATT mode." Their flight phase inhibition is a figure only: none here, as the A32NX IRS IN
 * ATT ALIGN memo.
 */

/** Bit of the IR maintenance word (label 350) set while the IR mode selector is in ATT: REV ATT MODE (adirs.rs IrMaintFlags) */
const IR_MAINT_WORD_ATT_MODE_BIT = 2;

/** The EcamMemos codes of the memo, in the order of irAttAlignMemoIndex */
export const IR_ATT_ALIGN_MEMO_CODES = [
  '340002701', // IR 1 IN ATT ALIGN
  '340002702', // IR 2 IN ATT ALIGN
  '340002703', // IR 3 IN ATT ALIGN
  '340002704', // IR 1+2 IN ATT ALIGN
  '340002705', // IR 1+3 IN ATT ALIGN
  '340002706', // IR 2+3 IN ATT ALIGN
  '340002707', // ALL IRs IN ATT ALIGN
];

/**
 * An IR is in ATT alignment: its mode selector is in ATT (REV ATT MODE bit of its maintenance word) and its attitude is
 * not available yet (the pitch is NCD until the attitude initialisation ends, adirs.rs update_attitude_values). An IR that
 * is off sends no valid maintenance word, a failed IR a failed pitch: no memo for them.
 * @param maintWord the IR maintenance word
 * @param pitch the IR pitch angle word
 * @returns whether the IR is in ATT alignment
 */
export function isIrInAttAlign(maintWord: Arinc429WordData, pitch: Arinc429WordData): boolean {
  return maintWord.bitValueOr(IR_MAINT_WORD_ATT_MODE_BIT, false) && pitch.isNoComputedData();
}

/**
 * The memo line of the IRs in ATT alignment.
 * @param inAttAlign IR 1, 2 and 3 in ATT alignment
 * @returns the index in IR_ATT_ALIGN_MEMO_CODES, -1 when no IR is in ATT alignment
 */
export function irAttAlignMemoIndex(inAttAlign: readonly boolean[]): number {
  const [ir1, ir2, ir3] = inAttAlign;
  if (ir1 && ir2 && ir3) {
    return 6;
  }
  if (ir2 && ir3) {
    return 5;
  }
  if (ir1 && ir3) {
    return 4;
  }
  if (ir1 && ir2) {
    return 3;
  }
  if (ir3) {
    return 2;
  }
  if (ir2) {
    return 1;
  }
  return ir1 ? 0 : -1;
}
