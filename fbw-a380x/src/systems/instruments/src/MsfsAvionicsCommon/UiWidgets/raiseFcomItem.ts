// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/**
 * Raises (or lowers again) the FCOM-positioned items that contain an element with an open menu. Each item is its own
 * stacking context (it is translated), so the menu would otherwise be drawn below the items that follow it.
 */
export function raiseFcomItem(element: HTMLElement, raised: boolean): void {
  for (let item = element.closest<HTMLElement>('.mfd-fcom-item'); item; ) {
    item.style.zIndex = raised ? '10' : '';
    item = item.parentElement?.closest<HTMLElement>('.mfd-fcom-item') ?? null;
  }
}
