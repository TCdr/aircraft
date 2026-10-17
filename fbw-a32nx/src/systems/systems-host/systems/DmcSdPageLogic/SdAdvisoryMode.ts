// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '../../../shared/src/SdPages';

/*
 * The advisory mode of the SD page selection: a failure or advisory page replaces a page the crew selected; on an
 * advisory, the system page appears automatically and the value pulses green as long as it is out of its limits.
 * With only one ECAM display on, an advisory does not call its page: the page pb light pulses instead (FakeDmc
 * ecpPageLightRequest).
 */

export enum SdAdvisoryAction {
  /** Nothing changes */
  None,
  /** The advisory page replaces the page shown */
  ShowAdvisoryPage,
  /** The advisory is over: back to the flight phase page */
  EndAdvisory,
}

export interface SdAdvisoryModeInputs {
  /** The page with an advisory now (SdAdvisoryMonitor), SdPages.NONE if none */
  advisoryPage: SdPages;
  /** The advisory page already called (SdPages.NONE if none) */
  previousAdvisoryPage: SdPages;
  /** The SD shows a page called by an advisory */
  inAdvisoryMode: boolean;
  /** The SD shows the page of a failure (the FWC request) */
  inWarningMode: boolean;
  /** Only one ECAM display is on */
  singleDisplay: boolean;
}

/**
 * What the advisory does to the SD page selection at this update
 * @param inputs the advisory and the SD mode
 */
export function sdAdvisoryAction(inputs: SdAdvisoryModeInputs): SdAdvisoryAction {
  if (inputs.inAdvisoryMode && (inputs.advisoryPage === SdPages.NONE || inputs.singleDisplay)) {
    // the page stays as long as the value is out of its limits; with one display the page goes (only the pb light pulses)
    return SdAdvisoryAction.EndAdvisory;
  }
  if (inputs.inWarningMode || inputs.singleDisplay || inputs.advisoryPage === SdPages.NONE) {
    // a failure page stays; with one display the page is not called
    return SdAdvisoryAction.None;
  }
  // a new advisory (or an advisory of another page) calls its page once: the crew can then select another page
  return inputs.advisoryPage !== inputs.previousAdvisoryPage
    ? SdAdvisoryAction.ShowAdvisoryPage
    : SdAdvisoryAction.None;
}
