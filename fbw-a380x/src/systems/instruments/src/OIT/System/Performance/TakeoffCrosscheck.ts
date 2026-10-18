// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TakeoffResults } from './TakeoffPerformance';

/*
 * XCHECK WITH AVNCS of T.O PERF: the takeoff speeds, the flaps, the TOW, the thrust (FLEX temperature) and the QNH of
 * the T.O PERF results are compared with the FMS T.O page, the SD gross weight and the EFIS QNH of the captain. The
 * OIS only reads the avionics: nothing goes from the OIS into the FMS. RWY, A-ICE, AIR COND and OAT are not checked.
 */

/** The thrust selection of the FMS T.O page */
export type FmsTakeoffThrust = 'TOGA' | 'FLEX' | 'DERATED';

/** The FMS T.O page entries; null when not entered */
export interface FmsTakeoffEntries {
  readonly v1: number | null;
  readonly vr: number | null;
  readonly v2: number | null;
  /** 1 = 1+F, 2, 3 */
  readonly flaps: number | null;
  readonly thrust: FmsTakeoffThrust | null;
  /** The FLEX temperature in °C */
  readonly flexTemperature: number | null;
}

/** The other avionics values of the crosscheck */
export interface AvionicsCrosscheckData {
  /** The gross weight of the SD, kg, null when not available */
  readonly grossWeight: number | null;
  /** The barometric reference of the captain is QNH (neither STD nor QFE) */
  readonly captainBaroIsQnh: boolean;
  /** The baro setting of the captain's EFIS control panel, hPa */
  readonly captainQnh: number | null;
}

export type CrosscheckItem = 'V1' | 'VR' | 'V2' | 'FLAPS' | 'TOW' | 'THRUST' | 'QNH';

export type ThrustCrosscheckMessage =
  | 'Caution: No XCHECK with AVNCS for: THRUST'
  | 'AVNCS/OIS discrepancy: crosscheck THRUST';

export interface TakeoffCrosscheck {
  /** The items with a discrepancy, shown in amber */
  readonly discrepancies: CrosscheckItem[];
  /** The popup title */
  readonly title: 'AVNCS/OIS: no Discrepancy' | 'AVNCS/OIS: Discrepancies';
  /** The thrust message of the popup, if any */
  readonly thrustMessage: ThrustCrosscheckMessage | null;
}

/** The TOW crosscheck passes when 0.99 TOW <= GW <= 1.0035 TOW */
const TOW_LOWER_FACTOR = 0.99;
const TOW_UPPER_FACTOR = 1.0035;

/** The QNH crosscheck passes within ±0.99 hPa (with a margin for the floating point rounding of the difference) */
const QNH_TOLERANCE_HPA = 0.99 + 1e-9;

/** The FLEX crosscheck passes when TFLEX - 5 °C <= FMS FLEX <= TFLEX */
const FLEX_TOLERANCE = 5;

/**
 * XCHECK WITH AVNCS is active only when the TOW does not exceed MTOW(perf).
 * @param results the T.O PERF results, or null
 * @returns whether the crosscheck can be run
 */
export function takeoffCrosscheckAvailable(results: TakeoffResults | null): boolean {
  return (
    results !== null &&
    results.mtowPerf !== null &&
    results.mtowPerf >= results.tow &&
    results.v1 !== null &&
    results.vr !== null &&
    results.v2 !== null
  );
}

/**
 * The thrust crosscheck: FLEX against FLEX compares the temperatures; TOGA or a derate in T.O PERF against TOGA or
 * DERATED in the FMS cannot be crosschecked (caution); FLEX on one side only is a discrepancy.
 * @param results the T.O PERF results
 * @param fms the FMS T.O page
 * @returns whether the thrust is a discrepancy, and the popup message
 */
