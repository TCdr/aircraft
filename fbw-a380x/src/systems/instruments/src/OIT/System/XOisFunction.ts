// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The OIS MENU and OIS XFR keys of the FLT OPS side of the OIT. OIS MENU shows the FLT OPS Menu page. OIS XFR starts
 * the X-OIS function (FLT OPS side only): the OIT shows the current display of the other OIT with the message "X-OIS
 * Activated"; OIS XFR again ends it.
 *
 * Design choices:
 * - The two OITs share their current FLT OPS page through an L:var each (L:A380X_OIT_CAPT(FO)_FLT_OPS_PAGE, the page
 *   code below): the OITs are in one VCockpit, where the synced bus events do not reach the other OIT (see OisLaptop).
 *   X-OIS shows the page of the other OIT and follows it; the page content comes from this OIT's own laptop.
 * - An OIT in X-OIS keeps publishing the page it showed before (its own display), so that two OITs in X-OIS do not
 *   follow each other. Deactivating X-OIS (OIS XFR again, or OIS MENU) brings that page back, or the menu.
 */

/** The FLT OPS pages, by code (index + 1); code 0: no FLT OPS page known. A new page goes at the end: codes never change */
const FLT_OPS_PAGE_URIS: readonly string[] = [
  'flt-ops',
  'flt-ops/sts',
  'flt-ops/to-perf',
  'flt-ops/ldg-perf',
  'flt-ops/charts',
  'flt-ops/flt-folder',
  'flt-ops/loadsheet',
  'flt-ops/in-flt-perf',
  'flt-ops/load-box',
  'flt-ops/export-box',
  'flt-ops/ops-library',
];

/** The FLT OPS Menu page, shown by the OIS MENU key */
export const FLT_OPS_MENU_URI = 'flt-ops';

/**
 * @param uri an OIT page URI
 * @returns the code of the FLT OPS page for the L:var, 0 for another page
 */
export function fltOpsPageCode(uri: string): number {
  return FLT_OPS_PAGE_URIS.indexOf(uri) + 1;
}

/**
 * @param code the code of an FLT OPS page (the L:var of the other OIT)
 * @returns the page URI, or null for an unknown code
 */
export function fltOpsPageUri(code: number): string | null {
  return Number.isInteger(code) && code >= 1 && code <= FLT_OPS_PAGE_URIS.length ? FLT_OPS_PAGE_URIS[code - 1] : null;
}

export class XOisFunction {
  private active = false;

  /** The page of this OIT when X-OIS was activated */
  private ownUri = FLT_OPS_MENU_URI;

  public isActive(): boolean {
    return this.active;
  }

  /**
   * The page this OIT publishes for the other OIT (its own display, also while it is in X-OIS)
   * @param currentUri the page this OIT shows
   * @returns the page URI to publish
   */
  public publishedUri(currentUri: string): string {
    return this.active ? this.ownUri : currentUri;
  }

  /**
   * @param currentUri the page this OIT shows
   * @param otherOitPageCode the page code of the other OIT
   * @returns the page to display now, or null to stay
   */
  public onOisXfrKey(currentUri: string, otherOitPageCode: number): string | null {
    if (this.active) {
      this.active = false;
      return this.ownUri;
    }
    this.active = true;
    this.ownUri = fltOpsPageCode(currentUri) !== 0 ? currentUri : FLT_OPS_MENU_URI;
    return fltOpsPageUri(otherOitPageCode);
  }

  /**
   * The OIS MENU key: the FLT OPS Menu page of this OIT (X-OIS ends)
   * @returns the page to display
   */
  public onOisMenuKey(): string {
    this.active = false;
    return FLT_OPS_MENU_URI;
  }

  /**
   * The other OIT changed its page
   * @param otherOitPageCode the page code of the other OIT
   * @returns the page to display now in X-OIS, or null to stay
   */
  public onOtherOitPage(otherOitPageCode: number): string | null {
    return this.active ? fltOpsPageUri(otherOitPageCode) : null;
  }

  /** The OIT left the FLT OPS session (laptop off, login screen): X-OIS ends */
  public reset(): void {
    this.active = false;
    this.ownUri = FLT_OPS_MENU_URI;
  }
}
