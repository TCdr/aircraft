// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { findInstrumentUrl } from '../../MsfsAvionicsCommon/HostedDisplay';

/**
 * The side of this PFD gauge, from the duID of its panel.cfg URL. In its own module (re-exported by PFD.tsx) so that
 * the gauge (instrument.tsx) and its spec can use it without loading the whole PFD component tree.
 * @returns 1 for the CAPT PFD (duID 0), 2 for the F/O PFD (duID 3), also when drawn on an ND DU; 0 without a PFD gauge
 * URL (e.g. read in the gauge's constructor, before the gauge has its URL)
 */
export const getDisplayIndex = (): number => {
  // the PFD gauge's own URL: a PFD drawn on the ND DU (CDS reconfiguration) is not the first gauge of its document
  const url = findInstrumentUrl('PFD');

  const duId = url ? parseInt(url.substring(url.length - 1), 10) : -1;

  switch (duId) {
    case 0:
      return 1;
    case 3:
      return 2;
    default:
      return 0;
  }
};
