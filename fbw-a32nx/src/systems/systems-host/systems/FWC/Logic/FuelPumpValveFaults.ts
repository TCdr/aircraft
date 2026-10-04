// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The FUEL L(R) TK PUMP cautions of one wing (A320 FCOM PRO-ABN-FUEL, a320_fcom.txt l.86168-86260) */
export interface WingTankPumpAlerts {
  /** FUEL L(R) TK PUMP 1 LO PR */
  pump1LoPr: boolean;
  /** FUEL L(R) TK PUMP 2 LO PR */
  pump2LoPr: boolean;
  /** FUEL L(R) TK PUMP 1+2 LO PR, which replaces the two single pump cautions */
  pumps1And2LoPr: boolean;
}

/**
 * The tank pump cautions of one wing: "This alert triggers when the pressure of one tank pump is low" (L(R) TK PUMP
 * 1(2) LO PR), "... when the pressure of the tank pumps is low" (L(R) TK PUMP 1 + 2 LO PR).
 * @param pump1LowPressure whether pump 1 is ON with a low delivery pressure (L:A32NX_FUEL_PUMP_n_LO_PR, confirmed)
 * @param pump2LowPressure the same for pump 2
 */
export function wingTankPumpAlerts(pump1LowPressure: boolean, pump2LowPressure: boolean): WingTankPumpAlerts {
  const both = pump1LowPressure && pump2LowPressure;
  return {
    pump1LoPr: pump1LowPressure && !both,
    pump2LoPr: pump2LowPressure && !both,
    pumps1And2LoPr: both,
  };
}

/**
 * Whether the X FEED valve position disagrees with the X FEED pb-sw: the condition of FUEL X FEED VALVE FAULT ("This alert
 * triggers when the valve position disagrees with the selected position", PRO-ABN-FUEL, a320_fcom.txt l.86717), before
 * its confirmation time (the valve travel time is in transit, not a fault).
 * @param openPercentage the valve position, 0 (closed) to 100 (open)
 * @param pbOn whether the X FEED pb-sw is ON
 */
export function isCrossFeedValveDisagree(openPercentage: number, pbOn: boolean): boolean {
  return pbOn ? openPercentage < 100 : openPercentage > 0;
}

/**
 * Whether the FUEL X FEED memo is shown: "if the fuel X FEED pb-sw is ON, and the X FEED valve is not fully closed"
 * (DSC-28-20, a320_fcom.txt l.43407). A valve jammed closed with the pb-sw ON gives no memo.
 * @param pbOn whether the X FEED pb-sw is ON
 * @param openPercentage the valve position, 0 (closed) to 100 (open)
 */
export function isCrossFeedMemoShown(pbOn: boolean, openPercentage: number): boolean {
  return pbOn && openPercentage > 0;
}

/** The ECAM lines of FUEL L(R) TK PUMP 1 + 2 LO PR (A320 FCOM PRO-ABN-FUEL, a320_fcom.txt l.86207-86260) */
export interface WingTankPumps1And2Inputs {
  /** Whether the X FEED pb-sw is ON */
  crossFeedOn: boolean;
  /** Whether the ENG MODE selector is on IGN */
  engModeSelIgn: boolean;
  /** Whether the pump 1 and pump 2 pb-sw of the affected wing are ON */
  pump1On: boolean;
  pump2On: boolean;
  /** Whether the aircraft is above FL 150 (the procedure opens the X FEED above it and closes it below it) */
  aboveFl150: boolean;
}

/**
 * The lines of FUEL L(R) TK PUMP 1 + 2 LO PR to show, in the order of its codes:
 * title, .IF NO FUEL LEAK:, -FUEL X FEED ON (if above FL 150), -ENG MODE SEL IGN, -TK PUMP 1 OFF, -TK PUMP 2 OFF,
 * .WHEN TK FUEL RQRD:, TK FEED GRVTY ONLY, -FUEL X FEED OFF (if below FL 150), PROC:GRVTY FUEL FEEDING,
 * AVOID NEG G FACTOR. An action line goes once it is done.
 */
export function wingTankPumps1And2Lines(inputs: WingTankPumps1And2Inputs): boolean[] {
  return [
    true,
    true,
    inputs.aboveFl150 && !inputs.crossFeedOn,
    !inputs.engModeSelIgn,
    inputs.pump1On,
    inputs.pump2On,
    true,
    true,
    !inputs.aboveFl150 && inputs.crossFeedOn,
    true,
    true,
  ];
}

/** A centre tank transfer valve, as the systems host tells the FWC (Fuel/FuelPumpsAndValves, confirmed) */
export interface CentreTransferValveFlags {
  /** The valve stays not fully closed while commanded closed */
  notFullyClosed: boolean;
  /** The valve stays not fully open while commanded open */
  notFullyOpen: boolean;
}

