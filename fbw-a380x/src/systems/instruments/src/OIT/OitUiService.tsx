//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import {
  isPageFunctionAvailable,
  OitPageFunction,
  OitPageFunctionName,
  OitPageFunctions,
  OitShortcuts,
} from './OitPageFunctions';
import { FLT_FOLDER_URI, FLT_OPS_STS_URI, FltOpsOpenApplications } from './Pages/FltOps/FltOpsApplications';
import { createNssAvncsOpenApplications, NSS_AVNCS_STARTUP_APPLICATIONS } from './Pages/NssAvncs/NssAvncsApplications';

export enum OitSystem {
  None = '',
  NssAvncs = 'nss-avncs',
  FltOps = 'flt-ops',
}

/*
 * Hierarchy of URIs: sys / category / page / extra
 */
export interface OitUriInformation {
  uri: string; // Full URI to OIT page, e.g. FLT-OPS/TO-PERF
  sys: OitSystem; // 1st part of URI (system), can be nss or flt-ops
  page: string; // page within system
  extra?: string; // Can be used for deep-linking within a page
}

/**
 * The page an application opens on, for the applications whose own URI has no page: COMPANY COM opens on its Inbox
 * (Design choice: the folder the AOC puts the received messages in).
 */
const APPLICATION_START_PAGES: Readonly<Record<string, string>> = {
  'nss-avncs/company-com': 'nss-avncs/company-com/inbox',
};

/*
 * Handles navigation (and potentially other aspects) for OIT pages
 */
export class OitUiService {
  constructor(public captOrFo: 'CAPT' | 'FO') {
    // The FLT OPS STS application starts automatically after the login
    this.fltOpsLoginScreenVisible.sub((visible) => {
      if (!visible) {
        this.fltOpsApplications.startSession([FLT_OPS_STS_URI]);
      }
    });
    // COMPANY COM and the LOGBOOK start automatically after the log-on; all NSS AVNCS applications close at the log-off
    this.nssAvncsLoginScreenVisible.sub((visible) => {
      if (visible) {
        this.nssAvncsApplications.reset();
      } else {
        this.nssAvncsApplications.startSession(NSS_AVNCS_STARTUP_APPLICATIONS);
      }
    });
  }

  public readonly activeUri = Subject.create<OitUriInformation>({
    uri: '',
    sys: OitSystem.None,
    page: '',
    extra: '',
  });

  private navigationStack: string[] = [];
  private navigationForwardStack: string[] = [];

  public readonly fltOpsLoginScreenVisible = Subject.create(true);
  public readonly nssAvncsLoginScreenVisible = Subject.create(true);

  private readonly _backAvailable = Subject.create(false);
  /** There is a previously displayed page (BACK, PREVIOUS) */
  public readonly backAvailable = this._backAvailable as Subscribable<boolean>;

  private readonly _forwardAvailable = Subject.create(false);
  /** There is a page displayed before the last BACK (FORWARD, NEXT) */
  public readonly forwardAvailable = this._forwardAvailable as Subscribable<boolean>;

  /** The open FLT OPS applications, for the switching bar */
  public readonly fltOpsApplications = new FltOpsOpenApplications();

  /** The open NSS AVNCS applications, for the task bar */
  public readonly nssAvncsApplications = createNssAvncsOpenApplications();

  /**
   * Full screen: the FLT OPS switching bar is hidden (HIDE SWITCHING BAR), or the NSS AVNCS application hides its
   * navigation tree and the task bar (MAXIMIZE)
   */
  public readonly fullScreen = Subject.create(false);

  /** The shortcuts of the displayed page, dropped at each navigation */
  private pageShortcuts: OitShortcuts = {};

  /** The shortcuts of the menu bars, valid on every page */
  private menuShortcuts: OitShortcuts = {};

  private readonly _pageFunctions = Subject.create<OitPageFunctions>({});
  /** The functions of the menu bars the displayed page has (see OitPageFunctions) */
  public readonly pageFunctions = this._pageFunctions as Subscribable<OitPageFunctions>;

  public parseUri(uri: string): OitUriInformation {
    const uriParts = uri.split('/');
    return {
      uri,
      sys: uriParts[0] as OitSystem,
      page: uriParts[1],
      extra: uriParts.slice(2).join('/'),
    };
  }

