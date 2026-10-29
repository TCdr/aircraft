// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether a GPWS alert is active: the TCAS then goes to TA ONLY automatically. The A32NX EGPWC (fbw-common
 * surveillance/egpws) writes the GPWS warning (red) and alert (amber) lights; L:A32NX_GPWS_Warning_Active is written by
 * the A380X GPWS only.
 * @param read reads one L:var (SimVar.GetSimVarValue(name, 'bool') in the sim)
 * @returns true when the GPWS warning or alert light is on
 */
export function isGpwsAlertActive(read: (name: string) => number): boolean {
  return read('L:A32NX_GPWS_WARNING_LIGHT_ON') > 0 || read('L:A32NX_GPWS_ALERT_LIGHT_ON') > 0;
}
