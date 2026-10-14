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

/**
 * Whether a windshear or stall warning is active, for the automatic TCAS inhibition. A320 FCOM DSC-34-SURV-60-10-10 TA
 * ONLY MODE (a320_fcom.txt:56003-56004): selected automatically if "The windshear alert is triggered" or "The stall
 * warning is triggered". The windshear alert is the reactive windshear warning of the FACs (FacReactiveWindshear); the
 * stall warning is the FWC output that also drives the stall aural (PseudoFWC).
 * @param read reads one L:var (SimVar.GetSimVarValue(name, 'bool') in the sim)
 * @returns true when the windshear warning or the stall warning is on
 */
export function isWindshearOrStallWarningActive(read: (name: string) => number): boolean {
  return read('L:A32NX_REACTIVE_WINDSHEAR_WARNING') > 0 || read('L:A32NX_AUDIO_STALL_WARNING') > 0;
}
