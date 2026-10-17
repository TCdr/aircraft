// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The L/G GRVTY EXTN memo of the A380 (the L/G has been extended by gravity), green (EcamMemos 321000002), inhibited in
 * the flight phases 3 to 7.
 *
 * Design choice: "has been extended" is the L/G GRVTY sw at DOWN (L:A32NX_LG_GRVTY_SWITCH_POS 2) with all the gears
 * down and locked. Until they lock, the WHEEL SD page shows L/G GRVTY EXTN IN PROGRESS instead (that message goes when
 * all the gears are down and locked, or after 120 s).
 *
 * Not done: the FLT L/G DOWN memo (321000001, the VMO-MMO sw set to L/G DOWN): the A380X cockpit has no VMO-MMO switch.
 */

export const GRAVITY_EXTENSION_MEMO = '321000002';

export const GRAVITY_EXTENSION_MEMO_PHASE_INHIBITION = [3, 4, 5, 6, 7];

/** L:A32NX_LG_GRVTY_SWITCH_POS: 0 RESET, 1 OFF, 2 DOWN (a380_systems hydraulic) */
const GRAVITY_SWITCH_DOWN = 2;

/**
 * @param gravitySwitchPosition L:A32NX_LG_GRVTY_SWITCH_POS
 * @param allGearDownlocked the LGCIUs report the three gears down and locked (FwsCore isAllGearDownlocked)
 */
export function isGravityExtensionMemoShown(gravitySwitchPosition: number, allGearDownlocked: boolean): boolean {
  return gravitySwitchPosition === GRAVITY_SWITCH_DOWN && allGearDownlocked;
}
