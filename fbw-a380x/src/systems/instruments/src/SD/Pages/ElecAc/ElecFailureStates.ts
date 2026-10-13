// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Failure states of the sources and converters on the ELEC AC and ELEC DC SD pages (FCOM gap report 2026-10-10,
 * A380X ATA 24 row #34). Source: A380 FCOM DSC-24-20 CONTROLS AND INDICATORS (KAL fleet, 06 JUL 11); "l." = line of
 * references/manuals/a380_fcom.txt.
 */

/**
 * GEN 1(2)(3)(4) indication (l.51081-51085): amber when "The engine generator is off, failed, or the assigned engine is
 * not running." The generator counts as failed when its drive is disconnected or its output is out of the normal
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
 * TR 1(2)(APU)(ESS) on the ELEC AC page (l.51125-51128): amber when "The TR is failed, or is not powered." Design
 * choice: a powered TR is failed when its output voltage is not normal (L:A32NX_ELEC_TR_n_POTENTIAL_NORMAL).
 * @param acBusPowered the AC busbar that supplies the TR is powered
 * @param trPotentialNormal the TR output voltage is normal
 * @returns whether the TR indication is amber
 */
export function isTransformerRectifierIndicationAmber(acBusPowered: boolean, trPotentialNormal: boolean): boolean {
  return !acBusPowered || !trPotentialNormal;
}

/**
 * STAT INV on the ELEC AC page (l.50928-50931) and the ELEC DC page (l.51264-51267): "The static inverter is failed."
 * The same rule as ELEC STATIC INV FAULT of the FWS (FwsElecAlertsRound8.isStaticInverterFault): the inverter only
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
 * RAT indication on the ELEC AC page (DSC-24-20 RAT INDICATION, l.51143-51147): amber when "The RAT is failed." The
 * Rust electrical system writes L:A32NX_ELEC_RAT_FAULT (ELEC RAT FAULT).
 * @param ratFault the RAT generator fault
 * @returns whether the RAT indication is amber
 */
export function isRatIndicationAmber(ratFault: boolean): boolean {
  return ratFault;
}
