// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * STATUS of HYD G(Y) ENG 1(2)(3)(4) PMP A(B) PRESS LO (A380 FCOM PRO-ABN-ECAM-10-29, a380_fcom.txt l.155077-155091):
 * INOP SYS ALL PHASES "G (Y) ENG 1 or 2 (3 or 4) PMP A or B (If at least two pumps are failed:)" (l.155081-155082), and
 * MORE INFO REDUND LOSS "If only one pump is failed: G (Y) ENG 1 or 2 (3 or 4) PMP A or B" (l.155090-155091).
 * Design choice: the pumps are counted per hydraulic system (the 4 engine pumps of the green, or of the yellow, system),
 * as the alert names them; with the whole system lost (HYD G (Y) SYS PRESS LO, INOP SYS G (Y) HYD SYS) the system line
 * replaces the pump lines.
 */

export interface EnginePumpStatus {
  /** INOP SYS, per pump in the order ENG 1(3) PMP A, 1(3) B, 2(4) A, 2(4) B */
  readonly inopSys: boolean[];
  /** REDUND LOSS, per pump in the same order */
  readonly redundLoss: boolean[];
}

/**
 * @param pumpPressLo the PRESS LO alert condition of the 4 engine pumps of one system (1A, 1B, 2A, 2B or 3A, 3B, 4A, 4B)
 * @param hydSysInop the whole hydraulic system is lost (INOP SYS G (Y) HYD SYS)
 * @returns the INOP SYS and REDUND LOSS lines of the pumps of that system
 */
export function enginePumpPressLoStatus(pumpPressLo: readonly boolean[], hydSysInop: boolean): EnginePumpStatus {
  const failedPumps = pumpPressLo.filter((failed) => failed).length;
  return {
    inopSys: pumpPressLo.map((failed) => failed && !hydSysInop && failedPumps >= 2),
    redundLoss: pumpPressLo.map((failed) => failed && !hydSysInop && failedPumps === 1),
  };
}
