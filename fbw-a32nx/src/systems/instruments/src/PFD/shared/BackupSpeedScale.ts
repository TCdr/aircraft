// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarDefinition, SimVarValueType } from '@microsoft/msfs-sdk';

/*
 * The backup speed/altitude scale (BUSS) of the PFD: the BKUP SPD/ALT pb of a side replaces the normal speed scale of
 * that PFD by a scale based on the angle of attack, and the barometric altitude by the GPS altitude.
 *
 * The scale shows the angle of attack on a vertical bar of five areas, from the top: red FAST, amber FAST, green, amber
 * SLOW, red SLOW. A yellow line shows where the aircraft is, a green triangle the target. The areas depend on the
 * slat/flap configuration.
 */

/** The slat/flap configuration index, A32NX_FLAPS_CONF_INDEX: CONF 0, 1, 1+F, 2, 3, FULL */
export type FlapsConfigIndex = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The angle of attack limits of the flight envelope of the FACs by configuration, low Mach column: the angle of attack
 * of zero lift, of the alpha protection and of alpha max, degrees.
 * Design choice: the Mach dependence is not used, the Mach is lost with the air data when the BUSS is needed.
 */
const ALPHA_ZERO_LIFT_DEG = [-1.84, -1.84, -2.18, -4.72, -4.27, -6.94];
const ALPHA_PROTECTION_DEG = [6.5, 11.7, 11.7, 11.9, 11, 10.6];
const ALPHA_MAX_DEG = [8.7, 13.6, 13.6, 14.2, 13.1, 13];

/** VLS is 1.23 VS1G, and alpha max is reached at about VS1G */
const VLS_OVER_STALL_SPEED = 1.23;

/**
 * Design choice: during the approach (CONF 3 and FULL) the target is VAPP, VLS plus 5 kt at about 125 kt, so 4 % above
 * the VLS target.
 */
const APPROACH_TARGET_OVER_VLS = 1.04;
const FIRST_APPROACH_CONFIG = 4;

/**
 * Design choice: where the FAST areas start, as a multiple of the target speed. The FCOM gives no values; amber FAST
 * keeps a margin to the maximum structural speed, red FAST starts at it: the flap limit speeds of CONF 1 to FULL are
 * about 1.4 times VLS at the weights of a landing, and the VMO about 1.7 times VLS in clean configuration, at low
 * altitude (the scale has no Mach).
 */
const AMBER_FAST_OVER_TARGET = { clean: 1.5, flapsExtended: 1.3 };
const RED_FAST_OVER_TARGET = { clean: 1.7, flapsExtended: 1.4 };

/** Design choice: how far past the red FAST start, and past alpha max, the bar goes, so that both stay readable */
const BAR_MARGIN_OVER_RED_FAST = 1.15;
const BAR_MARGIN_PAST_ALPHA_MAX_DEG = 1.5;

export interface BackupSpeedScaleLayout {
  /** The end of each area as a fraction of the bar height, from the top, 0 to 1: red FAST, amber FAST, green, amber SLOW (red SLOW goes to 1) */
  areaEnds: [number, number, number, number];
  /** The position of the target as a fraction of the bar height from the top */
  target: number;
  /** Maps an angle of attack to the position on the bar, from the top, limited to 0 and 1 */
  positionOf: (angleOfAttackDeg: number) => number;
}

/** A speed relative to the target gives its angle of attack: lift goes with the square of the speed */
function angleOfAttackAtSpeedRatio(zeroLift: number, target: number, speedOverTarget: number): number {
  return zeroLift + (target - zeroLift) / (speedOverTarget * speedOverTarget);
}

/**
 * The areas of the scale for a configuration.
 * @param config the slat/flap configuration index
 */
export function backupSpeedScaleLayout(config: number): BackupSpeedScaleLayout {
  const index = Math.max(0, Math.min(5, Math.round(config)));
  const zeroLift = ALPHA_ZERO_LIFT_DEG[index];
  const alphaMax = ALPHA_MAX_DEG[index];
  const alphaProtection = ALPHA_PROTECTION_DEG[index];

  const targetSpeedOverStall = VLS_OVER_STALL_SPEED * (index >= FIRST_APPROACH_CONFIG ? APPROACH_TARGET_OVER_VLS : 1);
  const alphaTarget = zeroLift + (alphaMax - zeroLift) / (targetSpeedOverStall * targetSpeedOverStall);

  const fast = index === 0 ? 'clean' : 'flapsExtended';
  const alphaAmberFast = angleOfAttackAtSpeedRatio(zeroLift, alphaTarget, AMBER_FAST_OVER_TARGET[fast]);
  const alphaRedFast = angleOfAttackAtSpeedRatio(zeroLift, alphaTarget, RED_FAST_OVER_TARGET[fast]);

  const alphaTop = angleOfAttackAtSpeedRatio(
    zeroLift,
    alphaTarget,
    RED_FAST_OVER_TARGET[fast] * BAR_MARGIN_OVER_RED_FAST,
  );
  const alphaBottom = alphaMax + BAR_MARGIN_PAST_ALPHA_MAX_DEG;
  const positionOf = (angleOfAttackDeg: number) =>
    Math.max(0, Math.min(1, (angleOfAttackDeg - alphaTop) / (alphaBottom - alphaTop)));

  return {
    areaEnds: [positionOf(alphaRedFast), positionOf(alphaAmberFast), positionOf(alphaProtection), positionOf(alphaMax)],
    target: positionOf(alphaTarget),
    positionOf,
  };
}

/** The PFD simvars of the backup scale: the pb of the side and the GPS altitude of the side */
export type BackupScaleSimVarKey = 'backupScalePbIsOn' | 'gpsAltitude';

/** CAPT PFD: BKUP SPD/ALT pb on the left, GPS 1. F/O PFD: pb on the right, GPS 2. */
export function backupScaleSimVars(displayIndex: number): [BackupScaleSimVarKey, SimVarDefinition][] {
  const side = displayIndex === 2 ? 'R' : 'L';
  return [
    ['backupScalePbIsOn', { name: `L:A32NX_EFIS_${side}_BKUP_SPD_ALT_PB_IS_ON`, type: SimVarValueType.Bool }],
    ['gpsAltitude', { name: `L:A32NX_GPS_${displayIndex === 2 ? 2 : 1}_ALTITUDE`, type: SimVarValueType.Number }],
  ];
}
