// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AUTO FLT APPROACH CAPABILITY DOWNGRADED (A380 FCOM PRO-ABN-ECAM-10-22-FG, a380_fcom.txt l.136343-136410).
 * Its triggers (l.136350-136372) are PRIM monitorings: flight control gyrometers and vertical accelerometers, AOA,
 * sideslip and IRS voting discrepancies that do not trigger their own NAV alert, the RA B failed, a PFD that cannot show
 * the radio altitude or the ILS (GLS) deviations. The sim has no gyrometer, accelerometer, sideslip or PFD display
 * monitoring, and the FCOM gives no voting threshold: only "The RA B is failed" (l.136370) is simulated.
 */

/**
 * "The RA B is failed" (a380_fcom.txt l.136370). With a second RA failed, NAV RA SYS A+B (B+C) (A+B+C) FAULT already
 * lists the lost approach capability (CAT 3, CAT 2 ONLY, l.165793-165797), so this alert is not triggered then.
 * @param raAFailed RA SYS A (L:A32NX_RA_1_RADIO_ALTITUDE) is failed
 * @param raBFailed RA SYS B (L:A32NX_RA_2_RADIO_ALTITUDE) is failed
 * @param raCFailed RA SYS C (L:A32NX_RA_3_RADIO_ALTITUDE) is failed
 * @returns whether the alert condition is true
 */
export function isApproachCapabilityDowngradedByRa(
  raAFailed: boolean,
  raBFailed: boolean,
  raCFailed: boolean,
): boolean {
  return raBFailed && !raAFailed && !raCFailed;
}