  /**
   * Navigate to OIT page.
   * @param requestedUri The URI to navigate to. Use URI 'back' for returning to previous page. An application without
   * a page of its own opens on its start page (e.g. COMPANY COM on its Inbox).
   * Sometimes (e.g. for nss-avncs/company-com), another local navigator will handle the sub-navigation.
   */
  public navigateTo(requestedUri: string): void {
    let nextUri: string;

    const uri = APPLICATION_START_PAGES[requestedUri] ?? requestedUri;
    const forceReloadUrls: string[] = [];
    if (uri === this.activeUri.get().uri && !forceReloadUrls.includes(uri)) {
      // Same URL, don't navigate. Except for some URLs defined in forceReloadUrls
      console.info('Navigate to same URL, ignored.');
      return;
    }

    // Before navigating, make sure that all input fields are un-focused
    Coherent.trigger('UNFOCUS_INPUT_FIELD');

    if (uri === 'back') {
      if (this.navigationStack.length < 2) {
        return;
      }
      const nextPage = this.navigationStack.pop();
      if (nextPage) {
        this.navigationForwardStack.push(nextPage);
      }
      nextUri = this.navigationStack[this.navigationStack.length - 1];
    } else if (uri === 'forward') {
      const nextPage = this.navigationForwardStack.pop();
      if (!nextPage) {
        return;
      }
      this.navigationStack.push(nextPage);
      nextUri = this.navigationStack[this.navigationStack.length - 1];
    } else {
      this.navigationStack.push(uri);
      this.navigationForwardStack = []; // Clear forward stack
      nextUri = uri;
    }

    this.showPage(nextUri);
  }

  /**
   * Displays the current page again, as new: UPDATE of the NSS AVNCS side reads the avionics parameters again
   */
  public reloadActivePage(): void {
    this.showPage(this.activeUri.get().uri);
  }

  /**
   * The displayed page tells which functions of the menu bars it has; until it does, they are greyed
   * @param functions the functions of the page
   */
  public registerPageFunctions(functions: OitPageFunctions): void {
    this._pageFunctions.set(functions);
  }

  /**
   * A function of the menu bars on the displayed page
   * @param name the function
   * @returns whether the page did it (false when the page does not have it, or cannot use it now)
   */
  public runPageFunction(name: OitPageFunctionName): boolean {
    const functions = this._pageFunctions.get();
    if (!isPageFunctionAvailable(functions, name)) {
      return false;
    }
    functions[name]?.run();
    return true;
  }

  /**
   * @param shortcuts the shortcuts of the displayed page (their buttons show them), replacing those of the page before
   */
  public registerPageShortcuts(shortcuts: OitShortcuts): void {
    this.pageShortcuts = shortcuts;
  }

  /**
   * @param shortcuts the shortcuts of the menu bars (HOME, PRINT...), which work on every page
   */
  public registerMenuShortcuts(shortcuts: OitShortcuts): void {
    this.menuShortcuts = shortcuts;
  }

  /**
   * A shortcut key press: the displayed page's shortcut first, then the menu bars'
   * @param chord the shortcut, e.g. F8 or CTRL+P (LaptopKeyChords)
   * @returns whether a shortcut did something (false when there is none, or its button cannot be used now)
   */
  public runShortcut(chord: string): boolean {
    for (const shortcuts of [this.pageShortcuts, this.menuShortcuts]) {
      const shortcut: OitPageFunction | undefined = shortcuts[chord];
      if (shortcut !== undefined) {
        if (shortcut.available?.get() ?? true) {
          shortcut.run();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  private showPage(uri: string): void {
    // The new page registers its own functions and shortcuts while it renders
    this._pageFunctions.set({});
    this.pageShortcuts = {};
    this.updateNavigationAvailability();
    this.activeUri.set(this.parseUri(uri));
  }

  private updateNavigationAvailability(): void {
    this._backAvailable.set(this.canGoBack());
    this._forwardAvailable.set(this.canGoForward());
  }

  public resetFltOpsSession(): void {
    this.navigationStack[0] = 'flt-ops';
    this.navigationStack.length = 1;
    this.navigationForwardStack.length = 0;
    this.fltOpsApplications.reset();
    this.fullScreen.set(false);
    this.showPage('flt-ops');
    this.fltOpsLoginScreenVisible.set(true);
  }

  /** What the end of an OIS session clears, registered by the FLT OPS container (the laptop data) */
  private readonly fltOpsSessionExitHandlers: (() => void)[] = [];

  /**
   * Registers what an EXIT SESSION clears
   * @param handler called at each EXIT SESSION
   */
  public onFltOpsSessionExit(handler: () => void): void {
    this.fltOpsSessionExitHandlers.push(handler);
  }

  /**
   * EXIT SESSION of the FLT OPS MENU page or of the MENU button: back to the Login page, not possible while the FLT
   * FOLDER application is open (displayed or on the switching bar). The exit clears the FLT OPS STS page of the laptops
   * for the next flight: the registered handlers clear the laptop data.
   * @returns whether the session was exited (false while the FLT FOLDER is open)
   */
  public exitFltOpsSession(): boolean {
    if (this.activeUri.get().uri === FLT_FOLDER_URI || this.fltOpsApplications.isOpen(FLT_FOLDER_URI)) {
      return false;
    }
    this.fltOpsSessionExitHandlers.forEach((handler) => handler());
    this.resetFltOpsSession();
    return true;
  }

  /*
   * Whether one can navigate back
   */
  public canGoBack() {
    return this.navigationStack.length > 1;
  }

  /*
   * Whether one can navigate forward
   */
  public canGoForward() {
    return this.navigationForwardStack.length > 0;
  }
}
