// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { TabBarPosition } from './tabBarLayout';

const TAB_BAR_POSITION_SETTING = 'EFB_TAB_BAR_POSITION';

export function useTabBarPosition(): [TabBarPosition, (position: TabBarPosition) => void] {
  const [storedPosition, setStoredPosition] = usePersistentProperty(TAB_BAR_POSITION_SETTING, 'bottom');

  // The stored value is free text, so anything but 'top' falls back to the default
  const position: TabBarPosition = storedPosition === 'top' ? 'top' : 'bottom';

  return [position, setStoredPosition];
}
