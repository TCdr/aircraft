// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The L/G GRVTY EXTN memo of the A380 (A380 FCOM DSC-32-20-180 MEMO, a380_fcom.txt l.82307: "L/G GRVTY EXTN The L/G has
 * been extended by gravity"), green (EcamMemos 321000002). Its flight phase inhibition is a figure only (PDF page 2870,
 * DSC-32-20-180 P 2/4): phases 3 to 7 inhibited.
 *
 * Design choice: "has been extended" is the L/G GRVTY sw at DOWN (L:A32NX_LG_GRVTY_SWITCH_POS 2) with all the gears down
 * and locked. Until they lock, the WHEEL SD page shows L/G GRVTY EXTN IN PROGRESS instead ("The message no longer appears
 * when all gears are down locked, or after 120 s", DSC-32-20-40 l.81105-81109).
 *
 * Not done: the FLT L/G DOWN memo of the same chapter (321000001, l.82280-82283, "the VMO-MMO sw is set to L/G DOWN"):
 * the A380X cockpit has no VMO-MMO switch.
 */

export const GRAVITY_EXTENSION_MEMO = '321000002';

export const GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION = [3, 4, 5, 6, 7];

/** The position DOWN of the L/G GRVTY sw (L:A32NX_LG_GRVTY_SWITCH_POS: 0 RESET, 1 OFF, 2 DOWN; a380_systems hydraulic) */
export const GRAVITY_SWITCH_DOWN = 2;

/**
 * @param gravitySwitchPosition L:A32NX_LG_GRVTY_SWITCH_POS
 * @param allGearDownlocked the LGCIUs report the three gears down and locked (FwsCore isAllGearDownlocked)
 */
export function isGravityExtensionMemoShown(gravitySwitchPosition: number, allGearDownlocked: boolean): boolean {
  return gravitySwitchPosition === GRAVITY_SWITCH_DOWN && allGearDownlocked;
}
