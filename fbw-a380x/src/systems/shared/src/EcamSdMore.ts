// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from './EcamSystemPages';

// Rules of the ECP MORE pb and of the MORE information pages on the SD.
// The FWS (systems host) owns the decision because it owns the lists behind it; the SD STATUS page uses the same
// rule from the same published lists only to draw the boxed MORE label, so the label and the pb always agree.
// The MORE pb shows the MORE information page when MORE appears on a system page or the STATUS page; pressing it
// again clears the MORE page.

/**
 * The SD pages that have a MORE information page: STATUS MORE, only when the STATUS page has MORE information
 * (isStatusMoreAvailable); FUEL MORE (additional fuel system information) and WHEEL MORE (additional landing gear
 * information), always available.
 */
const SD_PAGES_WITH_MORE: readonly SdPages[] = [SdPages.Status, SdPages.Fuel, SdPages.Wheel];

/**
 * Whether the STATUS page has a STATUS MORE page: the REDUND LOSS items, the ALERTS IMPACTING LDG PERF, the CANCELLED
 * CAUTION or the MORE INFO section.
 * @param redundancyLossKeys the STATUS REDUND LOSS items (FwsInopSys entries flagged redundancyLoss)
 * @param cancelledCautionKeys the cautions cancelled with the EMER CANC pb
 * @param alertsImpactingLdgPerfKeys the active alerts that impact the landing performance (EcamMessages/StatusMore)
 * @param moreInfoKeys the active alerts with MORE INFO (EcamMessages/StatusMore)
 */
export function isStatusMoreAvailable(
  redundancyLossKeys: readonly string[],
  cancelledCautionKeys: readonly string[],
  alertsImpactingLdgPerfKeys: readonly string[] = [],
  moreInfoKeys: readonly string[] = [],
): boolean {
  return (
    redundancyLossKeys.length > 0 ||
    cancelledCautionKeys.length > 0 ||
    alertsImpactingLdgPerfKeys.length > 0 ||
    moreInfoKeys.length > 0
  );
}

/**
 * Whether the SD page has MORE information to show right now.
 * @param page the page shown on the SD
 * @param statusMoreAvailable result of {@link isStatusMoreAvailable}
 */
export function isSdMoreAvailable(page: SdPages, statusMoreAvailable: boolean): boolean {
  if (!SD_PAGES_WITH_MORE.includes(page)) {
    return false;
  }
  return page !== SdPages.Status || statusMoreAvailable;
}

/**
 * The MORE page state after the crew presses the MORE pb.
 * @param page the page shown on the SD
 * @param moreShown whether the MORE page is currently shown
 * @param statusMoreAvailable result of {@link isStatusMoreAvailable}
 * @returns the new MORE page state, or undefined when the pb has no effect on this page
 */
export function sdMoreShownAfterMorePb(
  page: SdPages,
  moreShown: boolean,
  statusMoreAvailable: boolean,
): boolean | undefined {
  if (!SD_PAGES_WITH_MORE.includes(page)) {
    return undefined;
  }
  if (!isSdMoreAvailable(page, statusMoreAvailable)) {
    return false;
  }
  return !moreShown;
}

/**
 * The MORE page state to keep on every FWS cycle: the MORE page (and so the MORE pb light) goes away when the SD
 * leaves the page, or when that page has no MORE information any more. The MORE page belongs to the page it was shown
 * on: going from WHEEL MORE to the FUEL page shows the FUEL page, not FUEL MORE.
 * @param page the page shown on the SD
 * @param moreShown whether the MORE page is currently shown
 * @param statusMoreAvailable result of {@link isStatusMoreAvailable}
 * @param moreShownOnPage the page on which the MORE page was shown, undefined when not known
 */
export function sdMoreShownToKeep(
  page: SdPages,
  moreShown: boolean,
  statusMoreAvailable: boolean,
  moreShownOnPage?: SdPages,
): boolean {
  if (moreShownOnPage !== undefined && moreShownOnPage !== page) {
    return false;
  }
  return moreShown && isSdMoreAvailable(page, statusMoreAvailable);
}
