// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { BuffetAlert, BuffetInputs, BuffetResult } from './buffet';

/**
 * The live inputs of the Performance > Buffet page and the choice of its banner. Pure functions: the page reads the
 * variables and passes them here.
 */

/** A value of an ARINC 429 word: its value and whether its SSM is normal operation */
export interface BuffetWordReading {
  value: number;
  normal: boolean;
}

/** The variables the page reads, once per second */
export interface BuffetLiveReadings {
  /** L:A32NX_FM_GROSS_WEIGHT, tonnes, 0 when the FMS has none */
  fmsGrossWeight: number;
  /** L:A32NX_AIRFRAME_GW, kg (the weight and balance of the flyPad load) */
  airframeGrossWeight: number;
  /** L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC */
  cg: number;
  /** L:A32NX_ADIRS_ADR_1_ALTITUDE (pressure altitude, ft) */
  adrAltitude: BuffetWordReading;
  /** PRESSURE ALTITUDE of the sim, ft */
  simPressureAltitude: number;
  /** L:A32NX_ADIRS_ADR_1_MACH */
  adrMach: BuffetWordReading;
  /** AIRSPEED MACH of the sim */
  simMach: number;
  /** L:A32NX_ADIRS_IR_1_ROLL, degrees */
  irRoll: BuffetWordReading;
  /** PLANE BANK DEGREES of the sim */
  simBank: number;
}

/** Where a live value comes from, shown as a tag next to it */
export type BuffetSource = 'FMS GW' | 'W&B' | 'ADR 1' | 'IR 1' | 'SIM';

export interface BuffetLiveInputs extends BuffetInputs {
  sources: { weight: BuffetSource; cg: BuffetSource; altitude: BuffetSource; mach: BuffetSource; bank: BuffetSource };
}

/**
 * The live inputs: the FMS gross weight when it has one (the weight of the FMS REC MAX), else the weight and balance;
 * ADR 1 / IR 1 when their words are normal, else the sim value ("Design choice": the flyPad has no ADIRS link in the
 * real aircraft; ADR 1 and IR 1 are the CAPT side sources)
 */
export function liveBuffetInputs(readings: BuffetLiveReadings): BuffetLiveInputs {
  const fmsWeight = readings.fmsGrossWeight > 0;
  return {
    weightTonnes: fmsWeight ? readings.fmsGrossWeight : readings.airframeGrossWeight / 1000,
    cg: readings.cg,
    pressureAltitude: readings.adrAltitude.normal ? readings.adrAltitude.value : readings.simPressureAltitude,
    mach: readings.adrMach.normal ? readings.adrMach.value : readings.simMach,
    bank: Math.abs(readings.irRoll.normal ? readings.irRoll.value : readings.simBank),
    sources: {
      weight: fmsWeight ? 'FMS GW' : 'W&B',
      cg: 'W&B',
      altitude: readings.adrAltitude.normal ? 'ADR 1' : 'SIM',
      mach: readings.adrMach.normal ? 'ADR 1' : 'SIM',
      bank: readings.irRoll.normal ? 'IR 1' : 'SIM',
    },
  };
}

/**
 * The bank from which the page shows the turn (bank line, margin in the turn): 3 degrees ("Design choice": below it the
 * turn needs less than 1.0014 g, the bank line would lie on the 1.0 g line and the live page would flicker between
 * the level and the turn results with a small roll)
 */
export const BUFFET_TURN_MIN_BANK = 3;

export function isBuffetTurn(bank: number): boolean {
  return Math.abs(bank) >= BUFFET_TURN_MIN_BANK;
}

/** The banner of the page, most severe first */
export type BuffetBanner = 'none' | 'noWeight' | 'outsideChart' | 'turn' | 'belowWarning' | 'belowCaution';

export function buffetBanner(inputs: BuffetInputs, result: BuffetResult | null): BuffetBanner {
  if (!(inputs.weightTonnes > 0)) {
    return 'noWeight';
  }
  if (result === null) {
    return 'outsideChart';
  }
  if (isBuffetTurn(inputs.bank) && result.turnMargin < 0) {
    return 'turn';
  }
  const alert: BuffetAlert = result.alert;
  if (alert === 'warning') {
    return 'belowWarning';
  }
  return alert === 'caution' ? 'belowCaution' : 'none';
}
