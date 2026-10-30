// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { AocPrintout } from '@shared/AocPrintout';

/*
 * STORE of the performance applications: the page as a printout text becomes a document of the Performance folder of
 * the current EFF, named after the application: TOPA (T.O PERF), LDPA (LDG PERF), WBA (LOADSHEET), IFPA (IN-FLT PERF).
 */

export type StoredApplicationCode = 'TOPA' | 'LDPA' | 'WBA' | 'IFPA';

/** The message of the pop-up after a STORE */
export const DOCUMENT_STORED_MESSAGE = 'Document stored in FLT FOLDER';

/** The part of the FLT FOLDER session a STORE needs */
export interface PerformanceStoreTarget {
  /** Whether there is an open current EFF */
  readonly storeAvailable: Subscribable<boolean>;
  /**
   * @param code the application
   * @param text the printout text
   * @returns the name of the stored document, null when nothing was stored
   */
  store(code: string, text: string): string | null;
}

/**
 * @param target the FLT FOLDER of the laptop
 * @param hasPrintout whether the page shows something to store (its results)
 * @param popupTitle the pop-up after a STORE: it has to be closed with OK before another document is stored
 * @returns whether STORE can be used: the page has results, the current EFF is open and the pop-up is closed. The
 * caller destroys it.
 */
export function storeAvailability(
  target: PerformanceStoreTarget,
  hasPrintout: Subscribable<boolean>,
  popupTitle: Subscribable<string | null>,
): MappedSubject<[boolean, boolean, string | null], boolean> {
  return MappedSubject.create(
    ([results, folderOpen, popup]) => results && folderOpen && popup === null,
    hasPrintout,
    target.storeAvailable,
    popupTitle,
  );
}

/**
 * @param target the FLT FOLDER of the laptop
 * @param code the application
 * @param printout the page as a printout, null when it shows nothing to store
 * @returns the title of the "Document stored" pop-up (the application name), null when nothing was stored
 */
export function storePage(
  target: PerformanceStoreTarget,
  code: StoredApplicationCode,
  printout: AocPrintout | null,
): string | null {
  if (printout === null || !target.storeAvailable.get()) {
    return null;
  }
  return target.store(code, printout.text) !== null ? printout.title ?? code : null;
}

/**
 * STORE of a page: the document goes into the current EFF and the pop-up opens
 * @param target the FLT FOLDER of the laptop
 * @param code the application
 * @param printout the page as a printout, null when it shows nothing to store
 * @param popupTitle the pop-up of the page: it opens with the application name as its title
 */
export function storeAndAnnounce(
  target: PerformanceStoreTarget,
  code: StoredApplicationCode,
  printout: AocPrintout | null,
  popupTitle: Subject<string | null>,
): void {
  if (popupTitle.get() !== null) {
    return;
  }
  const title = storePage(target, code, printout);
  if (title !== null) {
    popupTitle.set(title);
  }
}
