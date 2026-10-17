// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The system conditions of the T.O CONFIG test (the configuration conditions are checked next to it) */
export interface ToConfigSystemStatusInputs {
  /** GEN 1 and GEN 2 are not both operating */
  readonly gen12NotOperating: boolean;
  readonly greenLowPressure: boolean;
  readonly yellowLowPressure: boolean;
  readonly blueLowPressure: boolean;
  readonly eng1PumpPbAuto: boolean;
  readonly eng2PumpPbAuto: boolean;
  /** FUEL L TK PUMP 1+2 LO PR is active */
  readonly leftTankPumps1And2LoPr: boolean;
  /** FUEL R TK PUMP 1+2 LO PR is active */
  readonly rightTankPumps1And2LoPr: boolean;
}

/**
 * Whether the system part of the T.O CONFIG test is normal. The T.O CONFIG test triggers, among others, FUEL R(L) TK
 * PUMP 1+2 LO PR, HYD G(Y) ENG 1(2) PUMP LO PR, HYD G(Y)(B) SYS LO PR and the ELEC GEN alerts; T.O CONFIG NORMAL is
 * shown only when no such alert is triggered.
 * @param inputs the system conditions
 * @returns true when no system condition prevents T.O CONFIG NORMAL
 */
export function isToConfigSystemStatusNormal(inputs: ToConfigSystemStatusInputs): boolean {
  return (
    !inputs.gen12NotOperating &&
    !inputs.greenLowPressure &&
    !inputs.yellowLowPressure &&
    !inputs.blueLowPressure &&
    inputs.eng1PumpPbAuto &&
    inputs.eng2PumpPbAuto &&
    !inputs.leftTankPumps1And2LoPr &&
    !inputs.rightTankPumps1And2LoPr
  );
}
