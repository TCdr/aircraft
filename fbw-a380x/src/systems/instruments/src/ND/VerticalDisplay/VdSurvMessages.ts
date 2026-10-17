// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The SURV messages of the Vertical Display. There are only four:
 * - NO TERR AND WX DATA AVAILABLE: the TERR SYS button of the MFD SURV CONTROLS page is OFF; without the TERR function
 *   the VD shows no weather either. Its other trigger, the PLAN mode, never reaches the VD (no VD in PLAN mode).
 * - TERR INOP: the TAWS has failed, or the flight crew turned it off on the MFD SURV page.
 * - WXR INOP: the WX pb of the EFIS CP is pressed and the WXR of the SURV system is failed.
 * - WX NOT SEL: the WX pb of the EFIS CP is pressed and the WX ON VD button of the SURV CONTROLS page is OFF (setting
 *   the WXR button to OFF also sets WX ON VD to OFF).
 * There is no NO TERR DATA AVAILABLE or NO WX DATA AVAILABLE message.
 */
export interface VdSurvMessageInputs {
  /** The TERR SYS button of the MFD SURV CONTROLS page is OFF */
  terrSysOff: boolean;
  /** The TERR function of the selected AESU is failed, or no AESU (TAWS) system is selected */
  terrFailed: boolean;
  /** The WX pb of this side's EFIS CP is selected (the WX overlay is on the ND) */
  wxPbSelected: boolean;
  /** The weather radar of the selected AESU is failed, or no AESU system is selected */
  wxrFailed: boolean;
  /** The WX ON VD button of the MFD SURV CONTROLS page is OFF */
  wxOnVdOff: boolean;
  /** The WXR button of the MFD SURV CONTROLS page is OFF */
  wxrOff: boolean;
}

export interface VdSurvMessages {
  noTerrAndWxDataAvailable: boolean;
  terrInop: boolean;
  wxrInop: boolean;
  wxNotSel: boolean;
}

/**
 * @param inputs the SURV selections and failures
 * @returns which SURV messages the VD shows
 */
export function computeVdSurvMessages(inputs: VdSurvMessageInputs): VdSurvMessages {
  const wxrInop = inputs.wxPbSelected && inputs.wxrFailed;
  return {
    noTerrAndWxDataAvailable: inputs.terrSysOff,
    terrInop: inputs.terrFailed,
    wxrInop,
    // WXR INOP and WX NOT SEL share the place of the weather message: the failure wins
    wxNotSel: inputs.wxPbSelected && !wxrInop && (inputs.wxOnVdOff || inputs.wxrOff),
  };
}
