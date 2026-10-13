// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The SURV messages of the Vertical Display, A380 FCOM DSC-31-20-40-30 SURV MESSAGES (a380_fcom.txt l.69819-69845) and
 * DSC-34-20-30-20 WXR MESSAGES (l.90208-90217). The FCOM has only four of them:
 * - NO TERR AND WX DATA AVAILABLE: "Sets to OFF the TERR SYS button on the SURV CONTROLS page of the MFD. The VD
 *   does not display the weather when the TERR function is not available" (l.69819-69826, l.88835-88841). Its other
 *   trigger, PLAN mode, does not reach the VD: "The VD is only available in ARC and ROSE-NAV modes" (l.69098).
 * - TERR INOP: "The TAWS has failed, or the flight crew turns off the TAWS, via the SURV page of the MFD"
 *   (l.69828-69833).
 * - WXR INOP: "the flight crew presses the WX pb on the EFIS CP, and the WXR (on the SURV system) is failed"
 *   (l.90208-90210).
 * - WX NOT SEL: "the flight crew presses the WX pb on the EFIS CP [and] sets the WX ON VD button to OFF on the SURV
 *   CONTROLS page" (l.69841-69845, l.90213-90217); WX ON VD button OFF: "If the flight crew presses the WX pb on the
 *   EFIS CP, the VD does not display weather information. Associated with the WX NOT SEL message on the VD"
 *   (l.89958-89960). The WXR button set to OFF also sets "The WX ON VD button ... automatically to OFF" (l.89825).
 * There is no NO TERR DATA AVAILABLE or NO WX DATA AVAILABLE message in the FCOM.
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
