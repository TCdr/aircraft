// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A SURV system number (SYS 1 or SYS 2), 0 when none is known */
export type SurvSystemNumber = 0 | 1 | 2;

/**
 * Whether the XPDR of the selected XPDR/TCAS system is failed: the XPDR label of the SURV CONTROLS page is amber then.
 * @param transponderSystem L:A32NX_TRANSPONDER_SYSTEM: 0 = SYS 1, 1 = SYS 2
 * @param xpdr1Failed L:A32NX_XPDR_1_FAILED
 * @param xpdr2Failed L:A32NX_XPDR_2_FAILED
 * @returns true when the XPDR in use is failed
 */
export function selectedTransponderFailed(
  transponderSystem: number,
  xpdr1Failed: boolean,
  xpdr2Failed: boolean,
): boolean {
  return transponderSystem === 1 ? xpdr2Failed : xpdr1Failed;
}

/**
 * The failed state of the three WXR functions of one SURV system on the STATUS & SWITCHING page (WX DISPLAY, TURB
 * and PRED W/S each show as failed on that SURV system).
 * The TURB and PWS functions are made by the radar of that system: the sim has no failure of its own for them, so they
 * fail with the WXR of the system (L:A32NX_WXR_n_FAILED: AESU reset or unpowered).
 * @param wxrSystemFailed L:A32NX_WXR_n_FAILED of the system
 * @returns the failed state of WX DISPLAY, TURB and PRED W/S
 */
export function wxrFunctionsFailed(wxrSystemFailed: boolean): { wxDisplay: boolean; turb: boolean; predWs: boolean } {
  return { wxDisplay: wxrSystemFailed, turb: wxrSystemFailed, predWs: wxrSystemFailed };
}

/**
 * The SURV system that provides the TAWS functions (L:A32NX_TAWS_SYS_IN_USE, systems host EfisTawsBridge), the
 * selected WXR/TAWS system when it is not written yet.
 * @param wxrTawsSelected L:A32NX_WXR_TAWS_SYS_SELECTED
 * @param tawsSystemInUse L:A32NX_TAWS_SYS_IN_USE
 * @returns the TAWS system in use
 */
export function tawsSystem(wxrTawsSelected: number, tawsSystemInUse: number): SurvSystemNumber {
  if (tawsSystemInUse === 1 || tawsSystemInUse === 2) {
    return tawsSystemInUse;
  }
  return wxrTawsSelected === 1 || wxrTawsSelected === 2 ? wxrTawsSelected : 0;
}

/**
 * The TAWS 1(2) IN USE indication of the STATUS & SWITCHING page: in abnormal operation the TAWS and the WXR
 * functions do not come from the same SYS; the selected SYS provides the WXR, the other SYS the TAWS.
 * @param wxrTawsSelected L:A32NX_WXR_TAWS_SYS_SELECTED (the system of the WXR)
 * @param tawsSystemInUse L:A32NX_TAWS_SYS_IN_USE
 * @returns "TAWS n IN USE", or null when both functions come from the same system
 */
export function tawsInUseText(wxrTawsSelected: number, tawsSystemInUse: number): string | null {
  const taws = tawsSystem(wxrTawsSelected, tawsSystemInUse);
  return taws !== 0 && taws !== wxrTawsSelected ? `TAWS ${taws} IN USE` : null;
}
