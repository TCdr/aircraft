// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The state of the two SURV systems that the TAWS reconfiguration looks at */
export interface WxrTawsSystemsState {
  /** L:A32NX_WXR_TAWS_SYS_SELECTED: the WXR/TAWS system selected by the crew (1 or 2, anything else: none) */
  selected: number;
  /** The TAWS surveillance function (GPWS and TERR SYS) of SYS 1 is failed */
  taws1Failed: boolean;
  /** The TAWS surveillance function (GPWS and TERR SYS) of SYS 2 is failed */
  taws2Failed: boolean;
  /** The WXR of SYS 1 is failed */
  wxr1Failed: boolean;
  /** The WXR of SYS 2 is failed */
  wxr2Failed: boolean;
}

/**
 * The SURV system that provides the TAWS functions (L:A32NX_TAWS_SYS_IN_USE). Normally the selected WXR/TAWS system.
 *
 * A380 FCOM PRO-ABN SURV TAWS 1(2) FAULT (a380_fcom.txt l.166806, l.166816-166824): with the TAWS (GPWS and TERR SYS) of
 * the selected SYS failed, the crew selects the other SYS for WXR & TAWS when its WXR is operative; "If the WXR on SYS 2
 * is failed ... An automatic reconfiguration has occurred: WXR surveillance function is on SYS 1(2), TAWS surveillance
 * function is on SYS 2(1)." The MFD SURV STATUS & SWITCHING page then shows TAWS 2(1) IN USE (DSC-34-20-60-50,
 * l.91789-91792).
 * Design choice: the reconfiguration needs an operative TAWS on the other SYS (with both TAWS failed it is SURV TAWS 1+2
 * FAULT, l.166844-166850, and nothing is gained).
 * @param state the selected system and the failures of both systems
 * @returns the TAWS system in use, 0 when no system is selected
 */
export function tawsSystemInUse(state: WxrTawsSystemsState): 0 | 1 | 2 {
  const selected = state.selected;
  if (selected !== 1 && selected !== 2) {
    return 0;
  }
  const other = selected === 1 ? 2 : 1;
  const selectedTawsFailed = selected === 1 ? state.taws1Failed : state.taws2Failed;
  const otherTawsFailed = other === 1 ? state.taws1Failed : state.taws2Failed;
  const otherWxrFailed = other === 1 ? state.wxr1Failed : state.wxr2Failed;
  return selectedTawsFailed && !otherTawsFailed && otherWxrFailed ? other : selected;
}

/**
 * The TAWS system for the TAWS consumers (GPWS modes, TERR STBY): L:A32NX_TAWS_SYS_IN_USE, the selected WXR/TAWS system
 * until EfisTawsBridge has written it.
 * @param selected L:A32NX_WXR_TAWS_SYS_SELECTED
 * @param inUse L:A32NX_TAWS_SYS_IN_USE
 * @returns the TAWS system, 0 when none
 */
export function publishedTawsSystem(selected: number, inUse: number): 0 | 1 | 2 {
  if (inUse === 1 || inUse === 2) {
    return inUse;
  }
  return selected === 1 || selected === 2 ? selected : 0;
}
