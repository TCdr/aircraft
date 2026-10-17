// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AUTO FLT APPROACH CAPABILITY DOWNGRADED. Its triggers are PRIM monitorings: flight control gyrometers and
 * vertical accelerometers, AOA, sideslip and IRS voting discrepancies that do not trigger their own NAV alert, the RA B
 * failed, a PFD that cannot show the radio altitude or the ILS (GLS) deviations. The sim has no gyrometer,
 * accelerometer, sideslip or PFD display monitoring, and no voting threshold is known: only the RA B failure is
 * simulated.
 */

/**
 * The RA B is failed. With a second RA failed, NAV RA SYS A+B (B+C) (A+B+C) FAULT already lists the lost approach
 * capability (CAT 3, CAT 2 ONLY), so this alert is not triggered then.
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
