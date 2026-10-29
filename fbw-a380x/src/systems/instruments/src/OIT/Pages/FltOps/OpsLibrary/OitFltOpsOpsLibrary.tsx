//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ClockEvents, ConsumerSubject, DisplayComponent, FSComponent, Subscription, VNode } from '@microsoft/msfs-sdk';
import { A380AocPrintEvents } from '@shared/AocPrintout';
import { AbstractOitFltOpsPageProps } from '../../../OIT';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { readLogbook } from '../../../System/FltOpsLogbookReader';
import { OPS_LIBRARY_TABS } from '../../../System/OpsLibrary/OpsLibrarySession';
import { unitPrintout } from '../../../System/OpsLibrary/OpsLibraryContent';
import { OpsLibraryContext } from './OpsLibraryContext';
import { OpsLibraryAboutTab } from './OpsLibraryAboutTab';
import { OpsLibraryBookmarksTab } from './OpsLibraryBookmarksTab';
import { OpsLibraryConsultationView } from './OpsLibraryConsultationView';
import { OpsLibraryEcamAlertsTab } from './OpsLibraryEcamAlertsTab';
import { OpsLibraryLibraryTab } from './OpsLibraryLibraryTab';
import { OpsLibraryLogbookStatusTab } from './OpsLibraryLogbookStatusTab';
import { OpsLibrarySearchTab } from './OpsLibrarySearchTab';
import { ecamUnitLines } from './OpsLibraryUnitView';
import { parseFwcText } from '../../../System/OpsLibrary/OpsLibraryProcedureLines';
import { PaneScope, PaneRule } from '../Shared/PaneLayout';
import './ops-library.scss';

interface OitFltOpsOpsLibraryProps extends AbstractOitFltOpsPageProps {}

/**
 * The panes with an explicit height, outermost first: the page never depends on the browser shrinking flex items, so a
 * long list cannot push the tab bar or the buttons off the screen.
 */
const OPS_PANE_RULES: PaneRule[] = [
  { selector: '.oit-ops', rule: 'to-page-bottom' },
  { selector: '.oit-ops-home', rule: 'fill' },
  { selector: '.oit-ops-home .mfd-top-tab-navigator-container', rule: 'fill' },
  { selector: '.oit-ops-home .mfd-top-tab-navigator-tab-content', rule: 'fill' },
  { selector: '.oit-ops-tab', rule: 'same' },
  { selector: '.oit-ops-search', rule: 'same' },
  { selector: '.oit-ops-search-left', rule: 'same' },
  { selector: '.oit-ops-search-right', rule: 'same' },
  { selector: '.oit-doc-results', rule: 'same' },
  { selector: '.oit-doc-results-list', rule: 'fill' },
  { selector: '.oit-ops-bookmarks', rule: 'same' },
  { selector: '.oit-ops-bookmarks-tree', rule: 'same' },
  { selector: '.oit-ops-bookmarks-tree .oit-doc-tree', rule: 'same' },
  { selector: '.oit-ops-consult-wrapper', rule: 'fill' },
  { selector: '.oit-ops-consult', rule: 'same' },
  { selector: '.oit-ops-body', rule: 'fill' },
  { selector: '.oit-ops-left', rule: 'same' },
  { selector: '.oit-ops-right', rule: 'same' },
  { selector: '.oit-ops-left .oit-doc-tree', rule: 'fill' },
  { selector: '.oit-ops-unit-wrapper', rule: 'fill' },
  { selector: '.oit-ops-unit', rule: 'fill' },
];

/** The panes that scroll, with the click-operated scroll bar */
const OPS_SCROLLERS = [
  '.oit-ops-tab',
  '.oit-ops-search-left',
  '.oit-doc-results-list',
  '.oit-doc-tree',
  '.oit-ops-unit',
];

/**
 * The OPS LIBRARY: the home page with its tabs (LIBRARY, ECAM ALERTS, LOGBOOK STATUS, SEARCH, BOOKMARKS, ABOUT) and the
 * consultation of a manual. The state lives in the laptop, so the application is as the crew left it when its key of
 * the switching bar is clicked again.
 */
