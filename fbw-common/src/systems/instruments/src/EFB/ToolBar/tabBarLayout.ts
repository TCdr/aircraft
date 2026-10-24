// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type TabBarPosition = 'top' | 'bottom';

export const TAB_BAR_HEIGHT_REM = 4.5;
const STATUS_BAR_HEIGHT_REM = 2.5;

const CONTENT_GAP_REM = 1;

// Page heights with the status bar on top and no tab bar (the tailwind content-section-* fallbacks)
const PAGE_HEIGHT_REDUCED_REM = 54;
const PAGE_HEIGHT_FULL_REM = 57.25;
const DEFAULT_CONTENT_TOP_REM = STATUS_BAR_HEIGHT_REM + CONTENT_GAP_REM;

export interface TabBarLayout {
  contentTopRem: number;
  contentBottomRem: number;
  contentHeightReducedRem: number;
  contentHeightFullRem: number;
}

export function tabBarLayout(position: TabBarPosition): TabBarLayout {
  // A bar at the top takes the place of the status bar, so only the difference moves the content down
  const contentTopRem = (position === 'top' ? TAB_BAR_HEIGHT_REM : STATUS_BAR_HEIGHT_REM) + CONTENT_GAP_REM;
  const contentBottomRem = position === 'top' ? 0 : TAB_BAR_HEIGHT_REM;
  const lostHeightRem = contentTopRem - DEFAULT_CONTENT_TOP_REM + contentBottomRem;

  return {
    contentTopRem,
    contentBottomRem,
    contentHeightReducedRem: PAGE_HEIGHT_REDUCED_REM - lostHeightRem,
    contentHeightFullRem: PAGE_HEIGHT_FULL_REM - lostHeightRem,
  };
}

/** The class on the flyPad root that selects the page heights of a bar position (defined in Assets/Theme.css) */
export function tabBarPositionClass(position: TabBarPosition): string {
  return `efb-tabbar-${position}`;
}

/**
 * The height in rem of a page body (what `h-content-section-reduced` gives) minus a fixed part, for scroll areas that
 * need a numeric height inside it.
 * @param reservedRem the height in rem taken by everything else on the page
 */
export function contentSectionHeightRem(position: TabBarPosition, reservedRem = 0): number {
  return tabBarLayout(position).contentHeightReducedRem - reservedRem;
}

/** A tab is open for its own route and every page under it (/ground opens for /ground/fuel too) */
export function isTabOpen(pathname: string, tabPath: string): boolean {
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}
