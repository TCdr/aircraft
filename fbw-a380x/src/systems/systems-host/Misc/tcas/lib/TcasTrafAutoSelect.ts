// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The EFIS CP TRAF pb: when the TCAS triggers an alert, the TRAF pb is selected automatically, so that the ND shows the
 * intruders.
 *
 * The TRAF state is the light of the pb, written by the FCU (L:A32NX_FCU_EFIS_L/R_TRAF_LIGHT_ON), not
 * L:A380X_EFIS_L/R_TRAF_BUTTON_IS_ON, which nothing writes.
 */

/** The L:var holding the TRAF pb state of one EFIS CP. */
export function trafPbLightVar(side: 'L' | 'R'): string {
  return `L:A32NX_FCU_EFIS_${side}_TRAF_LIGHT_ON`;
}

/** The FCU event that toggles the TRAF pb of one EFIS CP. */
export function trafPbPushEvent(side: 'L' | 'R'): string {
  return `K:A32NX.FCU_EFIS_${side}_TRAF_PUSH`;
}

/**
 * Which EFIS CP TRAF pbs to select automatically: those that are off, when the TCAS alert starts (no advisory before,
 * a TA or an RA now). Only on the start of the alert, so that the crew can deselect it again.
 * @param previousAdvisory TCAS advisory state of the previous update: 0 none, 1 TA, 2 RA
 * @param advisory TCAS advisory state now
 * @param trafOnLeft the captain TRAF pb is on
 * @param trafOnRight the first officer TRAF pb is on
 * @returns the sides to push
 */
export function trafPbsToAutoSelect(
  previousAdvisory: number,
  advisory: number,
  trafOnLeft: boolean,
  trafOnRight: boolean,
): ('L' | 'R')[] {
  const alertStarted = previousAdvisory === 0 && advisory > 0;
  if (!alertStarted) {
    return [];
  }
  const sides: ('L' | 'R')[] = [];
  if (!trafOnLeft) {
    sides.push('L');
  }
  if (!trafOnRight) {
    sides.push('R');
  }
  return sides;
}
