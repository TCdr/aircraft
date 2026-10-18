// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { FLT_OPS_MENU_URI } from '../../System/XOisFunction';

export const FLT_OPS_STS_URI = 'flt-ops/sts';

export const FLT_FOLDER_URI = 'flt-ops/flt-folder';

/**
 * The name of each FLT OPS application, by the page of its URI (flt-ops/<page>): shown in cyan as the active
 * application of the menu bar and on its key of the switching bar. A new application only needs its route in
 * OitPageDirectory: its name is here.
 */
const FLT_OPS_APPLICATION_NAMES: Readonly<Record<string, string>> = {
  sts: 'FLT OPS STS',
  'flt-folder': 'FLT FOLDER',
  charts: 'CHARTS',
  'ops-library': 'OPS LIBRARY',
  'to-perf': 'T.O PERF',
  loadsheet: 'LOADSHEET',
  'ldg-perf': 'LDG PERF',
  'in-flt-perf': 'IN-FLT PERF',
  'load-box': 'LOAD BOX',
  'export-box': 'EXPORT BOX',
};

/** The heading of the FLT OPS MENU page, which is not an application */
const FLT_OPS_MENU_NAME = 'FLT OPS MENU';

/**
 * @param uri an OIT page URI
 * @returns the application the page belongs to (flt-ops/<page>), or null for the FLT OPS MENU page and the NSS AVNCS side
 */
export function fltOpsApplicationOf(uri: string): string | null {
  const parts = uri.split('/');
  if (parts[0] !== FLT_OPS_MENU_URI || !parts[1]) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

/**
 * @param uri an OIT page URI of the FLT OPS side
 * @returns the name of its application, FLT OPS MENU for the menu page
 */
export function fltOpsApplicationName(uri: string): string {
  const application = fltOpsApplicationOf(uri);
  if (application === null) {
    return FLT_OPS_MENU_NAME;
  }
  const page = application.substring(FLT_OPS_MENU_URI.length + 1);
  return FLT_OPS_APPLICATION_NAMES[page] ?? page.toUpperCase().replace(/-/g, ' ');
}

/** Design choice: the keys that fit between the two arrows of the switching bar on the OIT width */
export const FLT_OPS_SWITCHING_BAR_KEYS = 5;

/**
 * The open applications of the FLT OPS side, in the order they were opened, as the switching bar at the bottom shows
 * them with the active one highlighted. Displaying a page of an application opens it; CLOSE APPLICATION closes the
 * active one; the arrows scroll the bar when more applications are open than it has keys.
 */
export class FltOpsOpenApplications {
  private readonly _open = Subject.create<readonly string[]>([]);
  /** The open applications (flt-ops/<page>), in the order they were opened */
  public readonly open = this._open as Subscribable<readonly string[]>;

  private readonly _active = Subject.create<string | null>(null);
  /** The displayed application, null on the FLT OPS MENU page */
  public readonly active = this._active as Subscribable<string | null>;

  private readonly firstShown = Subject.create(0);

  /** The last page shown of each open application, where its key of the switching bar goes back to */
  private readonly lastPages = new Map<string, string>();

  /** The applications on the keys of the switching bar, from the left */
  public readonly shown: Subscribable<readonly string[]> = MappedSubject.create(
    ([open, first]) => open.slice(first, first + this.keys),
    this._open,
    this.firstShown,
  );

  public readonly canScrollLeft: Subscribable<boolean> = this.firstShown.map((first) => first > 0);

  public readonly canScrollRight: Subscribable<boolean> = MappedSubject.create(
    ([open, first]) => first + this.keys < open.length,
    this._open,
    this.firstShown,
  );

  constructor(private readonly keys = FLT_OPS_SWITCHING_BAR_KEYS) {}

  /**
   * A page is displayed: its application opens (at the end of the bar) when it was not open, and becomes active.
   * @param uri the displayed page
   */
  public show(uri: string): void {
    const application = fltOpsApplicationOf(uri);
    if (application === null) {
      this._active.set(null);
      return;
    }
    if (!this._open.get().includes(application)) {
      this._open.set([...this._open.get(), application]);
    }
    this.lastPages.set(application, uri);
    this._active.set(application);
    this.scrollTo(application);
  }

  /**
   * Opens applications without displaying them (the applications that start with the session)
   * @param applications the applications
   */
  public startSession(applications: readonly string[]): void {
    this.reset();
    this._open.set(applications.slice());
  }

  /**
   * CLOSE APPLICATION
   * @returns the closed application, null on the FLT OPS MENU page (no active application)
   */
  public closeActive(): string | null {
    const application = this._active.get();
    if (application === null) {
      return null;
    }
    this._open.set(this._open.get().filter((open) => open !== application));
    this.lastPages.delete(application);
    this._active.set(null);
    this.clampScroll();
    return application;
  }

  public isOpen(application: string): boolean {
    return this._open.get().includes(application);
  }

  /**
   * @param application an open application
   * @returns the page to display when its key of the switching bar is clicked: the last one shown
   */
  public pageOf(application: string): string {
    return this.lastPages.get(application) ?? application;
  }

  /**
   * An arrow of the switching bar
   * @param step -1: left arrow, 1: right arrow
   */
  public scroll(step: -1 | 1): void {
    this.firstShown.set(this.firstShown.get() + step);
    this.clampScroll();
  }

  /** The end of the session: no application open */
  public reset(): void {
    this._open.set([]);
    this._active.set(null);
    this.lastPages.clear();
    this.firstShown.set(0);
  }

  private scrollTo(application: string): void {
    const index = this._open.get().indexOf(application);
    const first = this.firstShown.get();
    if (index < first) {
      this.firstShown.set(index);
    } else if (index >= first + this.keys) {
      this.firstShown.set(index - this.keys + 1);
    }
  }

  private clampScroll(): void {
    const maxFirst = Math.max(0, this._open.get().length - this.keys);
    this.firstShown.set(Math.min(Math.max(this.firstShown.get(), 0), maxFirst));
  }
}
