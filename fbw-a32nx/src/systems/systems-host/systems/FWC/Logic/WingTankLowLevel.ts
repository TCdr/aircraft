// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface WingTankLowLevelInputs {
  /** The FUEL MODE SEL pb is at MAN */
  readonly modeSelMan: boolean;
  /** The centre tank is empty */
  readonly centreTankEmpty: boolean;
  /** The FUEL X FEED pb is ON */
  readonly crossFeedOn: boolean;
  /** TK PUMP 1 of the side with the low level is ON */
  readonly pump1On: boolean;
  /** TK PUMP 2 of the side with the low level is ON */
  readonly pump2On: boolean;
}

/**
 * The lines of FUEL L(R) WING TK LO LVL (EwdMessages 2800130xx / 2800140xx: title, -FUEL MODE SEL MAN, .IF NO FUEL LEAK
 * AND, FUEL IMBALANCE:, -FUEL X FEED ON, -TK PUMP 1 OFF, -TK PUMP 2 OFF).
 * A320 FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL (a320_fcom.txt l.86468-86475): "If center tank not empty: FUEL MODE
 * SEL ... MAN", then "IF NO FUEL LEAK AND FUEL IMBALANCE: FUEL X FEED ... ON, TK PUMP 1 ... OFF, TK PUMP 2 ... OFF".
 * The MODE SEL line was shown with an empty centre tank too.
 * @param inputs the conditions of the conditional lines
 * @returns the line indexes, null for a hidden line
 */
/** STATUS codes (StatusMessages) of FUEL L(R) WING TK LO LVL */
export const WING_TK_LO_LVL_STATUS = {
  ctrTankFeedManOnly: '280200003',
  leftTankPumps: '280300005',
  rightTankPumps: '280300006',
} as const;

/**
 * The STATUS of FUEL L(R) WING TK LO LVL. A320 FCOM PRO-ABN-FUEL (a320_fcom.txt l.86477-86484, PDF PRO-ABN-FUEL
 * P 44/50): INOP SYS "TK PUMPS"; "If center tank not empty: CTR TK FEED: MAN ONLY". Design choice: TK PUMPS is shown
 * as the L (R) TK PUMPS line of the side with the low level (the existing INOP SYS lines).
 * @param side the side with the low level
 * @param centreTankEmpty the centre tank is empty
 * @returns the INOP SYS codes and the information codes
 */
export function wingTankLowLevelStatus(
  side: 'L' | 'R',
  centreTankEmpty: boolean,
): { inopSys: string[]; info: string[] } {
  return {
    inopSys: [side === 'L' ? WING_TK_LO_LVL_STATUS.leftTankPumps : WING_TK_LO_LVL_STATUS.rightTankPumps],
    info: centreTankEmpty ? [] : [WING_TK_LO_LVL_STATUS.ctrTankFeedManOnly],
  };
}

export function wingTankLowLevelLines(inputs: WingTankLowLevelInputs): (number | null)[] {
  return [
    0,
    !inputs.modeSelMan && !inputs.centreTankEmpty ? 1 : null,
    !inputs.crossFeedOn ? 2 : null,
    !inputs.crossFeedOn ? 3 : null,
    !inputs.crossFeedOn ? 4 : null,
    inputs.pump1On ? 5 : null,
    inputs.pump2On ? 6 : null,
  ];
}
