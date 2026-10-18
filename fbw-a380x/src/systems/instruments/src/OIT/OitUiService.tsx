//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

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

/*
 * Handles navigation (and potentially other aspects) for OIT pages
 */
export class OitUiService {
  constructor(public captOrFo: 'CAPT' | 'FO') {}

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
   * @param uri The URI to navigate to. Use URI 'back' for returning to previous page.
   * Sometimes (e.g. for nss-avncs/company-com), another local navigator will handle the sub-navigation.
   */
  public navigateTo(uri: string): void {
    let nextUri: string;

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

    const parsedUri = this.parseUri(nextUri);
    this.activeUri.set(parsedUri);
  }

  public resetFltOpsSession(): void {
    this.navigationStack[0] = 'flt-ops';
    this.navigationStack.length = 1;
    this.navigationForwardStack.length = 0;
    this.activeUri.set(this.parseUri('flt-ops'));
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
   * EXIT SESSION of the FLT OPS MENU page or of the MENU button (A380 FCOM DSC-46-20-50-10, a380_fcom.txt
   * l.105900-105907): "exit the current session and return to the Login page", and "The flight crew cannot exit the OIS
   * session when the FLT FOLDER application is open". The exit "initializes again the FLT OPS STS page on the laptops
   * for the next flight" (PRO-NOR-SOP, l.127590-127591): the registered handlers clear the laptop data.
   * @returns whether the session was exited (false while the FLT FOLDER is open)
   */
  public exitFltOpsSession(): boolean {
    if (this.activeUri.get().uri === 'flt-ops/flt-folder') {
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
