// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * With one ECAM display, the STS pb released and pushed again within this time shows the next STATUS page.
 */
const STATUS_NEXT_PAGE_PUSH_SECONDS = 2;

export interface EcamStatusPagingInputs {
  /** How many pages the STATUS page has (statusPageCount), 1 at least */
  pageCount: number;
  /** Whether the SD page is the STATUS page (L:A32NX_ECAM_SD_PAGE_TO_DISPLAY) */
  sdShowsStatus: boolean;
  /**
   * Whether only one ECAM display is on: the SD is shown only while a system page pb is held
   * (L:A32NX_ECAM_SINGLE_DISPLAY)
   */
  singleDisplay: boolean;
  /** Whether an alert (primary or secondary failure) is shown on the E/WD, after the CLR push of this update */
  ewdAlertDisplayed: boolean;
  /** The FWC CLR pulse: true for 0.5 s after a push, over several FWC updates */
  clearPulse: boolean;
  /** Whether the STS pb is pushed (its level) */
  statusPushed: boolean;
}

export interface EcamStatusPagingOutputs {
  /** The STATUS page shown, from 0 */
  pageIndex: number;
  /**
   * The STATUS page on the SD has a next page and the next CLR push shows it: the DMC must not remove the STATUS page
   * on that push
   */
  clearScrollsPage: boolean;
  /**
   * A CLR push for the STATUS page: true in the update of the push only, when the push neither cleared an E/WD alert
   * nor showed the next STATUS page. It removes the STATUS page the FWC called (EcamStatus).
   */
  clearPushForStatus: boolean;
}

/**
 * The page of the STATUS page that the SD shows:
 * - An arrow shows that the page overflows; the CLR pb scrolls the display to view the overflow. A CLR push that
 *   clears an E/WD alert is for the E/WD; on the last page, CLR removes the STATUS page (EcamStatus and
 *   DmcSdPageLogic).
 * - One ECAM display: the STS pb shows the STATUS page while held; released and pushed again within 2 s, it shows
 *   the next page, if any (design choice: no wrap to the first page); a push after 2 s shows the first page.
 * - Design choice: with two ECAM displays, an STS push shows the first page (or removes the page); the page also
 *   starts from the first one each time the SD shows the STATUS page again.
 */
export class EcamStatusPaging {
  private pageIndex = 0;

  private previousClearPulse = false;

  private ewdAlertDisplayedBefore = false;

  private previousStatusPushed = false;

  /** The time since the STS pb was released (infinite before the first release) */
  private secondsSinceStatusRelease = Infinity;

  update(inputs: EcamStatusPagingInputs, dtSeconds: number): EcamStatusPagingOutputs {
    const pageCount = Math.max(1, inputs.pageCount);
    const lastPage = pageCount - 1;

    // A CLR push: true in the first update of the FWC pulse only
    const clearPush = inputs.clearPulse && !this.previousClearPulse;
    this.previousClearPulse = inputs.clearPulse;
    let clearPushForStatus = false;
    if (clearPush) {
      // the push cleared an alert of the E/WD if one was shown before it (or is still shown)
      const forEwd = this.ewdAlertDisplayedBefore || inputs.ewdAlertDisplayed;
      const scrolls = !forEwd && inputs.sdShowsStatus && !inputs.singleDisplay && this.pageIndex < lastPage;
      if (scrolls) {
        this.pageIndex++;
      }
      clearPushForStatus = !forEwd && !scrolls;
    }
    this.ewdAlertDisplayedBefore = inputs.ewdAlertDisplayed;

    const statusPush = inputs.statusPushed && !this.previousStatusPushed;
    this.previousStatusPushed = inputs.statusPushed;
    if (statusPush) {
      const pushedAgain =
        inputs.singleDisplay && inputs.sdShowsStatus && this.secondsSinceStatusRelease <= STATUS_NEXT_PAGE_PUSH_SECONDS;
      if (!pushedAgain) {
        this.pageIndex = 0;
      } else if (this.pageIndex < lastPage) {
        this.pageIndex++;
      }
    }
    this.secondsSinceStatusRelease = inputs.statusPushed ? 0 : this.secondsSinceStatusRelease + dtSeconds;

    // The page starts from the first one when the SD shows another page, and follows a shorter STATUS
    if (!inputs.sdShowsStatus && !statusPush) {
      this.pageIndex = 0;
    }
    this.pageIndex = Math.min(this.pageIndex, lastPage);

    return {
      pageIndex: this.pageIndex,
      clearScrollsPage:
        inputs.sdShowsStatus && !inputs.singleDisplay && !inputs.ewdAlertDisplayed && this.pageIndex < lastPage,
      clearPushForStatus,
    };
  }
}
