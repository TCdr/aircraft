// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Failure states of the sources and converters on the ELEC AC and ELEC DC SD pages.
 */

/**
 * GEN 1(2)(3)(4) indication: amber when the engine generator is off or failed, or its engine is not running.
 * The generator counts as failed when its drive is disconnected or its output is out of the normal
 * voltage or frequency band its GCU monitors (L:A32NX_ELEC_ENG_GEN_n_POTENTIAL_NORMAL, _FREQUENCY_NORMAL).
 * @param genPbOn GEN pb-sw ON
 * @param engineRunning the engine runs
 * @param driveConnected the generator drive is connected (L:A32NX_ELEC_ENG_GEN_n_IDG_IS_CONNECTED)
 * @param potentialNormal the output voltage is normal
 * @param frequencyNormal the output frequency is normal
 * @returns whether the GEN label is amber
 */
export function isEngineGeneratorIndicationAmber(
  genPbOn: boolean,
  engineRunning: boolean,
  driveConnected: boolean,
  potentialNormal: boolean,
  frequencyNormal: boolean,
): boolean {
  const failed = !driveConnected || !potentialNormal || !frequencyNormal;
  return !genPbOn || !engineRunning || failed;
}

/**
 * TR 1(2)(APU)(ESS) on the ELEC AC page: amber when the TR is failed or not powered. Design choice: a powered TR is
 * failed when its output voltage is not normal (L:A32NX_ELEC_TR_n_POTENTIAL_NORMAL).
 * @param acBusPowered the AC busbar that supplies the TR is powered
 * @param trPotentialNormal the TR output voltage is normal
 * @returns whether the TR indication is amber
 */
export function isTransformerRectifierIndicationAmber(acBusPowered: boolean, trPotentialNormal: boolean): boolean {
  return !acBusPowered || !trPotentialNormal;
}

/**
 * STAT INV on the ELEC AC and ELEC DC pages: the static inverter is failed.
 * The same rule as ELEC STATIC INV FAULT of the FWS (isStaticInverterFault): the inverter only
 * runs while its contactor 7XB is closed, so it counts as failed when the contactor is closed but its output is not
 * normal; with the contactor open nothing tells whether it works.
 * @param contactor7XbClosed the static inverter contactor 7XB is closed
 * @param staticInverterPotentialNormal the inverter output voltage is normal
 * @returns whether the static inverter is failed
 */
export function isStaticInverterFailed(contactor7XbClosed: boolean, staticInverterPotentialNormal: boolean): boolean {
  return contactor7XbClosed && !staticInverterPotentialNormal;
}

/**
 * RAT indication on the ELEC AC page: amber when the RAT is failed. The Rust electrical system writes
 * L:A32NX_ELEC_RAT_FAULT (ELEC RAT FAULT).
 * @param ratFault the RAT generator fault
 * @returns whether the RAT indication is amber
 */
export function isRatIndicationAmber(ratFault: boolean): boolean {
  return ratFault;
}
