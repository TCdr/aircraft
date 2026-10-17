// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The RMP discretes that take the navaid tuning away from the FMS (the RMPs then tune the receivers).
 * - A320: the NAV key of RMP 1 and RMP 2 (A32NX RMP).
 * - A380: the STBY RAD NAV mode of RMP 1 and RMP 2 (A380X RMP StandbyRadioNavigationManager). RMP 3 does not tune
 *   navaids.
 * Each aircraft only writes its own variables, the others stay 0.
 */
const RMP_NAVAID_TUNING_DISCRETES = [
  'L:A32NX_RMP_L_NAV_BUTTON_SELECTED',
  'L:A32NX_RMP_R_NAV_BUTTON_SELECTED',
  'L:A380X_RMP_1_STBY_NAV',
  'L:A380X_RMP_2_STBY_NAV',
] as const;

/**
 * Whether an RMP tunes the navaids instead of the FMS.
 * @param readBool reads a boolean L:var (SimVar bool reads return 0/1)
 * @returns true when any RMP tuning discrete is set
 */
export function isRmpNavaidTuningActive(readBool: (name: string) => number): boolean {
  return RMP_NAVAID_TUNING_DISCRETES.some((name) => readBool(name) > 0);
}
