// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';

/** The colours of the dashboard panel header bars: vivid car colours, or soft tints of them */
export type HeaderColours = 'vivid' | 'soft';

const HEADER_COLOURS_SETTING = 'EFB_HEADER_COLOURS';

/** The class on the flyPad root that switches the header bars to the soft set (defined in Assets/Theme.css) */
export function headerColoursClass(colours: HeaderColours): string {
  return colours === 'soft' ? 'efb-headers-soft' : '';
}

export function useHeaderColours(): [HeaderColours, (colours: HeaderColours) => void] {
  const [stored, setStored] = usePersistentProperty(HEADER_COLOURS_SETTING, 'vivid');

  // The stored value is free text, so anything but 'soft' falls back to the default
  const colours: HeaderColours = stored === 'soft' ? 'soft' : 'vivid';

  return [colours, setStored];
}
