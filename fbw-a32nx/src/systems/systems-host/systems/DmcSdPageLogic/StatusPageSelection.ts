// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '../../../shared/src/SdPages';

/**
 * Whether a CLR push removes the STATUS page selected with the STS pb (A320 FCOM DSC-31-30 l.46772-46773), once no
 * alert is shown on the E/WD. A push that shows the next page of an overflowing STATUS page does not remove it
 * (DSC-31-20 l.46196-46199): the FWC scrolls the page instead.
 * @param clearPush a CLR push (one update)
 * @param statusSelected whether the STATUS page is shown because the STS pb selected it
 * @param ewdAlertShown whether an alert is shown on the E/WD (the push is for the E/WD)
 * @param clearScrollsStatus L:A32NX_ECAM_STATUS_CLR_SCROLLS as written by the FWC before this push (read at the previous
 * update: the FWC may process the same push earlier in the frame, and then shows the last page already)
 */
export function isStatusPageClearedByClr(
  clearPush: boolean,
  statusSelected: boolean,
  ewdAlertShown: boolean,
  clearScrollsStatus: boolean,
): boolean {
  return clearPush && statusSelected && !ewdAlertShown && !clearScrollsStatus;
}

/**
 * Whether a push of the pb of the page the SD shows deselects it (back to the flight phase page). The STS pb pushed
 * again does (DSC-31-30 l.46772-46773), except with one ECAM display: the push shows the next STATUS page then
 * (l.46775-46779), the FWC pages it.
 * @param pushedPage the page of the pushed pb, the page the SD shows
 * @param singleDisplay whether only one ECAM display is on (L:A32NX_ECAM_SINGLE_DISPLAY)
 */
export function isShownPageDeselectedByItsPb(pushedPage: SdPages, singleDisplay: boolean): boolean {
  return !(pushedPage === SdPages.STS && singleDisplay);
}
