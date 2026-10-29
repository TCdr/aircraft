// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MappedSubscribable, Subject, Subscribable, SubscribableMapFunctions, Subscription } from '@microsoft/msfs-sdk';

/**
 * The functions of the OIS menu bars that act on the displayed page: PRINT, STORE, UPDATE, UNDO and REDO of the FLT OPS
 * FUNCTIONS list (and HOME, for a page whose home is inside the page), PRINT and UPDATE of the NSS AVNCS line 2. Which
 * of them are active depends on the application, so each page registers the ones it has
 * (OitUiService.registerPageFunctions, from its onAfterRender); the menu bars keep the others greyed. A navigation
 * drops the registrations of the previous page.
 */
export type OitPageFunctionName = 'print' | 'store' | 'update' | 'undo' | 'redo' | 'home';

export interface OitPageFunction {
  /** Does the function on the displayed page */
  run(): void;
  /** Whether the function can be used now (e.g. PRINT needs a selected message); always when not given */
  available?: Subscribable<boolean>;
}

export type OitPageFunctions = Partial<Record<OitPageFunctionName, OitPageFunction>>;

/**
 * Keyboard shortcuts by chord (LaptopKeyChords), e.g. F8 for the COMPUTE button or ALT+LEFT for PREVIOUS. A page
 * registers the ones its buttons show; a shortcut does what a click on the button does, and only while the button
 * could be clicked.
 */
export type OitShortcuts = Readonly<Record<string, OitPageFunction>>;

/**
 * @param functions the functions of the displayed page
 * @param name a function
 * @returns whether the page has the function and can use it now
 */
export function isPageFunctionAvailable(functions: OitPageFunctions, name: OitPageFunctionName): boolean {
  const pageFunction = functions[name];
  return pageFunction !== undefined && (pageFunction.available?.get() ?? true);
}

/**
 * HOME of the FLT OPS FUNCTIONS list: greyed on the home page of the displayed application and on the FLT OPS MENU
 * page, unless the page has its own way home (a page that shows a document inside the application).
 * @param application the application of the displayed page, null on pages outside an application
 * @param uri the displayed page
 * @param pageHomeAvailable whether the page registered a HOME function that can be used now
 * @returns whether HOME is greyed
 */
export function isHomeDisabled(application: string | null, uri: string, pageHomeAvailable: boolean): boolean {
  return !pageHomeAvailable && (application === null || application === uri);
}

/** Follows whether one function of the displayed page can be used, for the greyed state of its menu item or button */
export class PageFunctionAvailability {
  private readonly _available = Subject.create(false);
  public readonly available = this._available as Subscribable<boolean>;

  /** The greyed state of the menu item or button */
  public readonly disabled: MappedSubscribable<boolean> = this._available.map(SubscribableMapFunctions.not());

  private pageSubscription: Subscription | null = null;

  private readonly functionsSubscription: Subscription;

  constructor(functions: Subscribable<OitPageFunctions>, name: OitPageFunctionName) {
    this.functionsSubscription = functions.sub((pageFunctions) => {
      this.pageSubscription?.destroy();
      this.pageSubscription = null;
      const pageFunction = pageFunctions[name];
      if (pageFunction === undefined) {
        this._available.set(false);
      } else if (pageFunction.available === undefined) {
        this._available.set(true);
      } else {
        this.pageSubscription = pageFunction.available.sub((available) => this._available.set(available), true);
      }
    }, true);
  }

  public destroy(): void {
    this.functionsSubscription.destroy();
    this.pageSubscription?.destroy();
    this.disabled.destroy();
  }
}
