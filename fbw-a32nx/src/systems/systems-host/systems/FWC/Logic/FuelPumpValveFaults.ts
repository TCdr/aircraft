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
