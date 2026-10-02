// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The FM navigation modes, by decreasing priority (A320 FCOM DSC-22_20-20-10) */
export enum FmNavigationMode {
  IrsGps,
  IrsDmeDme,
  IrsVorDme,
  IrsOnly,
}

/** The estimated position uncertainty after an IRS alignment, in NM (A320 FCOM DSC-22_20-20-20) */
export const IRS_ALIGNMENT_UNCERTAINTY = 5;

/**
 * The radio position uncertainty of the FCOM, in NM, nearest and farthest navaids: IRS/DME/DME 0.27 to 0.37 NM,
 * IRS/VOR/DME 0.30 to 0.42 NM, "dependent on the distance between the aircraft and the VOR/DME"
 */
const RADIO_UNCERTAINTY: Record<FmNavigationMode.IrsDmeDme | FmNavigationMode.IrsVorDme, [number, number]> = {
  [FmNavigationMode.IrsDmeDme]: [0.27, 0.37],
  [FmNavigationMode.IrsVorDme]: [0.3, 0.42],
};

/** The distance to the navaids at which the radio position uncertainty reaches its largest value, in NM (design choice) */
const RADIO_UNCERTAINTY_RANGE = 100;

/** The growth of the IRS only uncertainty (A320 FCOM DSC-22_20-20-20): [duration in minutes, rate in NM/h] */
const IRS_ONLY_GROWTH: readonly [number, number][] = [
  [40, 6],
  [50, 0],
  [40, 4],
  [45, 0],
  [Infinity, 2],
];

/**
 * The uncertainty of a radio position, from the distance to the farthest navaid used.
 * @param mode IRS/DME/DME or IRS/VOR/DME
 * @param distance the distance to the farthest navaid used, in NM
 */
export function radioPositionUncertainty(
  mode: FmNavigationMode.IrsDmeDme | FmNavigationMode.IrsVorDme,
  distance: number,
): number {
  const [nearest, farthest] = RADIO_UNCERTAINTY[mode];
  const ratio = Math.min(Math.max(distance / RADIO_UNCERTAINTY_RANGE, 0), 1);
  return nearest + (farthest - nearest) * ratio;
}

/**
 * The uncertainty after some time in IRS only mode.
 * @param initial the uncertainty when the IRS only mode started, in NM
 * @param minutes the time in IRS only mode, in minutes
 */
export function irsOnlyPositionUncertainty(initial: number, minutes: number): number {
  let uncertainty = initial;
  let remaining = minutes;
  for (const [duration, rate] of IRS_ONLY_GROWTH) {
    const time = Math.min(remaining, duration);
    uncertainty += (rate * time) / 60;
    remaining -= time;
    if (remaining <= 0) {
      break;
    }
  }
  return uncertainty;
}

export interface PositionUncertaintyState {
  mode: FmNavigationMode;
  /** The estimated position uncertainty (EPU), in NM */
  uncertainty: number;
}

/**
 * The FM navigation mode and the estimated position uncertainty (A320 FCOM DSC-22_20-20-10 and DSC-22_20-20-20): the
 * FM position is updated with the GPS, else a DME pair, else a VOR/DME, else it is the IRS position alone, whose
 * uncertainty grows with time.
 */
export class PositionUncertaintyEstimator {
  private mode: FmNavigationMode | null = null;

  private uncertainty: number | null = null;

  private irsOnlyInitial = IRS_ALIGNMENT_UNCERTAINTY;

  private irsOnlyMinutes = 0;

  /**
   * @param deltaTime the time since the last update, in milliseconds
   * @param gpsUncertainty the uncertainty of the GPIRS position in use, null when the GPS is not used
   * @param dmePairDistances the distances to the two DMEs of the DME pair in use, in NM, null without a DME pair
   * @param vorDmeDistance the distance to the VOR/DME in use for navigation, in NM, null without one
   */
  update(
    deltaTime: number,
    gpsUncertainty: number | null,
    dmePairDistances: readonly [number, number] | null,
    vorDmeDistance: number | null,
  ): PositionUncertaintyState {
    let mode: FmNavigationMode;
    let uncertainty: number;
    if (gpsUncertainty !== null) {
      mode = FmNavigationMode.IrsGps;
      uncertainty = gpsUncertainty;
    } else if (dmePairDistances !== null) {
      mode = FmNavigationMode.IrsDmeDme;
      uncertainty = radioPositionUncertainty(mode, Math.max(...dmePairDistances));
    } else if (vorDmeDistance !== null) {
      mode = FmNavigationMode.IrsVorDme;
      uncertainty = radioPositionUncertainty(mode, vorDmeDistance);
    } else {
      mode = FmNavigationMode.IrsOnly;
      if (this.mode !== FmNavigationMode.IrsOnly) {
        // The IRS position drifts from where the last update left it
        this.irsOnlyInitial = this.uncertainty ?? IRS_ALIGNMENT_UNCERTAINTY;
        this.irsOnlyMinutes = 0;
      }
      this.irsOnlyMinutes += deltaTime / 60_000;
      uncertainty = irsOnlyPositionUncertainty(this.irsOnlyInitial, this.irsOnlyMinutes);
    }
    this.mode = mode;
    this.uncertainty = uncertainty;
    return { mode, uncertainty };
  }
}
