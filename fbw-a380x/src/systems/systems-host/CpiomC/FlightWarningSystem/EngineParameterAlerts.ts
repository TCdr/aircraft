// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  egtAlertLimit,
  egtExceedanceShown,
  n1Exceeds,
  n3Exceeds,
} from '../../../instruments/src/EWD/elements/EgtLimits';

/*
 * ENG 1(2)(3)(4) STALL, EGT OVER LIMIT and N1/N2 OVER LIMIT. Indications and flight phase inhibition:
 * - EGT OVER LIMIT: single chime, MASTER CAUT (amber), no SD page, inhibited in phases 4, 5 and 6.
 * - N1/N2 OVER LIMIT: CRC, MASTER WARN (red), no SD page, inhibited in phases 5 and 6.
 * - STALL: single chime, MASTER CAUT, ENGINE SD page, inhibited in phases 5 and 6; also inhibited during the takeoff
 *   from V1 to 400 ft unless two or more engines are affected.
 * FBW models the Trent 972: the published N2 (GP7270 HP rotor) is the FBW N3, as for ENG FAIL (EngineFailAlerts.ts).
 */

/** The flight phases of the takeoff from V1 to 400 ft (FwcFlightPhase AtOrAboveV1 and LiftOff) */
const V1_TO_400_FT_PHASES = [5, 6];

/** ENG STALL: the stall of one engine is inhibited from V1 to 400 ft, unless two or more engines stall */
export function isStallAlertShown(engineStalled: boolean, stalledEngineCount: number, flightPhase: number): boolean {
  if (!engineStalled) {
    return false;
  }
  return !V1_TO_400_FT_PHASES.includes(flightPhase) || stalledEngineCount >= 2;
}

export interface EngineOverLimitInputs {
  /** The EGT shown on the EWD (EgtLimits displayedEgt) */
  displayedEgtDegrees: number;
  n1Percent: number;
  n3Percent: number;
  /** The FADEC thrust limit type (L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE) */
  thrustLimitType: number;
  alphaFloor: boolean;
}

/**
 * ENG EGT OVER LIMIT: the EGT is above the red line during takeoff and go-around, with the thrust
 * reversers selected or in alpha floor, or above the EGT limit when the thrust lever is at or below MCT. The limits are
 * those of the EWD gauge (EgtLimits.ts).
 */
export function isEgtOverLimit(inputs: EngineOverLimitInputs): boolean {
  return egtExceedanceShown(inputs.displayedEgtDegrees, egtAlertLimit(inputs.thrustLimitType, inputs.alphaFloor));
}

/**
 * ENG EGT OVER LIMIT with ENG n FADEC FAULT: the EGT is still displayed, but the alert does not trigger on an EGT
 * exceedance. The oil pressure, N1 and N2 alerts still trigger. The EWD gauge and its amber attention box keep the
 * exceedance (FwsCore primary abnormal).
 */
export function isEgtOverLimitAlertTriggered(egtOverLimit: boolean, fadecFault: boolean): boolean {
  return egtOverLimit && !fadecFault;
}

/** ENG N1/N2 OVER LIMIT: N1 or N3 above its red limit (EgtLimits.ts) */
export function isN1N2OverLimit(inputs: EngineOverLimitInputs): boolean {
  return n1Exceeds(inputs.n1Percent) || n3Exceeds(inputs.n3Percent);
}

/**
 * The items of ENG n STALL (ata70.ts 701800113-701800116): THR LEVER IDLE, ENG PARAMETERS CHECK, IF ABNORMAL:
 * ENG MASTER OFF, ENG RELIGHT PROC CONSIDER. All are shown; the THR LEVER and ENG MASTER items are sensed.
 */
export const ENG_STALL_ITEMS_SHOWN = [true, true, true, true, true];

/**
 * The items of ENG n EGT OVER LIMIT (701800009-701800012) and of ENG n N1/N2 OVER LIMIT (701800073-701800076):
 * THR LEVER REDUCE BELOW (EGT / N1) LIMIT, IF OVER LIMIT PERSISTS: ENG MASTER OFF.
 */
export const ENG_OVER_LIMIT_ITEMS_SHOWN = [true, true, true];
