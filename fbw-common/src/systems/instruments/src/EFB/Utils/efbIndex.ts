// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The flyPad tablet this instance runs on. An aircraft can have one flyPad per pilot, each its own gauge (panel.cfg
 * URL `efb.html?Index=2` for the first officer's): pages, loaded data and checklists are per instance; the brightness is
 * per tablet through the names below; the actions that change the shared aircraft state on their own (closing the
 * doors, the lighting presets, GSX remote control...) run on the captain's tablet only.
 */
export type EfbTablet = 1 | 2;

let cachedIndex: EfbTablet | null = null;

/**
 * The tablet of this flyPad: 1 the captain's (also every aircraft with one flyPad), 2 the first officer's
 * @returns 1 or 2
 */
export function efbIndex(): EfbTablet {
  if (cachedIndex === null) {
    const url = document.querySelector('vcockpit-panel > *')?.getAttribute('url');
    if (url === null || url === undefined) {
      // not known yet (no gauge element): the captain's, not cached
      return 1;
    }
    cachedIndex = /[?&]Index=2(?!\d)/i.test(url) ? 2 : 1;
  }
  return cachedIndex;
}

/** Whether this flyPad is the captain's: the one running the actions that change the shared aircraft state */
export function isCaptainEfb(): boolean {
  return efbIndex() === 1;
}

/**
 * The per-tablet name of a flyPad simvar: the captain's keeps its name, the first officer's has `_2` after `EFB`
 * (L:A32NX_EFB_BRIGHTNESS -> L:A32NX_EFB_2_BRIGHTNESS)
 * @param name the captain's name, starting with L:A32NX_EFB_
 * @returns the name for this tablet
 */
export function efbSimVar(name: string): string {
  return efbIndex() === 1 ? name : name.replace(/^L:A32NX_EFB_/, 'L:A32NX_EFB_2_');
}

/**
 * The per-tablet key of a flyPad persistent setting: the captain's keeps its key, the first officer's has `_2` after
 * `EFB` (EFB_BRIGHTNESS -> EFB_2_BRIGHTNESS)
 * @param key the captain's key, starting with EFB_
 * @returns the key for this tablet
 */
export function efbSetting(key: string): string {
  return efbIndex() === 1 ? key : key.replace(/^EFB_/, 'EFB_2_');
}
