// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The S and F legends, the slat and flap position indications and the S (F) LOCKED legend of the E/WD:
 * - S and F: white, amber when both relevant hydraulic systems fail (unless on ground with both engines stopped), when
 *   the wingtip brakes are on, or with a slats (flaps) fault.
 * - S (F) LOCKED: amber, with an ECAM caution, when the wingtip brakes are applied or two flaps are not aligned.
 * - The slat (flap) position: green, amber on the same conditions as S and F.
 * The slats use the green and blue hydraulic systems, the flaps the yellow and green ones.
 *
 * Design choices:
 * - The wingtip brakes are the WTB engaged bits of the SFCC status word (15 slats, 16 flaps). The SFCC model has no
 *   wingtip brakes yet and sends them false: S (F) LOCKED shows once a WTB model sets them. Not simulated: the flap
 *   non-alignment detection.
 * - "A slats (flaps) fault" is the loss of the slat (flap) control: the channel fault bit (11 slats, 12 flaps) in both
 *   SFCCs, or one SFCC failed and the other with the fault bit. A single channel failure (SLAT/FLAP SYS 1(2) FAULT)
 *   only slows the surfaces down.
 * - An invalid status word (both SFCCs lost) shows the indications amber.
 * - "Both engines stopped": neither FADEC engine state is ON (L:A32NX_ENGINE_STATE), a starting engine is not running.
 */
export interface SlatFlapIndicationInputs {
  /** The status word in use is not valid (L:A32NX_SFCC_n_SLAT_FLAP_SYSTEM_STATUS_WORD failure warning) */
  sfccInvalid: boolean;
  /** The WTB engaged bit of the status word in use */
  wingtipBrakesOn: boolean;
  /** No SFCC controls the surfaces any more (fault bit or invalid word in both SFCCs) */
  controlLost: boolean;
  /** Both relevant hydraulic systems have no pressure (system section pressure switches) */
  bothHydraulicSystemsLost: boolean;
  /** The aircraft is on ground with both engines stopped */
  onGroundEnginesStopped: boolean;
}

export interface SlatFlapIndication {
  /** The S (F) legend and the slat (flap) position in amber */
  amber: boolean;
  /** The amber S (F) LOCKED legend */
  locked: boolean;
}

export function slatFlapIndication(inputs: SlatFlapIndicationInputs): SlatFlapIndication {
  const hydraulicLoss = inputs.bothHydraulicSystemsLost && !inputs.onGroundEnginesStopped;
  const wingtipBrakesOn = !inputs.sfccInvalid && inputs.wingtipBrakesOn;
  return {
    amber: inputs.sfccInvalid || wingtipBrakesOn || inputs.controlLost || hydraulicLoss,
    locked: wingtipBrakesOn,
  };
}

/** Bits of the SFCC slat/flap system status word (label 046, A32NXSfccBusPublisher) */
export const SFCC_STATUS_SLAT_FAULT_BIT = 11;
export const SFCC_STATUS_FLAP_FAULT_BIT = 12;
export const SFCC_STATUS_SLAT_WTB_ENGAGED_BIT = 15;
export const SFCC_STATUS_FLAP_WTB_ENGAGED_BIT = 16;

/**
 * Whether no SFCC controls the slats (flaps) any more
 * @param sfcc1Faulty SFCC 1 status word invalid, or its slat (flap) fault bit set
 * @param sfcc2Faulty the same for SFCC 2
 */
export function isSlatFlapControlLost(sfcc1Faulty: boolean, sfcc2Faulty: boolean): boolean {
  return sfcc1Faulty && sfcc2Faulty;
}