/** The FUEL CTR XFR FAULT cautions (A320 FCOM PRO-ABN-FUEL, a320_fcom.txt l.85400-85660) */
export interface CentreTransferValveAlerts {
  /** FUEL CTR L XFR FAULT (VALVE NOT FULLY CLOSED): "either center transfer valve is failed in open position" */
  leftNotFullyClosed: boolean;
  rightNotFullyClosed: boolean;
  /** FUEL CTR L + R XFR FAULT (VALVES NOT FULLY CLOSED): "both center transfer valves are failed in open position" */
  bothNotFullyClosed: boolean;
  /** FUEL CTR L XFR FAULT (VALVE NOT FULLY OPEN): "either center transfer valve is failed in closed position" */
  leftNotFullyOpen: boolean;
  rightNotFullyOpen: boolean;
  /** FUEL CTR L + R XFR FAULT (VALVES NOT FULLY OPEN): "both center transfer valves are failed in closed position" */
  bothNotFullyOpen: boolean;
}

/**
 * The centre tank transfer valve cautions: the L + R caution replaces the two single cautions of the same kind.
 * @param left the left valve
 * @param right the right valve
 */
export function centreTransferValveAlerts(
  left: CentreTransferValveFlags,
  right: CentreTransferValveFlags,
): CentreTransferValveAlerts {
  const bothNotFullyClosed = left.notFullyClosed && right.notFullyClosed;
  const bothNotFullyOpen = left.notFullyOpen && right.notFullyOpen;
  return {
    leftNotFullyClosed: left.notFullyClosed && !bothNotFullyClosed,
    rightNotFullyClosed: right.notFullyClosed && !bothNotFullyClosed,
    bothNotFullyClosed,
    leftNotFullyOpen: left.notFullyOpen && !bothNotFullyOpen,
    rightNotFullyOpen: right.notFullyOpen && !bothNotFullyOpen,
    bothNotFullyOpen,
  };
}

/** The cockpit state the lines of a single FUEL CTR L(R) XFR FAULT depend on */
export interface CentreTransferFaultInputs {
  /** Whether the CTR TK XFR pb-sw of the affected side is ON */
  ctrTkXfrOn: boolean;
  /** Whether the FUEL MODE SEL pb-sw is at MAN */
  modeSelMan: boolean;
  /** Whether the X FEED pb-sw is ON */
  crossFeedOn: boolean;
  /** Whether the TK PUMP 1 and TK PUMP 2 pb-sw of the affected side are ON */
  pump1On: boolean;
  pump2On: boolean;
  /** Whether the centre tank is empty */
  centreTankEmpty: boolean;
}

/**
 * The lines of FUEL CTR L(R) XFR FAULT (VALVE NOT FULLY CLOSED) to show, in the order of its codes (A320 FCOM
 * PRO-ABN-FUEL, a320_fcom.txt l.85431-85460): title, -CTR TK XFR OFF, -FUEL X FEED ON, -TK PUMP 1 OFF, -TK PUMP 2 OFF,
 * .WHEN CTR TK EMPTY:, -TK PUMP 1 ON, -TK PUMP 2 ON, -FUEL X FEED OFF. An action line goes once it is done. While the
 * centre tank has fuel, the wing tank pumps are switched off to stop the transfer, and the lines for the empty centre tank
 * are shown below; once it is empty ("automatic recall of the warning"), only these remain (design choice for the
 * display of the two parts).
 */
export function centreTransferNotClosedLines(inputs: CentreTransferFaultInputs): boolean[] {
  const { ctrTkXfrOn, crossFeedOn, pump1On, pump2On, centreTankEmpty } = inputs;
  if (!centreTankEmpty) {
    return [true, ctrTkXfrOn, !crossFeedOn, pump1On, pump2On, true, true, true, true];
  }
  return [true, ctrTkXfrOn, false, false, false, true, !pump1On, !pump2On, crossFeedOn];
}

/**
 * The lines of FUEL CTR L(R) XFR FAULT (VALVE NOT FULLY OPEN) to show, in the order of its codes (A320 FCOM PRO-ABN-FUEL,
 * a320_fcom.txt l.85510-85530): title, -FUEL MODE SEL MAN, .IF UNSUCCESSFUL:, -FUEL X FEED ON, -TK PUMP 1 OFF, -TK PUMP 2
 * OFF, .WHEN CTR TK EMPTY:, -TK PUMP 1 ON, -TK PUMP 2 ON, -FUEL X FEED OFF. The IF UNSUCCESSFUL part applies "if the
 * center tank is not empty"; the lines for the empty centre tank are shown as for VALVE NOT FULLY CLOSED.
 */
export function centreTransferNotOpenLines(inputs: CentreTransferFaultInputs): boolean[] {
  const { modeSelMan, crossFeedOn, pump1On, pump2On, centreTankEmpty } = inputs;
  if (!centreTankEmpty) {
    return [true, !modeSelMan, true, !crossFeedOn, pump1On, pump2On, true, true, true, true];
  }
  return [true, !modeSelMan, false, false, false, false, true, !pump1On, !pump2On, crossFeedOn];
}
