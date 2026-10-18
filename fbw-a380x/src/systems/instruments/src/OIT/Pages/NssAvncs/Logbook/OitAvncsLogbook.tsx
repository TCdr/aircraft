//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { OitAvncsSubHeader } from '../OitAvncsSubHeader';
import { OitUriInformation } from '../../../OitUiService';
import { avncsLogbookPageForUrl } from '../../../OitPageDirectory';
import { OitAvncsLogbookDialog } from './OitAvncsLogbookDialog';
import { LogbookClickable } from './LogbookWidgets';
import { LOGBOOK_URI, isPrintableLogbookPage, logbookPrintout, syncDialog, syncResultDialog } from './LogbookFlows';

import './logbook.scss';

interface OitAvncsLogbookProps extends AbstractOitAvncsPageProps {}

const TABS = [
  { title: 'STATUS', uri: LOGBOOK_URI.status },
  { title: 'LOGBOOK ENTRY', uri: LOGBOOK_URI.entry },
  { title: 'HISTORY', uri: LOGBOOK_URI.history },
  { title: 'FLIGHT DATA', uri: LOGBOOK_URI.flightData },
];

/**
 * The tab of a logbook page: the item lists, the release and the reports belong to the STATUS page.
 * @param uri the page URI
 * @returns the tab index
 */
function tabOf(uri: string): number {
  if (uri.startsWith(LOGBOOK_URI.entry)) {
    return 1;
  }
  if (uri.startsWith(LOGBOOK_URI.history)) {
    return 2;
  }
  if (uri.startsWith(LOGBOOK_URI.flightData)) {
    return 3;
  }
  return 0;
}

/**
 * The technical logbook (eLogbook) application of the NSS AVNCS side: the STATUS, LOGBOOK ENTRY, HISTORY and FLIGHT
 * DATA pages and their sub-pages, with the LOGBOOK message windows. Opening it asks for the personal identification once
 * per NSS AVNCS log-on.
 */
export class OitAvncsLogbook extends DestroyableComponent<OitAvncsLogbookProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly activePageRef = FSComponent.createRef<HTMLDivElement>();

  private activePage: VNode | null = null;

  private readonly selectedTab = Subject.create(0);

  private readonly tabSelected = TABS.map((_, index) => this.selectedTab.map((t) => t === index));

  private readonly printDisabled = this.props.uiService.activeUri.map((uri) => !isPrintableLogbookPage(uri.uri));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      this.printDisabled,
      ...this.tabSelected,
      this.props.uiService.activeUri.sub((uri) => this.activeUriChanged(uri), true),
      this.props.uiService.nssAvncsLoginScreenVisible.sub((visible) => {
        if (visible) {
          this.store.authenticated.set(false);
        }
      }),
      this.store.syncInProgress.sub((operation) => {
        if (operation !== null) {
          this.store.dialog.set(syncDialog(operation));
        } else if (this.store.dialog.get()?.buttons.length === 0) {
          this.store.dialog.set(null);
        }
      }, true),
      this.store.syncResult.sub((result) => {
        if (result !== null) {
          this.store.syncResult.set(null);
          const dialog = syncResultDialog(result);
          if (dialog) {
            this.store.dialog.set(dialog);
          }
        }
      }, true),
    );

    if (!this.store.authenticated.get() && this.store.syncInProgress.get() === null) {
      this.store.dialog.set({
        kind: 'Information',
        lines: ['Authentication required'],
        buttons: [
          { label: 'OK', action: () => this.store.authenticated.set(true) },
          { label: 'CANCEL', action: () => this.props.uiService.navigateTo('nss-avncs') },
        ],
        identification: 'authentication',
      });
    }
  }

  destroy(): void {
    this.destroyActivePage();
    // A message of this OIT does not outlive the application page, except a synchronisation in progress
    if (this.store.syncInProgress.get() === null) {
      this.store.dialog.set(null);
    }
    super.destroy();
  }

  private destroyActivePage(): void {
    const container = this.activePageRef.getOrDefault();
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    if (this.activePage && this.activePage.instance instanceof DisplayComponent) {
      this.activePage.instance.destroy();
    }
    this.activePage = null;
  }

  private activeUriChanged(uri: OitUriInformation): void {
    if (!uri.uri.startsWith(LOGBOOK_URI.application)) {
      return;
    }
    const pageUri = uri.uri === LOGBOOK_URI.application ? LOGBOOK_URI.status : uri.uri;
    this.selectedTab.set(tabOf(pageUri));
    this.destroyActivePage();
    this.activePage = avncsLogbookPageForUrl(pageUri, this.props.bus, this.props.uiService, this.props.container);
    FSComponent.render(this.activePage, this.activePageRef.getOrDefault());
  }

  private print(): void {
    const printout = logbookPrintout(this.store, this.props.uiService.activeUri.get().uri);
    if (printout !== null) {
      this.store.print(printout);
    }
  }

  render(): VNode {
    return (
      <>
        <OitAvncsSubHeader
          title={'LOGBOOK'}
          uiService={this.props.uiService}
          onPrint={() => this.print()}
          printDisabled={this.printDisabled}
          onClose={() => this.props.uiService.navigateTo('nss-avncs')}
        />
        <div class="oit-page-container">
          <div class="oit-logbook-app">
            <div class="oit-logbook-tabs">
              {TABS.map((tab, index) => (
                <LogbookClickable
                  class={{ 'oit-logbook-tab': true, selected: this.tabSelected[index] }}
                  onClick={() => this.props.uiService.navigateTo(tab.uri)}
                >
                  {tab.title}
                </LogbookClickable>
              ))}
            </div>
            <div ref={this.activePageRef} class="oit-logbook-content" />
            <OitAvncsLogbookDialog store={this.store} container={this.props.container} />
          </div>
        </div>
      </>
    );
  }
}
