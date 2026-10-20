// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) alerts: FUEL L(R) WING FEED PMPs FAULT, FUEL WINGS NOT BALANCED, FUEL WINGS BALANCED and FUEL
 * INR TKs QTY LO, with their procedure lines. The published quantities are in lb; they are converted to kg here.
 */

import { FeedTankPumpAlerts, FeedTankPumpFlags, feedTankPumpAlerts } from './FuelPumpValveFlags';
import { FwcFlightPhase } from './FwsFlightPhases';
import { ProcedureLines, procedureLines } from './FwsElecCombinedBusAlerts';

const KG_PER_LB = 0.45359237;

/** Flight phases in which each alert is inhibited */
export const FUEL_FEED_BALANCE_PHASE_INHIBITION: {
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
 * - FUEL L(R) WING FEED PMPs FAULT: all left (right) wing feed tank pumps are at low pressure, abnormally not running
 *   or switched off by the crew (switched off does not count in flight phases 1 and 12, or when another ECAM procedure
 *   such as FUEL WINGS NOT BALANCED asks for it). Left wing = feed tanks 1 and 2, right wing = feed tanks 3 and 4.
 *   Design choice: the wing alert replaces the two FEED TK n MAIN + STBY PMPs FAULT alerts of its tanks, which come
 *   back once it no longer applies.
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

/**
 * Imbalance thresholds of FUEL WINGS NOT BALANCED, in kg. In flight the FQMS balances the inner, mid and outer tanks
 * itself; with the FQMS failed, FUEL WINGS MAN BALANCING PROCEDURE uses them (FwsFuelManagementAlerts).
 */
export const WINGS_IMBALANCE_KG = {
  /** Between the symmetric feed tanks, on ground and in flight */
  feed: 6_600 * KG_PER_LB,
  /** On ground only for WINGS NOT BALANCED */
  inner: 6_600 * KG_PER_LB,
  /** On ground only for WINGS NOT BALANCED */
  mid: 5_500 * KG_PER_LB,
  /** On ground only for WINGS NOT BALANCED */
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
  /** Refuel or defuel in progress, or refuel panel open: the alert is inhibited during fueling and ground transfers */
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
 * FUEL WINGS NOT BALANCED and FUEL WINGS BALANCED.
 *
 * - On ground: NOT BALANCED while an imbalance exceeds its threshold (feed, inner, mid, outer tanks), unless fueling
 *   is in progress; it clears with the imbalance (the ground procedure asks for a transfer or a delayed takeoff).
 * - In flight: a pair of feed tanks (1 & 4, 2 & 3) whose imbalance exceeds 6 600 lb triggers NOT BALANCED. Design
 *   choice: the alert then stays until the pair is balanced, otherwise it would disappear 1 kg under the threshold, in
 *   the middle of its procedure. No "balanced" threshold is published; design choice: balanced when the tank that was
 *   lighter is no longer lighter (the procedure feeds all engines from the heavier tank until the quantities are equal).
 *   WINGS BALANCED then shows, to say the corrective actions worked, until its lines are done (the pumps of the pair
 *   ON, its crossfeeds OFF).
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

/** FUEL INR TKs QTY LO thresholds: FOB above 110 200 lb, an inner tank below 11 200 lb */
const INR_TKS_QTY_LO_FOB_KG = 110_200 * KG_PER_LB;
const INR_TKS_QTY_LO_INNER_KG = 11_200 * KG_PER_LB;

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
 * FUEL INR TKs QTY LO (281800051): on ground, once the crew has entered the ZFW and ZFCG in the FMS, the FOB is above
 * 110 200 lb and an inner tank holds less than 11 200 lb. Inhibited when the outer tanks are full, the refuel panel
 * door is open or the REFUEL pb-sw is pressed.
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
 * FUEL L(R) WING FEED PMPs FAULT lines (items of ata28.ts 281800070 / 281800071).
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
    ...pumpsOff(ground), // Before takeoff: FEED TK x MAIN/STBY PMP OFF
    [ground, false], // FEED TK 1(4) : 1300 KG MAX NOT USABLE (2 900 lb)
    [ground, false], // FEED TK 2(3) : 2000 KG MAX NOT USABLE (4 400 lb)
    [flight, crossfeedsSeenOff], // After takeoff: ALL CROSSFEEDS OFF
    [flight, false], // IF NO FUEL LEAK :
    [flight, i.crossFeedPbOn.every((on) => on)], // ALL CROSSFEEDS ON
    ...pumpsOff(flight), // FEED TK x MAIN/STBY PMP OFF
    [flight, false], // FEED TK 1(4) : 1300 KG MAX NOT USABLE
    [flight, false], // FEED TK 2(3) : 2000 KG MAX NOT USABLE
    [flight, false], // WHEN INR & MID TKs EMPTY :
    [flight && i.moreThan30MinAboveFl300, false], // DESCENT TO FL 280 INITIATE
    [flight && i.moreThan30MinAboveFl300, false], // MAX FL : 280
    [flight && !i.moreThan30MinAboveFl300, false], // DESCENT TO FL 50/MEA INITIATE
    [flight && !i.moreThan30MinAboveFl300, false], // MAX FL : 50/MEA
    [flight, i.engStartSelIgnStart], // ENG START SEL IGN START
    [flight, allOff], // ALL CROSSFEEDS OFF
    [flight, false], // EXPECT NORM COLLECTOR CELL DEPLETION
    [flight, false], // AVOID NEG G LOAD
  );
}

/**
 * FUEL WINGS NOT BALANCED lines (items of ata28.ts 281800100). On ground: IF T.O PLANNED, AUTO GND XFR ON
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

/** FUEL WINGS BALANCED lines (items of ata28.ts 281800098), per balanced pair */
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

/** FUEL INR TKs QTY LO lines (items of ata28.ts 281800051): IF REFUEL NOT PLANNED : AUTO GND XFR ON */
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

/** STATUS keys (EcamLimitations, EcamInopSys, EcamInfos) of the fuel alerts */
export const WING_FEED_PUMPS_FAULT_STATUS: { inopSysAllPhases: string[][]; info: string[][] } = {
  /** FEED TK 1 PMPs, FEED TK 2 PMPs (left) / FEED TK 3 PMPs, FEED TK 4 PMPs (right) */
  inopSysAllPhases: [
    ['280300011', '280300012'],
    ['280300013', '280300014'],
  ],
  /** L(R) WING FEED TKs BY GRVTY ONLY */
  info: [['280200013'], ['280200014']],
  // Left out: the LIMITATIONS (MAX FL, AVOID NEG G LOAD, FUEL PARTLY UNUSABLE) apply only once the inner and mid tanks
  // are empty, and the INFO lines FEED TK 1(4) / 2(3) MAX NOT USABLE have no key.
};
