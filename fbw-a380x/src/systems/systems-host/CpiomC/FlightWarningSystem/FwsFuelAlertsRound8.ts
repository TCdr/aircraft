// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) alerts of the FCOM gap backlog round 8: FUEL L(R) WING FEED PMPs FAULT, FUEL WINGS NOT BALANCED,
 * FUEL WINGS BALANCED and FUEL INR TKs QTY LO, with their procedure lines.
 *
 * Source: A380 FCOM PRO-ABN-ECAM-10-28 "FUEL" (KAL fleet, 25 JUL 11). "l." = line of the text copy
 * references/manuals/a380_fcom.txt; the flight phase inhibitions, master lights and audio are figures, read from
 * airbus-a380-fcom_compress.pdf ("PDF p."). The FCOM gives the quantities in lb; they are converted to kg here.
 */

import { FeedTankPumpAlerts, FeedTankPumpFlags, feedTankPumpAlerts } from './FuelPumpValveFlags';
import { FwcFlightPhase } from './FwsFlightPhases';
import { ProcedureLines, procedureLines } from './FwsElecAlertsRound8';

const KG_PER_LB = 0.45359237;

/**
 * Flight phase inhibitions (FCOM figures): FUEL L(R) WING FEED PMPs FAULT phases 4-7, 9, 10 (PDF p.5216); FUEL WINGS
 * NOT BALANCED and FUEL WINGS BALANCED phases 3-7, 9, 10 (PDF p.5294, p.5289); FUEL INR TKs QTY LO phases 3-11
 * (PDF p.5199).
 */
