// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Wing imbalance indications of the FUEL SD page (the quantity stays green, underlined amber): feed tank 1(2) not
 * balanced with feed tank 4(3), or the left inner (mid) (outer) tank not balanced with the right one.
 * Both come with the FUEL WINGS NOT BALANCED alert, so the trigger is that of the alert (as the FWS computes it in
 * systems-host WingsBalanceMonitor):
 * - On ground, unless fueling: feed tanks 1-4 / 2-3 more than 6 600 lb apart, inner tanks 6 600 lb, mid tanks
 *   5 500 lb, outer tanks 2 600 lb.
 * - In flight: a pair of feed tanks more than 6 600 lb apart; it stays until the lighter tank is no longer lighter (the
 *   FWS design choice: the procedure feeds the engines from the heavier tank until the quantities are equal).
 * Design choice: both tanks of an unbalanced pair are underlined, the source names the pair.
 */

const KG_PER_LB = 0.45359237;

/** Imbalance thresholds of FUEL WINGS NOT BALANCED, in kg */
export const WING_IMBALANCE_KG = {
  feed: 6_600 * KG_PER_LB,
  inner: 6_600 * KG_PER_LB,
  mid: 5_500 * KG_PER_LB,
  outer: 2_600 * KG_PER_LB,
} as const;

/** One pair of symmetric feed tanks: 1 & 4, 2 & 3 (indexes of the feed tanks) */
const FEED_PAIRS: readonly [number, number][] = [
  [0, 3],
  [1, 2],
];

/** Fuel quantities and state of the wings balance indication */
export interface WingImbalanceInputs {
  onGround: boolean;
  /** Refuel or defuel in progress, or refuel panel open */
  fuelingInProgress: boolean;
  /** Fuel in feed tanks 1 to 4, kg (null without valid data) */
  feedKg: (number | null)[];
  /** Fuel in the L and R inner, mid and outer tanks, kg (null without valid data) */
  innerKg: [number | null, number | null];
  midKg: [number | null, number | null];
  outerKg: [number | null, number | null];
}

/** Which tank quantities are underlined */
interface WingImbalanceUnderlines {
  /** feed tanks 1 to 4 */
  feed: [boolean, boolean, boolean, boolean];
  /** L and R inner, mid and outer tanks */
  inner: [boolean, boolean];
  mid: [boolean, boolean];
  outer: [boolean, boolean];
}

function apart(a: number | null, b: number | null, thresholdKg: number): boolean {
  return a !== null && b !== null && Math.abs(a - b) > thresholdKg;
}

/** The wings imbalance underlines of the FUEL page, with the in-flight memory of the unbalanced feed tank pairs */
export class WingImbalanceIndication {
  /** Per feed tank pair: the lighter tank while the pair is unbalanced in flight */
  private readonly lighter: [number | null, number | null] = [null, null];

  /**
   * @param i the inputs
   * @returns the underlined quantities
   */
  public update(i: WingImbalanceInputs): WingImbalanceUnderlines {
    const feed: [boolean, boolean, boolean, boolean] = [false, false, false, false];
    const none: [boolean, boolean] = [false, false];

    if (i.onGround) {
      this.lighter[0] = this.lighter[1] = null;
      if (i.fuelingInProgress) {
        return { feed, inner: none, mid: none, outer: none };
      }
      FEED_PAIRS.forEach(([a, b]) => {
        if (apart(i.feedKg[a], i.feedKg[b], WING_IMBALANCE_KG.feed)) {
          feed[a] = feed[b] = true;
        }
      });
      const pair = (tanks: [number | null, number | null], threshold: number): [boolean, boolean] => {
        const unbalanced = apart(tanks[0], tanks[1], threshold);
        return [unbalanced, unbalanced];
      };
      return {
        feed,
        inner: pair(i.innerKg, WING_IMBALANCE_KG.inner),
        mid: pair(i.midKg, WING_IMBALANCE_KG.mid),
        outer: pair(i.outerKg, WING_IMBALANCE_KG.outer),
      };
    }

    FEED_PAIRS.forEach(([a, b], pairIndex) => {
      const qa = i.feedKg[a];
      const qb = i.feedKg[b];
      if (qa === null || qb === null) {
        return;
      }
      const lighterTank = this.lighter[pairIndex];
      if (lighterTank === null) {
        if (Math.abs(qa - qb) > WING_IMBALANCE_KG.feed) {
          this.lighter[pairIndex] = qa < qb ? a : b;
        }
      } else {
        const heavierTank = lighterTank === a ? b : a;
        if ((i.feedKg[lighterTank] as number) >= (i.feedKg[heavierTank] as number)) {
          this.lighter[pairIndex] = null;
        }
      }
      if (this.lighter[pairIndex] !== null) {
        feed[a] = feed[b] = true;
      }
    });
    return { feed, inner: none, mid: none, outer: none };
  }
}
