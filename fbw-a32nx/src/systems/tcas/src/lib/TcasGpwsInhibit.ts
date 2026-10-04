// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether a GPWS alert is active, for the automatic TCAS inhibition. A320 FCOM DSC-34-SURV-60-10-10 TA ONLY MODE:
 * selected automatically if "GPWS alerts are triggered". The A32NX EGPWC (fbw-common surveillance/egpws) writes the
 * GPWS warning (red) and alert (amber) lights; the TCAS used to read L:A32NX_GPWS_Warning_Active, which only the A380X
 * GPWS writes.
 * @param read reads one L:var (SimVar.GetSimVarValue(name, 'bool') in the sim)
 * @returns true when the GPWS warning or alert light is on
 */
export function isGpwsAlertActive(read: (name: string) => number): boolean {
  return read('L:A32NX_GPWS_WARNING_LIGHT_ON') > 0 || read('L:A32NX_GPWS_ALERT_LIGHT_ON') > 0;
}