export const ROUND8_FUEL_PHASE_INHIBITION: {
  wingFeedPumpsFault: number[];
  wingsNotBalanced: number[];
  wingsBalanced: number[];
  innerTanksQtyLo: number[];
} = {
  wingFeedPumpsFault: [4, 5, 6, 7, 9, 10],
  wingsNotBalanced: [3, 4, 5, 6, 7, 9, 10],
  wingsBalanced: [3, 4, 5, 6, 7, 9, 10],
  innerTanksQtyLo: [3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Four values, one per feed tank 1 to 4 */
export type FeedTanks<T> = [T, T, T, T];

/** The feed tank pump alerts with the wing alerts that replace the MAIN + STBY PMPs FAULT of both tanks of a wing */
export interface FeedPumpAlertsWithWings {
  /** Per feed tank 1-4; mainAndStbyFault is false where a WING FEED PMPs FAULT covers the tank */
  tanks: FeedTanks<FeedTankPumpAlerts>;
  /** FUEL L WING FEED PMPs FAULT (281800070) */
  leftWing: boolean;
  /** FUEL R WING FEED PMPs FAULT (281800071) */
  rightWing: boolean;
}

/**
 * The feed tank pump alerts (feedTankPumpAlerts), with:
 * - FUEL L(R) WING FEED PMPs FAULT, l.151700-151704: "All left(right) wing feed tank pumps are either: operating at low
 *   pressure, or abnormally not running, or turned off by the flight crew (except in flight phase 1 and 12, or, if
 *   required by another ECAM procedure (e.g. FUEL WINGS NOT BALANCED))". Left wing = feed tanks 1 and 2, right wing =
 *   feed tanks 3 and 4. Design choice: the wing alert replaces the two FEED TK n MAIN + STBY PMPs FAULT alerts of its
 *   tanks (the FCOM note l.151783-151786 says the wing alert "is replaced again by" them once it no longer applies).
 * - The "required by another ECAM procedure" exception, for the tanks in `pumpsOffRequired`: their pump pb-sw OFF does
 *   not count as faulty (FUEL WINGS NOT BALANCED asks to switch off the pumps of the lighter feed tank). A failed pump
 *   (low pressure) still counts.
 * @param pumps the pumps of feed tanks 1 to 4 (readFeedTankPumpFlags)
 * @param flightPhase the FWS flight phase
 * @param pumpsOffRequired per feed tank, whether another procedure asks for its pumps OFF
 */
export function feedPumpAlertsWithWings(
  pumps: readonly FeedTankPumpFlags[],
  flightPhase: FwcFlightPhase,
  pumpsOffRequired: readonly boolean[],
): FeedPumpAlertsWithWings {
  const tanks = pumps.map((flags, tank) =>
    feedTankPumpAlerts(pumpsOffRequired[tank] ? { ...flags, mainPbOn: true, stbyPbOn: true } : flags, flightPhase),
  ) as FeedTanks<FeedTankPumpAlerts>;
  const leftWing = tanks[0].mainAndStbyFault && tanks[1].mainAndStbyFault;
  const rightWing = tanks[2].mainAndStbyFault && tanks[3].mainAndStbyFault;
  const covered = [leftWing, leftWing, rightWing, rightWing];
  return {
    tanks: tanks.map((alerts, tank) => ({
      ...alerts,
      mainAndStbyFault: alerts.mainAndStbyFault && !covered[tank],
    })) as FeedTanks<FeedTankPumpAlerts>,
    leftWing,
    rightWing,
  };
}

/** Imbalance thresholds of FUEL WINGS NOT BALANCED, l.154814-154824, in kg */
export const WINGS_IMBALANCE_KG = {
  /** "more than 6 600 lb between the symmetric feed tanks" (on ground and in flight) */
  feed: 6_600 * KG_PER_LB,
  /** "more than 6 600 lb between the inner tanks" (on ground) */
  inner: 6_600 * KG_PER_LB,
  /** "more than 5 500 lb between the mid tanks" (on ground) */
  mid: 5_500 * KG_PER_LB,
  /** "more than 2 600 lb between the outer tanks" (on ground) */
  outer: 2_600 * KG_PER_LB,
} as const;

/** The fuel and cockpit state of the wings balance monitoring */
export interface WingsBalanceInputs {
  onGround: boolean;
  /** Fuel in feed tanks 1 to 4, kg */
  feedKg: FeedTanks<number>;
  /** Fuel in the L and R inner, mid and outer tanks, kg */
  innerKg: [number, number];
  midKg: [number, number];
  outerKg: [number, number];
  /** Refuel or defuel in progress, or refuel panel open: "inhibited during refueling, ground fuel transfers, and defueling" */
  fuelingInProgress: boolean;
  crossFeedPbOn: FeedTanks<boolean>;
  feedMainPbOn: FeedTanks<boolean>;
  feedStbyPbOn: FeedTanks<boolean>;
}

/** One pair of symmetric feed tanks, as the procedures name them: 1 & 4, 2 & 3 (indexes of the feed tanks) */
const FEED_PAIRS: readonly [number, number][] = [
  [0, 3],
  [1, 2],
];

/** The state of the wings balance alerts */
export interface WingsBalanceState {
  /** FUEL WINGS NOT BALANCED (281800100) */
  notBalanced: boolean;
  /** Per pair (1 & 4, 2 & 3): the in-flight NOT BALANCED procedure of the pair applies */
  notBalancedPair: [boolean, boolean];
  /** Per pair: the lighter feed tank (index 0-3) when the pair triggered, null when the pair is balanced */
  lighterTank: [number | null, number | null];
  /** FUEL WINGS BALANCED (281800098) */
  balanced: boolean;
  /** Per pair: the BALANCED procedure of the pair applies */
  balancedPair: [boolean, boolean];
  /** Per feed tank: its pumps are OFF on request of these procedures (see feedPumpAlertsWithWings) */
  pumpsOffRequired: FeedTanks<boolean>;
}

/**
 * FUEL WINGS NOT BALANCED (l.154808-154887) and FUEL WINGS BALANCED (l.154594-154616).
 *
 * - On ground: NOT BALANCED while an imbalance exceeds its threshold (feed, inner, mid, outer tanks), unless fueling
 *   is in progress; it clears with the imbalance (the ground procedure asks for a transfer or a delayed takeoff).
 * - In flight: a pair of feed tanks (1 & 4, 2 & 3) whose imbalance exceeds 6 600 lb triggers NOT BALANCED. Design
 *   choice: the alert then stays until the pair is balanced, otherwise it would disappear 1 kg under the threshold, in
 *   the middle of its procedure. The FCOM gives no "balanced" threshold; design choice: balanced when the tank that was
 *   lighter is no longer lighter (the procedure feeds all engines from the heavier tank until the quantities are equal).
 *   WINGS BALANCED then shows, until its lines are done (the pumps of the pair ON, its crossfeeds OFF): "Following the
 *   FUEL WINGS NOT BALANCED alert, the corrective actions to balance the fuel in the feed tanks are successful."
 * - Landing ends the in-flight procedures (design choice).
 */
export class WingsBalanceMonitor {
  private readonly lighter: [number | null, number | null] = [null, null];

  private readonly balancedPending: [boolean, boolean] = [false, false];

  public update(i: WingsBalanceInputs): WingsBalanceState {
    if (i.onGround) {
      this.lighter[0] = this.lighter[1] = null;
      this.balancedPending[0] = this.balancedPending[1] = false;
    } else {
      FEED_PAIRS.forEach(([a, b], pair) => {
        const lighterTank = this.lighter[pair];
        if (lighterTank === null) {
          if (Math.abs(i.feedKg[a] - i.feedKg[b]) > WINGS_IMBALANCE_KG.feed) {
            this.lighter[pair] = i.feedKg[a] < i.feedKg[b] ? a : b;
            this.balancedPending[pair] = false;
          }
        } else {
          const heavierTank = lighterTank === a ? b : a;
          if (i.feedKg[lighterTank] >= i.feedKg[heavierTank]) {
            this.lighter[pair] = null;
            this.balancedPending[pair] = true;
          }
        }
        if (this.balancedPending[pair]) {
          const done =
            i.feedMainPbOn[a] &&
            i.feedStbyPbOn[a] &&
            i.feedMainPbOn[b] &&
            i.feedStbyPbOn[b] &&
            !i.crossFeedPbOn[a] &&
            !i.crossFeedPbOn[b];
          if (done) {
            this.balancedPending[pair] = false;
          }
        }
      });
    }

    const groundImbalance =
      i.onGround &&
      !i.fuelingInProgress &&
      (FEED_PAIRS.some(([a, b]) => Math.abs(i.feedKg[a] - i.feedKg[b]) > WINGS_IMBALANCE_KG.feed) ||
        Math.abs(i.innerKg[0] - i.innerKg[1]) > WINGS_IMBALANCE_KG.inner ||
        Math.abs(i.midKg[0] - i.midKg[1]) > WINGS_IMBALANCE_KG.mid ||
        Math.abs(i.outerKg[0] - i.outerKg[1]) > WINGS_IMBALANCE_KG.outer);

    const notBalancedPair: [boolean, boolean] = [this.lighter[0] !== null, this.lighter[1] !== null];
    const pumpsOffRequired: FeedTanks<boolean> = [false, false, false, false];
    FEED_PAIRS.forEach(([a, b], pair) => {
      // The lighter tank of a pair in NOT BALANCED, and both tanks of a pair in BALANCED until their pumps are back ON
      if (this.lighter[pair] !== null) {
        pumpsOffRequired[this.lighter[pair] as number] = true;
      }
      if (this.balancedPending[pair]) {
        pumpsOffRequired[a] = pumpsOffRequired[b] = true;
      }
    });
    return {
      notBalanced: groundImbalance || notBalancedPair[0] || notBalancedPair[1],
      notBalancedPair,
      lighterTank: [this.lighter[0], this.lighter[1]],
      balanced: this.balancedPending[0] || this.balancedPending[1],
      balancedPair: [this.balancedPending[0], this.balancedPending[1]],
      pumpsOffRequired,
    };
  }
}

/** FUEL INR TKs QTY LO thresholds, l.151124-151125: FOB "more than 110 200 lb", inner tank "less than 11 200 lb" */
export const INR_TKS_QTY_LO_FOB_KG = 110_200 * KG_PER_LB;
export const INR_TKS_QTY_LO_INNER_KG = 11_200 * KG_PER_LB;

/** The inputs of FUEL INR TKs QTY LO */
export interface InnerTanksQtyLoInputs {
  onGround: boolean;
  /** The ZFW and ZFCG are entered in the FMS (the FQMS status word has no "ZFW or ZFWCG not set") */
  zfwAndZfcgEntered: boolean;
  /** The FQMS fuel on board, kg, null if not valid */
  fobKg: number | null;
  /** Fuel in the L and R inner tanks, kg */
  innerKg: [number, number];
  /** Both outer tanks are full */
  outerTanksFull: boolean;
  /** Refuel panel open or fueling in progress (the REFUEL pb-sw is INOP in the simulation) */
  refuelPanelOpenOrFueling: boolean;
}

/**
 * FUEL INR TKs QTY LO (281800051), l.151124-151127: "On ground, when the flight crew enters the ZFW and ZFCG in the
 * FMS, the Fuel On Board (FOB) is more than 110 200 lb, and the quantity in any inner tank is less than 11 200 lb. The
 * alert is inhibited when the outer tanks are full, or when the refuel panel door is open, or if the flight crew presses
 * the REFUEL pb-sw."
 */
export function isInnerTanksQtyLo(i: InnerTanksQtyLoInputs): boolean {
  return (
    i.onGround &&
    i.zfwAndZfcgEntered &&
    i.fobKg !== null &&
    i.fobKg > INR_TKS_QTY_LO_FOB_KG &&
    Math.min(i.innerKg[0], i.innerKg[1]) < INR_TKS_QTY_LO_INNER_KG &&
    !i.outerTanksFull &&
    !i.refuelPanelOpenOrFueling
  );
}

/** The cockpit state the fuel procedure lines depend on */
export interface FuelProcedureInputs {
  onGround: boolean;
  /** Any engine running (before / after the first engine start) */
  anyEngineRunning: boolean;
  /** FlightTimeAboveFl300.moreThan30Min */
  moreThan30MinAboveFl300: boolean;
  crossFeedPbOn: FeedTanks<boolean>;
  feedMainPbOn: FeedTanks<boolean>;
  feedStbyPbOn: FeedTanks<boolean>;
  /** ENG START selector at IGN START */
  engStartSelIgnStart: boolean;
}

/**
 * FUEL L(R) WING FEED PMPs FAULT, l.151757-151873 (items of ata28.ts 281800070 / 281800071).
 * Before takeoff (on ground): the four pumps OFF. After takeoff: ALL CROSSFEEDS OFF; IF NO FUEL LEAK: ALL CROSSFEEDS ON,
 * the four pumps OFF, and the gravity feeding lines. Design choice: the first ALL CROSSFEEDS OFF line is checked once
 * the crossfeeds have all been seen OFF (`crossfeedsSeenOff`), so that switching them back ON under IF NO FUEL LEAK does
 * not undo it.
 * @param side 0 for the left wing (feed tanks 1, 2), 1 for the right wing (feed tanks 3, 4)
 * @param crossfeedsSeenOff all crossfeed pb-sw have been OFF since the alert triggered
 */
export function wingFeedPumpsFaultLines(
  i: FuelProcedureInputs,
  side: 0 | 1,
  crossfeedsSeenOff: boolean,
): ProcedureLines {
  const [first, second] = side === 0 ? [0, 1] : [2, 3];
  const ground = i.onGround;
  const flight = !i.onGround;
  const pumpsOff = (shown: boolean): [boolean, boolean][] => [
    [shown, !i.feedMainPbOn[first]],
    [shown, !i.feedStbyPbOn[first]],
    [shown, !i.feedMainPbOn[second]],
    [shown, !i.feedStbyPbOn[second]],
  ];
  const allOff = i.crossFeedPbOn.every((on) => !on);
  return procedureLines(
    ...pumpsOff(ground), // Before takeoff: FEED TK x MAIN/STBY PMP OFF (l.151758-151761)
    [ground, false], // FEED TK 1(4) : 1300 KG MAX NOT USABLE (l.151763, 2 900 lb)
    [ground, false], // FEED TK 2(3) : 2000 KG MAX NOT USABLE (l.151769, 4 400 lb)
    [flight, crossfeedsSeenOff], // After takeoff: ALL CROSSFEEDS OFF (l.151788)
    [flight, false], // IF NO FUEL LEAK : (l.151790)
    [flight, i.crossFeedPbOn.every((on) => on)], // ALL CROSSFEEDS ON (l.151802)
    ...pumpsOff(flight), // FEED TK x MAIN/STBY PMP OFF (l.151804-151821)
    [flight, false], // FEED TK 1(4) : 1300 KG MAX NOT USABLE (l.151823)
    [flight, false], // FEED TK 2(3) : 2000 KG MAX NOT USABLE (l.151831)
    [flight, false], // WHEN INR & MID TKs EMPTY : (l.151839)
    [flight && i.moreThan30MinAboveFl300, false], // DESCENT TO FL 280 INITIATE (l.151842)
    [flight && i.moreThan30MinAboveFl300, false], // MAX FL : 280
    [flight && !i.moreThan30MinAboveFl300, false], // DESCENT TO FL 50/MEA INITIATE (l.151852)
    [flight && !i.moreThan30MinAboveFl300, false], // MAX FL : 50/MEA
    [flight, i.engStartSelIgnStart], // ENG START SEL IGN START (l.151861)
    [flight, allOff], // ALL CROSSFEEDS OFF (l.151865)
    [flight, false], // EXPECT NORM COLLECTOR CELL DEPLETION (l.151867)
    [flight, false], // AVOID NEG G LOAD (l.151873)
  );
}

/**
 * FUEL WINGS NOT BALANCED, l.154852-154887 (items of ata28.ts 281800100). On ground: IF T.O PLANNED, AUTO GND XFR ON
 * before the first engine start, WINGS IMBALANCE COMPENSATE after it, DELAY T.O. In flight, per unbalanced pair: FEED TK
 * a & b NOT BALANCED, IF NO FUEL LEAK: CROSSFEED a, b ON, and the lighter side's STBY and MAIN PMP OFF.
 */
export function wingsNotBalancedLines(i: FuelProcedureInputs, state: WingsBalanceState): ProcedureLines {
  const ground = i.onGround;
  const lines: [boolean, boolean][] = [
    [ground, false], // IF T.O PLANNED :
    [ground && !i.anyEngineRunning, false], // AUTO GND XFR ON (INOP pb-sw: a crew check box)
    [ground && i.anyEngineRunning, false], // WINGS IMBALANCE COMPENSATE
    [ground, false], // DELAY T.O
  ];
  FEED_PAIRS.forEach(([a, b], pair) => {
    const shown = !ground && state.notBalancedPair[pair];
    lines.push(
      [shown, false], // FEED TK a & b NOT BALANCED
      [shown, false], // IF NO FUEL LEAK :
      [shown, i.crossFeedPbOn[a]], // CROSSFEED a ON
      [shown, i.crossFeedPbOn[b]], // CROSSFEED b ON
    );
    for (const tank of [a, b]) {
      const lighter = shown && state.lighterTank[pair] === tank;
      lines.push(
        [lighter, !i.feedStbyPbOn[tank]], // FEED TK (lighter side) STBY PMP OFF
        [lighter, !i.feedMainPbOn[tank]], // FEED TK (lighter side) MAIN PMP OFF
      );
    }
  });
  return procedureLines(...lines);
}

/** FUEL WINGS BALANCED, l.154610-154616 (items of ata28.ts 281800098), per balanced pair */
export function wingsBalancedLines(i: FuelProcedureInputs, state: WingsBalanceState): ProcedureLines {
  const lines: [boolean, boolean][] = [];
  FEED_PAIRS.forEach(([a, b], pair) => {
    const shown = state.balancedPair[pair];
    lines.push(
      [shown, false], // FEED TK a & b BALANCED
      [shown, i.feedMainPbOn[a]], // FEED TK a MAIN PMP ON
      [shown, i.feedStbyPbOn[a]], // FEED TK a STBY PMP ON
      [shown, i.feedMainPbOn[b]], // FEED TK b MAIN PMP ON
      [shown, i.feedStbyPbOn[b]], // FEED TK b STBY PMP ON
      [shown, !i.crossFeedPbOn[a]], // CROSSFEED a OFF
      [shown, !i.crossFeedPbOn[b]], // CROSSFEED b OFF
    );
  });
  return procedureLines(...lines);
}

/** FUEL INR TKs QTY LO, l.151138-151139 (items of ata28.ts 281800051): IF REFUEL NOT PLANNED : AUTO GND XFR ON */
export function innerTanksQtyLoLines(): ProcedureLines {
  return procedureLines([true, false], [true, false]);
}

/**
 * Remembers whether all crossfeeds have been OFF since an alert triggered, for the first ALL CROSSFEEDS OFF line of
 * FUEL L(R) WING FEED PMPs FAULT.
 */
export class SeenAllOffSincePulse {
  private wasActive = false;

  private seen = false;

  public update(alertActive: boolean, allOff: boolean): boolean {
    if (alertActive && !this.wasActive) {
      this.seen = false;
    }
    this.wasActive = alertActive;
    if (alertActive && allOff) {
      this.seen = true;
    }
    return alertActive && this.seen;
  }
}

/** STATUS keys (EcamLimitations, EcamInopSys, EcamInfos) of the fuel alerts, l.151887-151955 */
export const WING_FEED_PUMPS_FAULT_STATUS: { inopSysAllPhases: string[][]; info: string[][] } = {
  /** FEED TK 1 PMPs, FEED TK 2 PMPs (left) / FEED TK 3 PMPs, FEED TK 4 PMPs (right) (l.151946-151947) */
  inopSysAllPhases: [
    ['280300011', '280300012'],
    ['280300013', '280300014'],
  ],
  /** L(R) WING FEED TKs BY GRVTY ONLY (l.151951) */
  info: [['280200013'], ['280200014']],
  // Left out: the LIMITATIONS (MAX FL, AVOID NEG G LOAD, FUEL PARTLY UNUSABLE) apply "when inner and mid tanks are
  // empty" (l.151893-151907), and the INFO lines FEED TK 1(4) / 2(3) MAX NOT USABLE have no key.
};
