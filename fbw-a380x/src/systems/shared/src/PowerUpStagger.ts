// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The order in which the displays and panels of the cockpit leave their off state after their supply appears.
 */

import { DisplayUnitID } from './CdsDisplayUnits';

/** Design choice: the gap between two units, wide enough for the first paint of one unit to finish before the next */
const POWER_UP_SLOT_SPACING_SECONDS = 0.25;

/** The order of the units; each one waits for its place in this list, from the moment its supply appears */
const POWER_UP_ORDER = [
  'CaptPfd',
  'FoPfd',
  'CaptNd',
  'FoNd',
  'Ewd',
  'Sd',
  'CaptMfd',
  'FoMfd',
  'Rmp1',
  'Rmp2',
  'Rmp3',
  'CaptOit',
  'FoOit',
  'Isis1',
  'Isis2',
] as const;

export type PowerUpUnit = (typeof POWER_UP_ORDER)[number];

/** The seconds each unit waits after its supply appears before it leaves its off state */
export const POWER_UP_SLOT_SECONDS: Readonly<Record<PowerUpUnit, number>> = POWER_UP_ORDER.reduce(
  (slots, unit, index) => ({ ...slots, [unit]: index * POWER_UP_SLOT_SPACING_SECONDS }),
  {} as Record<PowerUpUnit, number>,
);

/** The slot of each CDS display unit */
export const DISPLAY_UNIT_POWER_UP_SLOT_SECONDS: Readonly<Record<DisplayUnitID, number>> = {
  [DisplayUnitID.CaptPfd]: POWER_UP_SLOT_SECONDS.CaptPfd,
  [DisplayUnitID.FoPfd]: POWER_UP_SLOT_SECONDS.FoPfd,
  [DisplayUnitID.CaptNd]: POWER_UP_SLOT_SECONDS.CaptNd,
  [DisplayUnitID.FoNd]: POWER_UP_SLOT_SECONDS.FoNd,
  [DisplayUnitID.Ewd]: POWER_UP_SLOT_SECONDS.Ewd,
  [DisplayUnitID.Sd]: POWER_UP_SLOT_SECONDS.Sd,
  [DisplayUnitID.CaptMfd]: POWER_UP_SLOT_SECONDS.CaptMfd,
  [DisplayUnitID.FoMfd]: POWER_UP_SLOT_SECONDS.FoMfd,
};

/**
 * Remembers when the supply of one unit appeared. The wait counts from that moment only: a unit that is switched on
 * later (brightness knob, a cleared failure) finds its slot already passed and does not wait.
 */
export class PowerUpGate {
  private poweredSinceSeconds: number | null = null;

  constructor(private readonly slotSeconds: number) {}

  /**
   * Call on every update, also while the unit is off.
   * @param powered whether the unit is supplied
   * @param nowSeconds any clock in seconds, the same one on every call
   * @returns the seconds the unit still has to wait before it leaves its off state; 0 when it is not supplied
   */
  update(powered: boolean, nowSeconds: number): number {
    if (!powered) {
      this.poweredSinceSeconds = null;
      return 0;
    }

    if (this.poweredSinceSeconds === null) {
      this.poweredSinceSeconds = nowSeconds;
    }
    return Math.max(0, this.slotSeconds - (nowSeconds - this.poweredSinceSeconds));
  }
}
