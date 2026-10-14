// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The BKUP CTL ACTIVE indication of the SD F/CTL page.
 * - A380 FCOM DSC-27-10-20 F/CTL page (a380_fcom.txt l.55643-55645): "BKUP CTL ACTIVE INDICATION - Backup control is
 *   active."
 * - A380 FCOM DSC-27-10-40 Backup Control (l.56376-56391): "In the unlikely event of the loss of all flight control
 *   computers (PRIMs and SECs), the backup control [...] The BCM [...] starts to operate when all flight control
 *   computers are lost."
 * This is the condition the FWS uses too (FwsCore allPrimAndSecFailed).
 * @param primsHealthy the PRIM 1 to 3 healthy states (L:A32NX_PRIM_n_HEALTHY, 1 when healthy)
 * @param secsHealthy the SEC 1 to 3 healthy states (L:A32NX_SEC_n_HEALTHY, 1 when healthy)
 * @returns true when the backup control is active
 */
export function isBackupControlActive(
  primsHealthy: readonly (boolean | number)[],
  secsHealthy: readonly (boolean | number)[],
): boolean {
  // SimVar Bool reads give 1 or 0: compare with 0 rather than relying on a strict true
  return [...primsHealthy, ...secsHealthy].every((healthy) => !(Number(healthy) > 0));
}
