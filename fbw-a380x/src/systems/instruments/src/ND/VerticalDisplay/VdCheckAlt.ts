// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/**
 * CHECK ALT on the VD (amber): the CDS finds the CAPT and F/O altitudes more than 250 ft apart with QNH, or 500 ft with
 * STD, both sides on the same barometric reference. It flashes 9 s, then stays steady. Design choice: no confirm time,
 * none is documented.
 */

const CHECK_ALT_QNH_FT = 250;
const CHECK_ALT_STD_FT = 500;

/** The altitude one side displays */
export interface VdSideAltitude {
  /** STD selected on the EFIS CP of that side, null without a valid EFIS CP word */
  baroStd: boolean | null;
  /** pressure altitude with STD, baro corrected altitude with QNH; null when not valid */
  altitudeFt: number | null;
}

/** Position of the AIR DATA switching knob (L:A32NX_AIR_DATA_SWITCHING_KNOB) giving ADR 3 to the CAPT side */
const AIR_DATA_KNOB_CAPT_ON_3 = 0;
/** Position of the AIR DATA switching knob giving ADR 3 to the F/O side */
const AIR_DATA_KNOB_FO_ON_3 = 2;

/**
 * @param capt the CAPT side
 * @param fo the F/O side
 * @returns whether the VD shows CHECK ALT
 */
export function isVdCheckAltShown(capt: VdSideAltitude, fo: VdSideAltitude): boolean {
  if (capt.altitudeFt === null || fo.altitudeFt === null || capt.baroStd === null || capt.baroStd !== fo.baroStd) {
    return false;
  }
  return Math.abs(capt.altitudeFt - fo.altitudeFt) > (capt.baroStd ? CHECK_ALT_STD_FT : CHECK_ALT_QNH_FT);
}

/**
 * Reads the altitude a side displays: from ADR 1 (CAPT) or 2 (F/O), or 3 when the AIR DATA switching selects it, with
 * that side's barometric setting (the ADR corrects BARO_CORRECTED_ALTITUDE_1 with the CAPT one, _2 with the F/O one).
 * @param captSide true for the CAPT side
 * @param readWord reads an ARINC 429 L:var
 * @param airDataKnob the AIR DATA switching knob position
 * @returns the altitude of that side
 */
export function readVdSideAltitude(
  captSide: boolean,
  readWord: (name: string) => Arinc429WordData,
  airDataKnob: number,
): VdSideAltitude {
  const adr = captSide
    ? airDataKnob === AIR_DATA_KNOB_CAPT_ON_3
      ? 3
      : 1
    : airDataKnob === AIR_DATA_KNOB_FO_ON_3
      ? 3
      : 2;
  const baroStd = readWord(`L:A32NX_FCU_EFIS_${captSide ? 'L' : 'R'}_DISCRETE_WORD_2`).bitValueOr(11, null);
  const altitude = readWord(
    baroStd === false
      ? `L:A32NX_ADIRS_ADR_${adr}_BARO_CORRECTED_ALTITUDE_${captSide ? 1 : 2}`
      : `L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`,
  );
  return { baroStd, altitudeFt: altitude.valueOr(null) };
}
