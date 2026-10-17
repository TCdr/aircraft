// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isTyrePressureAbnormal, NominalTyrePressures, TYRES } from '@shared/TyrePressures';

/*
 * WHEEL TYRE LO PR of the A32NX FWC, from the TPIS pressures and the low pressure rule of shared/TyrePressures (the
 * same rule turns the WHEEL page pressures amber).
 * - Crew awareness only: no procedure line, no STATUS.
 * - Level 2: amber caution, single chime, MASTER CAUT, WHEEL SD page.
 * - Inhibited in flight phases 3, 4, 5 and 8.
 * - Only with the TPIS installed (flyPad aircraft option).
 */

export const WHEEL_TYRE_LO_PR_PHASE_INHIBITION = [3, 4, 5, 8];

/** The caution level of WHEEL TYRE LO PR (PseudoFWC `failure`) */
export const WHEEL_TYRE_LO_PR_LEVEL = 2;

/** The E/WD code of WHEEL TYRE LO PR (EwdMessages): the title only */
export const WHEEL_TYRE_LO_PR_CODES = ['320049001'];

export interface TyrePressureAlertInputs {
  /** The flyPad option: the aircraft has the TPIS */
  tpisInstalled: boolean;
  /** The TPIS pressures in the order of shared/TyrePressures TYRES, null when the data is not valid */
  pressuresPsi: readonly (number | null)[];
  nominal: NominalTyrePressures;
  /** The FWC flight phase (1 to 10) */
  fwcFlightPhase: number;
}

/**
 * @returns whether WHEEL TYRE LO PR is triggered (before the flight phase inhibition of PseudoFWC)
 */
export function isWheelTyreLoPr(inputs: TyrePressureAlertInputs): boolean {
  if (!inputs.tpisInstalled) {
    return false;
  }
  return TYRES.some((tyre) => isTyrePressureAbnormal(inputs.pressuresPsi, inputs.nominal, tyre, inputs.fwcFlightPhase));
}
