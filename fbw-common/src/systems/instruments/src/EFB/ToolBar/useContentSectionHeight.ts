// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { contentSectionHeightRem } from './tabBarLayout';
import { useTabBarPosition } from './useTabBarPosition';

/**
 * The height in rem of a page body minus a fixed part, at the current tab bar position.
 * @param reservedRem the height in rem taken by everything else on the page
 */
export function useContentSectionHeight(reservedRem = 0): number {
  const [position] = useTabBarPosition();

  return contentSectionHeightRem(position, reservedRem);
}
