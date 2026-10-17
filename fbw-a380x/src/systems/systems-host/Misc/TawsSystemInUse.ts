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
  wxr1Failed: boolean;
  wxr2Failed: boolean;
}

/**
 * The SURV system that provides the TAWS functions (L:A32NX_TAWS_SYS_IN_USE). Normally the selected WXR/TAWS system.
 *
 * SURV TAWS 1(2) FAULT: with the TAWS (GPWS and TERR SYS) of the selected SYS failed, the crew selects the other SYS
 * for WXR & TAWS when its WXR is operative. When the WXR of the other SYS is failed, an automatic reconfiguration keeps
 * the WXR surveillance function on the selected SYS and puts the TAWS surveillance function on the other SYS. The MFD
 * SURV STATUS & SWITCHING page then shows TAWS 2(1) IN USE.
 * Design choice: the reconfiguration needs an operative TAWS on the other SYS (with both TAWS failed it is SURV TAWS
 * 1+2 FAULT, and nothing is gained).
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
