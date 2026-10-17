// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Below 750 kg (1 650 lb) in one wing tank, the low level sensor triggers the LO LVL warning, independent of the
 * displayed fuel quantity of the tank. A failed low level sensor (flyPad failures 28014/28015, systems-host
 * Fuel/FuelLevelSensing) does not give it.
 */
const WING_TANK_LOW_LEVEL_KG = 750;

/** Whether the low level sensor of a wing tank senses the low level */
export function isWingTankLowLevelSensed(innerTankKg: number, sensorFailed: boolean): boolean {
  return innerTankKg < WING_TANK_LOW_LEVEL_KG && !sensorFailed;
}

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

/** STATUS codes (StatusMessages) of FUEL L(R) WING TK LO LVL */
const WING_TK_LO_LVL_STATUS = {
  ctrTankFeedManOnly: '280200003',
  leftTankPumps: '280300005',
  rightTankPumps: '280300006',
} as const;

/**
 * The STATUS of FUEL L(R) WING TK LO LVL: INOP SYS TK PUMPS; with fuel in the centre tank: CTR TK FEED: MAN ONLY.
 * Design choice: TK PUMPS is shown as the L (R) TK PUMPS line of the side with the low level (the existing INOP SYS
 * lines).
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

export interface WingTanksLowLevelInputs {
  /** The FUEL MODE SEL pb is at MAN */
  readonly modeSelMan: boolean;
  /** The centre tank is empty */
  readonly centreTankEmpty: boolean;
  /** The L TK PUMP 1 and 2, R TK PUMP 1 and 2 pb-sw are ON */
  readonly leftPump1On: boolean;
  readonly leftPump2On: boolean;
  readonly rightPump1On: boolean;
  readonly rightPump2On: boolean;
  /** The CTR TK L (R) XFR pb-sw are ON */
  readonly centreLeftTransferOn: boolean;
  readonly centreRightTransferOn: boolean;
}

/**
 * The lines of FUEL L+R WING TK LO LVL (EwdMessages 28001450x/280014510-14): 0 title, 1 -FUEL MODE SEL MAN, 2-3 -L TK
 * PUMP 1(2) ON, 4 -CTR TK L XFR ON, 5 -CTR TK PUMP 1 ON, 6-7 -R TK PUMP 1(2) ON, 8 -CTR TK R XFR ON, 9 -CTR TK PUMP 2 ON,
 * 10 .IF NO FUEL LEAK:, 11 -FUEL X FEED ON, 12 .IF GRVTY FEED:, 13 -FUEL X FEED OFF.
 * The FBW A32NX is the jet pump variant of the fuel system (centre tank transfer valves, see Fuel/FuelPumpsAndValves).
 * The procedure of that variant: LAND ASAP (amber), FUEL MODE SEL MAN (with fuel in the centre tank), ALL TK PUMPS
 * ON, CTR TK L+R XFR ON, IF NO FUEL LEAK: FUEL X FEED ON, IF GRVTY FEED: FUEL X FEED OFF. The CTR TK PUMP lines belong
 * to the centre tank pump variant and are never shown. A done action line is hidden.
 * @param inputs the conditions of the conditional lines
 * @returns the line indexes, null for a hidden line
 */
export function wingTanksLowLevelLines(inputs: WingTanksLowLevelInputs): (number | null)[] {
  return [
    0,
    !inputs.modeSelMan && !inputs.centreTankEmpty ? 1 : null,
    inputs.leftPump1On ? null : 2,
    inputs.leftPump2On ? null : 3,
    inputs.centreLeftTransferOn ? null : 4,
    null,
    inputs.rightPump1On ? null : 6,
    inputs.rightPump2On ? null : 7,
    inputs.centreRightTransferOn ? null : 8,
    null,
    10,
    11,
    12,
    13,
  ];
}

/**
 * The lines of FUEL L(R) WING TK LO LVL (EwdMessages 2800130xx / 2800140xx: title, -FUEL MODE SEL MAN, .IF NO FUEL LEAK
 * AND, FUEL IMBALANCE:, -FUEL X FEED ON, -TK PUMP 1 OFF, -TK PUMP 2 OFF).
 * FUEL MODE SEL MAN only with fuel in the centre tank; then, if no fuel leak and a fuel imbalance: FUEL X FEED ON,
 * TK PUMP 1 OFF, TK PUMP 2 OFF.
 * @param inputs the conditions of the conditional lines
 * @returns the line indexes, null for a hidden line
 */
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