export function thrustCrosscheck(
  results: TakeoffResults,
  fms: FmsTakeoffEntries,
): { discrepancy: boolean; message: ThrustCrosscheckMessage | null } {
  const discrepancy = { discrepancy: true, message: 'AVNCS/OIS discrepancy: crosscheck THRUST' as const };
  const oisFlex = results.thrust.kind === 'FLEX';
  const fmsFlex = fms.thrust === 'FLEX';
  if (oisFlex && fmsFlex) {
    const tflex = (results.thrust as { temperature: number }).temperature;
    const flex = fms.flexTemperature;
    return flex !== null && flex >= tflex - FLEX_TOLERANCE && flex <= tflex
      ? { discrepancy: false, message: null }
      : discrepancy;
  }
  if (oisFlex || fmsFlex || fms.thrust === null) {
    return discrepancy;
  }
  return { discrepancy: false, message: 'Caution: No XCHECK with AVNCS for: THRUST' };
}

/**
 * Runs XCHECK WITH AVNCS.
 * @param results the T.O PERF results (with speeds, see takeoffCrosscheckAvailable)
 * @param fms the FMS T.O page
 * @param avionics the SD gross weight and the captain's QNH
 * @returns the discrepancies and the popup messages
 */
export function crosscheckTakeoff(
  results: TakeoffResults,
  fms: FmsTakeoffEntries,
  avionics: AvionicsCrosscheckData,
): TakeoffCrosscheck {
  const discrepancies: CrosscheckItem[] = [];
  // The calculator gives a single V1 (no V1 range): the FMS V1 must be equal
  if (fms.v1 === null || fms.v1 !== results.v1) {
    discrepancies.push('V1');
  }
  if (fms.vr === null || fms.vr !== results.vr) {
    discrepancies.push('VR');
  }
  if (fms.v2 === null || fms.v2 !== results.v2) {
    discrepancies.push('V2');
  }
  if (fms.flaps === null || fms.flaps !== results.flaps) {
    discrepancies.push('FLAPS');
  }
  const gw = avionics.grossWeight;
  if (gw === null || gw < TOW_LOWER_FACTOR * results.tow || gw > TOW_UPPER_FACTOR * results.tow) {
    discrepancies.push('TOW');
  }
  const thrust = thrustCrosscheck(results, fms);
  if (thrust.discrepancy) {
    discrepancies.push('THRUST');
  }
  if (
    avionics.captainBaroIsQnh &&
    (avionics.captainQnh === null || Math.abs(avionics.captainQnh - results.qnh) > QNH_TOLERANCE_HPA)
  ) {
    discrepancies.push('QNH');
  }
  return {
    discrepancies,
    title: discrepancies.length === 0 ? 'AVNCS/OIS: no Discrepancy' : 'AVNCS/OIS: Discrepancies',
    thrustMessage: thrust.message,
  };
}

/**
 * The FMS T.O page values as the FMS publishes them for the PFD and the FADECs: the speeds (0 or below when not
 * entered), the FLEX temperature (0 for no FLEX, 0.1 for a FLEX of 0 °C).
 * @param v1 L:AIRLINER_V1_SPEED
 * @param vr L:AIRLINER_VR_SPEED
 * @param v2 L:AIRLINER_V2_SPEED
 * @param flexLvar L:A32NX_AIRLINER_TO_FLEX_TEMP
 * @param flaps the T.O flaps of the FMS, or null
 * @param thrust the T.O thrust selection of the FMS, or null
 * @returns the FMS T.O page entries
 */
export function fmsTakeoffEntries(
  v1: number,
  vr: number,
  v2: number,
  flexLvar: number,
  flaps: number | null,
  thrust: FmsTakeoffThrust | null,
): FmsTakeoffEntries {
  const speed = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : null);
  return {
    v1: speed(v1),
    vr: speed(vr),
    v2: speed(v2),
    flaps,
    thrust,
    flexTemperature: thrust === 'FLEX' && flexLvar !== 0 ? Math.round(flexLvar) : null,
  };
}
