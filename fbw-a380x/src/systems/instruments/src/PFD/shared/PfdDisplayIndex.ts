// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { findInstrumentGauge } from '../../MsfsAvionicsCommon/HostedDisplay';

/**
 * Searching the page for the gauge costs display thread time and the PFD asks on every frame. The side of a gauge
 * never changes once its URL is set, so the answer stays valid as long as the gauge element is in the page. Checked
 * with document.contains: the sim's engine may lack Node.isConnected.
 */
let knownGauge: { element: Element; displayIndex: number } | null = null;

const remember = (element: Element | null | undefined, displayIndex: number): number => {
  if (element) {
    knownGauge = { element, displayIndex };
  }
  return displayIndex;
};

/**
 * The side of this PFD gauge, from the duID of its panel.cfg URL. In its own module (re-exported by PFD.tsx) so that
 * the gauge (instrument.tsx) and its spec can use it without loading the whole PFD component tree.
 * @returns 1 for the CAPT PFD (duID 0), 2 for the F/O PFD (duID 3), also when drawn on an ND DU; 0 without a PFD gauge
 * URL (e.g. read in the gauge's constructor, before the gauge has its URL)
 */
export const getDisplayIndex = (): number => {
  if (knownGauge && document.contains(knownGauge.element)) {
    return knownGauge.displayIndex;
  }

  // the PFD gauge's own URL: a PFD drawn on the ND DU (CDS reconfiguration) is not the first gauge of its document
  const gauge = findInstrumentGauge('PFD');
  const url = gauge?.getAttribute('url');

  const duId = url ? parseInt(url.substring(url.length - 1), 10) : -1;

  switch (duId) {
    case 0:
      return remember(gauge, 1);
    case 3:
      return remember(gauge, 2);
    default:
      return 0;
  }
};
