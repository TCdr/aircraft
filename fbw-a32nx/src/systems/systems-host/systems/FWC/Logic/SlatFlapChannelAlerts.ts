// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StatusLines } from './CondStatus';
import { FlightControlStatusCodes } from './FlightControlStatus';

/*
 * The A320 slat and flap channel cautions, from the SFCC slat/flap system status words (label 046,
 * L:A32NX_SFCC_n_SLAT_FLAP_SYSTEM_STATUS_WORD, a320_systems hydraulic/sfcc):
 * - F/CTL FLAP SYS 1(2) FAULT: failure of the flap channel in one SFCC (bit 12)
 * - F/CTL SLAT SYS 1(2) FAULT: failure of the slat channel in one SFCC (bit 11)
 * Both are crew awareness cautions (level 1), inhibited in phases 3, 4, 5, 7 and 8.
 *
 * A powered-off SFCC sends no status word: that is not a channel failure for these alerts (its loss is covered by the
 * ELEC bus alerts, whose STATUS already lists SLATS/FLAPS SLOW and the SFCC in INOP SYS).
 *
 * Not modelled: F/CTL FLAPS (SLATS) FAULT/LOCKED: no triggering condition nor phase inhibition is documented for it,
 * and the model has no wing tip brakes; F/CTL SLAT(FLAP) TIP BRK FAULT and F/CTL FLAP ATTACH SENSOR: the model has no
 * tip brake nor attachment sensor.
 * With both channels of a surface failed, both SYS 1 and SYS 2 FAULT show.
 */

/** The flight phase inhibition of FLAP SYS 1(2) FAULT and SLAT SYS 1(2) FAULT */
export const SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** The bits of the SFCC slat/flap system status word (label 046, fbw-a32nx/docs/a320-simvars.md) */
const SfccStatusBits = {
  slatFault: 11,
  flapFault: 12,
};

/** One SFCC slat/flap system status word as the FWC reads it (Arinc429Word) */
export interface SfccStatusWord {
  /** The bit when the word is valid (normal operation or functional test), else the given value */
  bitValueOr(bit: number, valueIfInvalid: boolean): boolean;
}

export interface SlatFlapChannelFaults {
  /** F/CTL FLAP SYS 1 FAULT, F/CTL FLAP SYS 2 FAULT */
  flapSysFault: [boolean, boolean];
  /** F/CTL SLAT SYS 1 FAULT, F/CTL SLAT SYS 2 FAULT */
  slatSysFault: [boolean, boolean];
}

/**
 * The slat and flap channel faults reported by the two SFCCs.
 * @param sfcc1 the status word of SFCC 1
 * @param sfcc2 the status word of SFCC 2
 * @returns the active FLAP SYS and SLAT SYS faults
 */
export function slatFlapChannelFaults(sfcc1: SfccStatusWord, sfcc2: SfccStatusWord): SlatFlapChannelFaults {
  return {
    flapSysFault: [
      sfcc1.bitValueOr(SfccStatusBits.flapFault, false),
      sfcc2.bitValueOr(SfccStatusBits.flapFault, false),
    ],
    slatSysFault: [
      sfcc1.bitValueOr(SfccStatusBits.slatFault, false),
      sfcc2.bitValueOr(SfccStatusBits.slatFault, false),
    ],
  };
}

/** The STATUS codes of these cautions (StatusMessages) */
const SlatFlapChannelStatusCodes = {
  /** "GPWS FLAP MODE......OFF", F/CTL limitation (27 04) */
  gpwsFlapModeOff: '270400012',
  /** ENG 1(2) APPR IDLE ONLY, the ELEC STATUS lines (StatusMessages 24 02) */
  engApprIdleOnly: ['240200103', '240200104'],
  /** FLAPS SLOW, the HYD STATUS line */
  flapsSlow: '290200005',
  /** SLATS SLOW, the HYD STATUS line */
  slatsSlow: '290200004',
};

/**
 * F/CTL FLAP SYS 1(2) FAULT STATUS: APPR PROC GPWS FLAP MODE OFF for FLAP SYS 1 FAULT (the flap position signal
 * to the GPWS is lost), ENG 1(2) APPR IDLE ONLY, FLAPS SLOW.
 * No INOP SYS.
 * @param sfcc the SFCC whose flap channel failed, 1 or 2
 * @returns the STATUS codes
 */
export function flapSysFaultStatus(sfcc: 1 | 2): StatusLines {
  return {
    left: [
      ...(sfcc === 1 ? [FlightControlStatusCodes.apprProc, SlatFlapChannelStatusCodes.gpwsFlapModeOff] : []),
      SlatFlapChannelStatusCodes.engApprIdleOnly[sfcc - 1],
      SlatFlapChannelStatusCodes.flapsSlow,
    ],
    inopSys: [],
  };
}

/**
 * F/CTL SLAT SYS 1(2) FAULT STATUS: SLATS SLOW. No INOP SYS.
 * @returns the STATUS codes
 */
export function slatSysFaultStatus(): StatusLines {
  return { left: [SlatFlapChannelStatusCodes.slatsSlow], inopSys: [] };
}
