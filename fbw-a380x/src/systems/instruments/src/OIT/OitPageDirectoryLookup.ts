// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { vi } from 'vitest';
import { ANYTHING } from './OitSpecSupport';
import {
  avncsCompanyComPageForUrl,
  avncsFbwSystemsPageForUrl,
  avncsLogbookPageForUrl,
  avncsPageForUrl,
  fltOpsPageForUrl,
} from './OitPageDirectory';
import { OitNotFound } from './Pages/OitNotFound';

/**
 * Asks the page directory for a page, as the containers do. A spec that uses this must mock the EcamMessages index
 * (`vi.mock('.../MsfsAvionicsCommon/EcamMessages', ...)`): its tables and its enums import each other.
 * @param uri a page URI
 * @returns whether the directory has a page for it rather than the not-found page
 */
export function pageDirectoryHas(uri: string): boolean {
  const bus = new EventBus();
  // Pages read SimVars while they are built, which the test environment does not have
  const simVars = vi.spyOn(SimVar, 'GetSimVarValue').mockReturnValue(0);
  try {
    return [
      avncsPageForUrl,
      avncsCompanyComPageForUrl,
      avncsFbwSystemsPageForUrl,
      avncsLogbookPageForUrl,
      fltOpsPageForUrl,
    ].some((pageForUrl) => {
      try {
        return !((pageForUrl as any)(uri, bus, ANYTHING, ANYTHING).instance instanceof OitNotFound);
      } catch {
        // The page was chosen and its constructor needs the sim; only the not-found page is built from nothing
        return true;
      }
    });
  } finally {
    simVars.mockRestore();
  }
}