export class OitFltOpsOpsLibrary extends DisplayComponent<OitFltOpsOpsLibraryProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly session = this.props.container.laptop.opsLibrary;

  private readonly performance = this.props.container.laptopData.performance;

  private readonly simTime = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime'), 0);

  private readonly consulting = this.session.consultation.manualId.map((id) => id !== null);

  private readonly consultationHidden = this.consulting.map((consulting) => !consulting);

  private readonly libraryContext: OpsLibraryContext = {
    session: this.session,
    fields: this.props.container,
    aircraftStatus: this.performance.aircraftStatus,
    logbookRows: this.session.logbookRows,
    synchroLogbook: () => {
      const logbook = readLogbook();
      this.session.setLogbook(logbook);
      this.performance.synchroLogbook(logbook);
    },
    now: () => this.simTime.get(),
  };

  private readonly printAvailable = this.session.consultation.nodeId.map(
    (nodeId) => nodeId !== null && this.session.consultation.openNode()?.kind === 'unit',
  );

  /** PRINT: the displayed unit on the pedestal printer */
  private print(): void {
    const unit = this.session.consultation.openNode();
    if (unit === undefined || unit.kind !== 'unit') {
      return;
    }
    const procedureLines = ecamUnitLines(unit, this.session).map((line) =>
      parseFwcText(line.text, 'white')
        .map((segments) => segments.map((segment) => segment.text).join(''))
        .join('\n'),
    );
    const printout = unitPrintout(unit, this.session.consultation.layer.get(), procedureLines);
    this.props.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', printout, true, false);
  }

  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  private paneScope: PaneScope | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // The first display of an FLT OPS application takes the eLogbook status, as the performance applications do
    if (!this.session.hasReadLogbook()) {
      this.session.setLogbook(readLogbook());
    }
    this.performance.onApplicationShown(readLogbook);

    this.props.uiService.registerPageFunctions({
      print: { run: () => this.print(), available: this.printAvailable },
      home: { run: () => this.session.consultation.close(), available: this.consulting },
    });
    this.props.uiService.registerPageShortcuts({
      'ALT+L': {
        run: () => this.addBookmark(),
        available: this.printAvailable,
      },
      'ALT+G': {
        run: () => this.session.showBookmarksTab(),
        available: this.consulting,
      },
    });

    this.subs.push(this.simTime, this.consulting, this.consultationHidden, this.printAvailable);
    this.paneScope = new PaneScope(this.rootRef.instance, OPS_PANE_RULES, OPS_SCROLLERS);
  }

  private addBookmark(): void {
    const unit = this.session.consultation.openNode();
    if (unit !== undefined && unit.kind === 'unit') {
      this.session.userData.addBookmark(unit.id);
    }
  }

  public destroy(): void {
    this.paneScope?.destroy();
    // The unit open when the page is left (CLOSE APPLICATION, the switching bar) is where the Interruption folder resumes
    const unit = this.session.consultation.openNode();
    if (unit !== undefined && unit.kind === 'unit') {
      this.session.userData.setInterruption(unit.id);
    }
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <div ref={this.rootRef} class="oit-page-container oit-ops">
        <div class={{ 'oit-ops-home': true, hidden: this.consulting }}>
          <TopTabNavigator
            pageTitles={[...OPS_LIBRARY_TABS]}
            selectedPageIndex={this.session.tabIndex}
            tabBarHeight={44}
            tabFontSize={19}
          >
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibraryLibraryTab ctx={this.libraryContext} />
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibraryEcamAlertsTab ctx={this.libraryContext} />
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibraryLogbookStatusTab ctx={this.libraryContext} />
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibrarySearchTab ctx={this.libraryContext} />
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibraryBookmarksTab ctx={this.libraryContext} />
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 1 1 auto; min-height: 0;">
              <OpsLibraryAboutTab ctx={this.libraryContext} oisVersion={this.props.container.laptop.oisVersion} />
            </TopTabNavigatorPage>
          </TopTabNavigator>
        </div>
        <div class={{ 'oit-ops-consult-wrapper': true, hidden: this.consultationHidden }}>
          <OpsLibraryConsultationView ctx={this.libraryContext} />
        </div>
      </div>
    );
  }
}
